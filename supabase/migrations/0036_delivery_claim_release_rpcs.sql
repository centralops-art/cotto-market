-- 0036: race-safe claim/release RPCs for the delivery claim lifecycle
-- (Phase 8). Both are SECURITY DEFINER, callable directly by a driver's own
-- JWT via supabase.rpc(...) -- there is intentionally no client-facing
-- UPDATE grant on vendor_suborders for drivers (see
-- vendor_suborders_update_cook_or_admin, migration 0010), so these
-- functions are the only path to these writes.

create or replace function public.claim_delivery(so_id uuid)
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

  -- Resolve the cooking vendor + region + delivery fee for this suborder.
  -- These fields never change after checkout, so a plain (non-locking) read
  -- here is safe -- the only field that can race is `status`, which the
  -- conditional UPDATE below handles atomically.
  select so.vendor_id, cv.region_id, so.delivery_fee_cents, r.delivery_conflict_rule, r.delivery_payout_split_pct
    into v_cook_vendor_id, v_cook_region_id, v_delivery_fee_cents, v_conflict_rule, v_split_pct
  from public.vendor_suborders so
  join public.vendors cv on cv.id = so.vendor_id
  join public.regions r on r.id = cv.region_id
  where so.id = so_id;

  if v_cook_vendor_id is null then
    raise exception 'Suborder not found';
  end if;

  -- Self-claim block (defense-in-depth: can_view_pool_suborder already keeps
  -- this off a driver's own pool list, but a client could call this RPC
  -- directly with an arbitrary uuid).
  if v_driver_vendor_id = v_cook_vendor_id then
    raise exception 'You cannot claim your own order';
  end if;

  if v_driver_region_id is distinct from v_cook_region_id then
    raise exception 'This order is outside your delivery region';
  end if;

  if v_conflict_rule = 'hard_block' then
    select count(*) into v_open_kitchen_orders
    from public.vendor_suborders
    where vendor_id = v_driver_vendor_id
      and status in ('received', 'confirmed', 'preparing');
    if v_open_kitchen_orders > 0 then
      raise exception 'You have an open kitchen order in progress -- this region requires you to finish it before claiming a delivery';
    end if;
  end if;

  -- The atomic, race-safe step. A concurrent claim_delivery() call on the
  -- same so_id blocks on Postgres's row lock for this UPDATE until this
  -- transaction commits or rolls back, then re-evaluates `status = 'ready'`
  -- against the now-committed row and finds zero matching rows -- FOUND is
  -- false below, and it loses cleanly with a clear error instead of a raw
  -- unique-violation. delivery_claims_one_active_per_suborder_uidx (0007) is
  -- the second, defense-in-depth backstop for this same invariant.
  update public.vendor_suborders
  set status = 'claimed'
  where id = so_id
    and status = 'ready'
    and fulfillment = 'delivery';

  if not found then
    raise exception 'This order was just claimed by another driver';
  end if;

  -- Mirrors packages/shared/src/fees.ts::calculateDeliverySplit exactly
  -- (round-half-up on cents, matching percentOfCents's Math.round). Locked
  -- in using the region's CURRENT split -- not the checkout-time value.
  v_driver_payout_cents := round(v_delivery_fee_cents * v_split_pct / 100.0)::integer;
  v_cotto_fee_cents := v_delivery_fee_cents - v_driver_payout_cents;

  insert into public.delivery_claims (vendor_suborder_id, driver_vendor_id, driver_payout_cents, cotto_delivery_fee_cents)
  values (so_id, v_driver_vendor_id, v_driver_payout_cents, v_cotto_fee_cents)
  returning * into v_claim;

  insert into public.audit_log (actor_profile_id, action, target_table, target_id, metadata)
  values (
    auth.uid(), 'delivery_claimed', 'vendor_suborders', so_id,
    jsonb_build_object('driver_vendor_id', v_driver_vendor_id, 'driver_payout_cents', v_driver_payout_cents, 'claim_id', v_claim.id)
  );

  return v_claim;
end;
$$;

grant execute on function public.claim_delivery(uuid) to authenticated;

-- Voluntary driver release (before pickup) AND the stuck-claim watchdog's
-- auto-release both go through this one function. Differentiated internally
-- by auth.role(): a driver's own JWT hits the ownership check below; the
-- watchdog cron calls this via the service-role client (auth.role() =
-- 'service_role'), which skips it -- there's no auth.uid() to check and the
-- caller is trusted. Single source of truth, per the schema's own intent.
create or replace function public.release_delivery_claim(so_id uuid, reason text)
returns public.delivery_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.delivery_claims;
  v_status public.suborder_status;
begin
  select dc.* into v_claim
  from public.delivery_claims dc
  where dc.vendor_suborder_id = so_id and dc.released_at is null
  for update;

  if v_claim.id is null then
    raise exception 'No active claim on this order';
  end if;

  if auth.role() <> 'service_role' then
    if not exists (
      select 1 from public.vendors v
      where v.id = v_claim.driver_vendor_id and v.owner_profile_id = auth.uid()
    ) then
      raise exception 'You do not have an active claim on this order';
    end if;
  end if;

  select status into v_status from public.vendor_suborders where id = so_id;
  -- Only legal from claimed/en_route_to_pickup -- once picked_up, the food
  -- has physically left the kitchen, so "re-entering the pool" doesn't make
  -- sense. A claim stuck after picked_up is a different, harder problem
  -- (see the watchdog's notify-only handling for those two statuses) --
  -- explicitly NOT auto-recoverable this phase.
  if v_status not in ('claimed', 'en_route_to_pickup') then
    raise exception 'This claim can no longer be released -- the order has already been picked up';
  end if;

  update public.delivery_claims
  set released_at = now(), release_reason = reason
  where id = v_claim.id
  returning * into v_claim;

  -- Reverts to the pool with a fresh ready_at (a fresh unclaimed countdown
  -- is more correct than continuing against the original ready timestamp
  -- once a driver has already wasted some of that window) and increments
  -- delivery_cycle (per its own column comment in migration 0006) so Phase
  -- 9's T1/T2/T3 clocks -- when built -- correctly scope to the new cycle.
  update public.vendor_suborders
  set status = 'ready', ready_at = now(), delivery_cycle = delivery_cycle + 1
  where id = so_id;

  insert into public.audit_log (actor_profile_id, action, target_table, target_id, reason, metadata)
  values (
    case when auth.role() = 'service_role' then null else auth.uid() end,
    case when auth.role() = 'service_role' then 'delivery_claim_auto_released' else 'delivery_claim_released' end,
    'vendor_suborders', so_id, reason,
    jsonb_build_object('driver_vendor_id', v_claim.driver_vendor_id, 'claim_id', v_claim.id)
  );

  return v_claim;
end;
$$;

grant execute on function public.release_delivery_claim(uuid, text) to authenticated, service_role;
