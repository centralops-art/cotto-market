-- 0060: family / team-member drivers.
--
-- Home cooks must be able to have trusted family members deliver their
-- orders (Illinois cottage food law requires the operator's own household to
-- deliver, not a third party). Team members stay bio-only with no login of
-- their own (see 0002's comment) -- they deliver by signing in to the vendor
-- account. What this migration adds is:
--
--   1. vendor_team_drivers: a per-team-member driver record (license front/
--      back, license expiry, vehicle, insurance attestation, agreement),
--      reviewed and approved by an ops admin, same as the owner's own
--      vendor_delivery_profiles application.
--   2. delivery_claims.driver_team_member_id + driver_display_name: who is
--      actually delivering a claim, picked at claim time (default: the
--      account owner), changeable until pickup. The name is snapshotted so
--      the record survives the team member later being removed.
--   3. claim_delivery() gains an optional delivering_member_id argument, and
--      skips the region's hard_block kitchen-conflict rule when a vendor
--      claims their OWN order (otherwise a family member could never deliver
--      while the cook is still cooking -- the whole point of this feature).
--   4. set_delivery_driver(): change who is delivering before pickup.
--   5. suborder_driver_display_name() prefers the snapshotted name, so the
--      customer sees who is actually coming.
--
-- License images reuse the existing private drivers-licenses bucket under
-- `{owner_profile_id}/team/{team_member_id}/...`, which 0032's owner-folder
-- policies already cover.

create type public.team_driver_status as enum ('pending_review', 'active', 'rejected', 'suspended');

create table public.vendor_team_drivers (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null unique references public.vendor_team_members (id) on delete cascade,
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  status public.team_driver_status not null default 'pending_review',
  drivers_license_front_url text not null,
  drivers_license_back_url text not null,
  drivers_license_expires_on date not null,
  vehicle_type public.vehicle_type not null,
  insurance_attested_at timestamptz not null,
  delivery_agreement_accepted_at timestamptz not null,
  drivers_license_expiry_warned_at timestamptz,
  rejected_reason text,
  suspended_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vendor_team_drivers_vendor_id_idx on public.vendor_team_drivers (vendor_id);
create index vendor_team_drivers_status_idx on public.vendor_team_drivers (status);

create trigger set_updated_at before update on public.vendor_team_drivers
  for each row execute function public.set_updated_at();

-- vendor_id is always derived from the team member, never trusted from the
-- client -- RLS's WITH CHECK (owns_vendor(vendor_id)) then runs against the
-- derived value, so nobody can attach a driver record to another storefront's
-- team member.
--
-- Non-admin writes are always a (re)submission for review: an owner can never
-- self-approve or clear a suspension, and changing an approved record's
-- license/vehicle sends it back to review.
create or replace function public.guard_vendor_team_driver_write()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  select tm.vendor_id into new.vendor_id
  from public.vendor_team_members tm
  where tm.id = new.team_member_id;

  if new.vendor_id is null then
    raise exception 'Team member not found';
  end if;

  if tg_op = 'UPDATE' and new.team_member_id is distinct from old.team_member_id then
    raise exception 'A driver record cannot be moved to a different team member';
  end if;

  if auth.role() = 'service_role' or public.is_ops_admin() then
    return new;
  end if;

  new.status := 'pending_review';
  new.rejected_reason := null;
  new.suspended_reason := null;
  new.drivers_license_expiry_warned_at := null;
  return new;
end;
$$;

create trigger guard_vendor_team_driver_write before insert or update on public.vendor_team_drivers
  for each row execute function public.guard_vendor_team_driver_write();

-- Private (license images, expiry): owner + admin only. Deliberately NOT
-- folded into vendor_team_members, whose select policy is public.
alter table public.vendor_team_drivers enable row level security;

create policy vendor_team_drivers_select on public.vendor_team_drivers
  for select to authenticated
  using (public.owns_vendor(vendor_id) or public.is_ops_admin());

create policy vendor_team_drivers_insert on public.vendor_team_drivers
  for insert to authenticated
  with check (public.owns_vendor(vendor_id) or public.is_ops_admin());

create policy vendor_team_drivers_update on public.vendor_team_drivers
  for update to authenticated
  using (public.owns_vendor(vendor_id) or public.is_ops_admin())
  with check (public.owns_vendor(vendor_id) or public.is_ops_admin());

create policy vendor_team_drivers_delete on public.vendor_team_drivers
  for delete to authenticated
  using (public.owns_vendor(vendor_id) or public.is_ops_admin());

-- 0010's default privileges cover the table grant; stated explicitly anyway.
grant select, insert, update, delete on public.vendor_team_drivers to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Who is delivering a claim
-- ---------------------------------------------------------------------------

alter table public.delivery_claims
  add column driver_team_member_id uuid references public.vendor_team_members (id) on delete set null,
  add column driver_display_name text;

comment on column public.delivery_claims.driver_team_member_id is
  'The team member (family) delivering this claim; null = the vendor account owner.';
comment on column public.delivery_claims.driver_display_name is
  'Snapshot of the team member''s display name at claim/change time; null = owner (resolved live).';

-- Returns the display name of an ACTIVE, unexpired team driver belonging to
-- the given vendor, or null. Internal helper for the two RPCs below.
create or replace function public.approved_team_driver_name(p_vendor_id uuid, p_team_member_id uuid)
returns text
language sql security definer set search_path = public stable
as $$
  select tm.display_name
  from public.vendor_team_members tm
  join public.vendor_team_drivers td on td.team_member_id = tm.id
  where tm.id = p_team_member_id
    and tm.vendor_id = p_vendor_id
    and td.status = 'active'
    and td.drivers_license_expires_on >= current_date;
$$;

revoke execute on function public.approved_team_driver_name(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- claim_delivery: new optional argument. Dropped and recreated (not
-- overloaded) -- a second claim_delivery(uuid, uuid default null) next to the
-- old claim_delivery(uuid) would make every one-argument call ambiguous.
-- Already-installed app builds call it with only so_id, which still works.
-- Body is 0055's verbatim apart from the lines marked "0060".
-- ---------------------------------------------------------------------------

drop function public.claim_delivery(uuid);

create function public.claim_delivery(so_id uuid, delivering_member_id uuid default null)
returns public.delivery_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_vendor_id uuid;
  v_driver_region_id uuid;
  v_cook_vendor_id uuid;
  v_cook_region_id uuid;
  v_conflict_rule public.delivery_conflict_rule;
  v_split_pct numeric;
  v_delivery_fee_cents integer;
  v_driver_payout_cents integer;
  v_cotto_fee_cents integer;
  v_open_kitchen_orders integer;
  v_claim public.delivery_claims;
  v_delivery_cycle integer;
  v_pending_offer boolean;
  v_member_name text; -- 0060
begin
  -- Caller must own an on-duty, delivery-active vendor.
  select v.id, v.region_id
    into v_driver_vendor_id, v_driver_region_id
  from public.vendors v
  join public.vendor_delivery_profiles vdp on vdp.vendor_id = v.id
  where v.owner_profile_id = auth.uid()
    and vdp.status = 'delivery_active'
    and vdp.on_duty = true
  limit 1;

  if v_driver_vendor_id is null then
    raise exception 'You must be an on-duty, delivery-active driver to claim deliveries';
  end if;

  -- 0060: validate the chosen team member before touching anything.
  if delivering_member_id is not null then
    v_member_name := public.approved_team_driver_name(v_driver_vendor_id, delivering_member_id);
    if v_member_name is null then
      raise exception 'That team member isn''t approved to deliver for your storefront';
    end if;
  end if;

  select so.vendor_id, cv.region_id, so.delivery_fee_cents, r.delivery_conflict_rule, r.delivery_payout_split_pct, so.delivery_cycle
    into v_cook_vendor_id, v_cook_region_id, v_delivery_fee_cents, v_conflict_rule, v_split_pct, v_delivery_cycle
  from public.vendor_suborders so
  join public.vendors cv on cv.id = so.vendor_id
  join public.regions r on r.id = cv.region_id
  where so.id = so_id;

  if v_cook_vendor_id is null then
    raise exception 'Suborder not found';
  end if;

  -- Self-claim block removed 2026-08-15 (migration 0055): Illinois cottage
  -- food law requires vendors to be able to deliver their own orders.

  if v_driver_region_id is distinct from v_cook_region_id then
    raise exception 'This order is outside your delivery region';
  end if;

  -- 0060: the kitchen-conflict rule doesn't apply to a vendor delivering
  -- their own order -- that's typically a family member driving while the
  -- cook keeps cooking.
  if v_conflict_rule = 'hard_block' and v_cook_vendor_id <> v_driver_vendor_id then
    select count(*) into v_open_kitchen_orders
    from public.vendor_suborders
    where vendor_id = v_driver_vendor_id
      and status in ('received', 'confirmed', 'preparing');
    if v_open_kitchen_orders > 0 then
      raise exception 'You have an open kitchen order in progress -- this region requires you to finish it before claiming a delivery';
    end if;
  end if;

  update public.vendor_suborders
  set status = 'claimed'
  where id = so_id
    and status = 'ready'
    and fulfillment = 'delivery';

  if not found then
    raise exception 'This order was just claimed by another driver';
  end if;

  v_driver_payout_cents := round(v_delivery_fee_cents * v_split_pct / 100.0)::integer;
  v_cotto_fee_cents := v_delivery_fee_cents - v_driver_payout_cents;

  insert into public.delivery_claims (
    vendor_suborder_id, driver_vendor_id, driver_payout_cents, cotto_delivery_fee_cents,
    driver_team_member_id, driver_display_name -- 0060
  )
  values (
    so_id, v_driver_vendor_id, v_driver_payout_cents, v_cotto_fee_cents,
    delivering_member_id, v_member_name -- 0060
  )
  returning * into v_claim;

  insert into public.audit_log (actor_profile_id, action, target_table, target_id, metadata)
  values (
    auth.uid(), 'delivery_claimed', 'vendor_suborders', so_id,
    jsonb_build_object(
      'driver_vendor_id', v_driver_vendor_id,
      'driver_payout_cents', v_driver_payout_cents,
      'claim_id', v_claim.id,
      'driver_team_member_id', delivering_member_id, -- 0060
      'driver_display_name', v_member_name -- 0060
    )
  );

  select exists (
    select 1 from public.delivery_dispatch_events e
    where e.vendor_suborder_id = so_id
      and e.event_type = 't2_customer_offer_sent'
      and (e.payload->>'delivery_cycle')::integer = v_delivery_cycle
  ) and not exists (
    select 1 from public.delivery_dispatch_events e
    where e.vendor_suborder_id = so_id
      and e.event_type in ('customer_chose_pickup', 'customer_chose_refund', 't3_auto_refunded')
      and (e.payload->>'delivery_cycle')::integer = v_delivery_cycle
  ) into v_pending_offer;

  if v_pending_offer then
    insert into public.delivery_dispatch_events (vendor_suborder_id, event_type, payload)
    values (so_id, 'claim_cancelled_pending_offer', jsonb_build_object('delivery_cycle', v_delivery_cycle, 'claim_id', v_claim.id));
  end if;

  return v_claim;
end;
$$;

grant execute on function public.claim_delivery(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- set_delivery_driver: change who is delivering, until the food is picked up.
-- null = the account owner.
-- ---------------------------------------------------------------------------

create or replace function public.set_delivery_driver(so_id uuid, delivering_member_id uuid default null)
returns public.delivery_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.delivery_claims;
  v_status public.suborder_status;
  v_member_name text;
begin
  select dc.* into v_claim
  from public.delivery_claims dc
  join public.vendors v on v.id = dc.driver_vendor_id
  where dc.vendor_suborder_id = so_id
    and dc.released_at is null
    and v.owner_profile_id = auth.uid();

  if v_claim.id is null then
    raise exception 'You don''t have an active claim on this delivery';
  end if;

  select so.status into v_status from public.vendor_suborders so where so.id = so_id;
  if v_status not in ('claimed', 'en_route_to_pickup') then
    raise exception 'The driver can only be changed before pickup';
  end if;

  if delivering_member_id is not null then
    v_member_name := public.approved_team_driver_name(v_claim.driver_vendor_id, delivering_member_id);
    if v_member_name is null then
      raise exception 'That team member isn''t approved to deliver for your storefront';
    end if;
  end if;

  update public.delivery_claims
  set driver_team_member_id = delivering_member_id,
      driver_display_name = v_member_name
  where id = v_claim.id
  returning * into v_claim;

  insert into public.audit_log (actor_profile_id, action, target_table, target_id, metadata)
  values (
    auth.uid(), 'delivery_driver_changed', 'vendor_suborders', so_id,
    jsonb_build_object('claim_id', v_claim.id, 'driver_team_member_id', delivering_member_id, 'driver_display_name', v_member_name)
  );

  return v_claim;
end;
$$;

grant execute on function public.set_delivery_driver(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Customer-facing driver name: the team member when one was picked.
-- ---------------------------------------------------------------------------

create or replace function public.suborder_driver_display_name(so_id uuid)
returns text
language sql security definer set search_path = public stable
as $$
  select coalesce(dc.driver_display_name, p.full_name)
  from public.delivery_claims dc
  join public.vendors v on v.id = dc.driver_vendor_id
  join public.profiles p on p.id = v.owner_profile_id
  where dc.vendor_suborder_id = so_id
    and dc.released_at is null
    and (
      public.is_customer_of_order((select order_id from public.vendor_suborders where id = so_id))
      or public.is_ops_admin()
    )
  limit 1;
$$;
