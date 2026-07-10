-- 0010: RLS helper functions, enablement, and policies for every table.
-- Ops admins reach full access via the admin app's service-role key, which
-- bypasses RLS entirely -- the is_ops_admin() checks below are defense in depth
-- for any authenticated-session path the admin app also uses.

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so ownership checks don't recurse into
-- the very policies that call them).
-- ---------------------------------------------------------------------------

create or replace function public.is_ops_admin()
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('ops_admin', 'ops_owner')
  );
$$;

create or replace function public.owns_vendor(target_vendor_id uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.vendors
    where id = target_vendor_id and owner_profile_id = auth.uid()
  );
$$;

create or replace function public.is_customer_of_order(target_order_id uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.orders where id = target_order_id and customer_profile_id = auth.uid()
  );
$$;

create or replace function public.is_active_driver_for_suborder(so_id uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.delivery_claims dc
    join public.vendors v on v.id = dc.driver_vendor_id
    where dc.vendor_suborder_id = so_id
      and dc.released_at is null
      and v.owner_profile_id = auth.uid()
  );
$$;

-- Visibility rule for the "Available" delivery pool (spec 3.6): unclaimed,
-- ready, delivery suborders, visible to on-duty delivery_active vendors in the
-- same region, excluding the cooking vendor itself (self-claim block).
create or replace function public.can_view_pool_suborder(so_id uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1
    from public.vendor_suborders so
    join public.vendors cooking_vendor on cooking_vendor.id = so.vendor_id
    join public.vendors driver_vendor on driver_vendor.owner_profile_id = auth.uid()
    join public.vendor_delivery_profiles vdp on vdp.vendor_id = driver_vendor.id
    where so.id = so_id
      and so.fulfillment = 'delivery'
      and so.status = 'ready'
      and driver_vendor.id <> cooking_vendor.id
      and driver_vendor.region_id = cooking_vendor.region_id
      and vdp.status = 'delivery_active'
      and vdp.on_duty = true
      and not exists (
        select 1 from public.delivery_claims dc
        where dc.vendor_suborder_id = so.id and dc.released_at is null
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Guard triggers: RLS is row-level, not column-level, so a handful of
-- self-service update paths (publish toggle, delivery-mode toggle, profile
-- edit) need an extra trigger to stop an owner from smuggling admin-only
-- field changes (status approval, fee overrides, role) through the same
-- UPDATE. auth.role() = 'service_role' always short-circuits these -- the
-- admin app's backend is trusted.
-- ---------------------------------------------------------------------------

create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and auth.role() <> 'service_role'
     and not public.is_ops_admin() then
    raise exception 'Only an ops admin can change profile role';
  end if;
  return new;
end;
$$;

create trigger guard_profile_role_change before update on public.profiles
  for each row execute function public.guard_profile_role_change();

create or replace function public.guard_vendor_owner_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.is_ops_admin() then
    return new;
  end if;

  if new.platform_fee_pct is distinct from old.platform_fee_pct
     or new.free_trial_ends_at is distinct from old.free_trial_ends_at
     or new.owner_profile_id is distinct from old.owner_profile_id
     or new.region_id is distinct from old.region_id then
    raise exception 'Only an ops admin can change platform_fee_pct, free_trial_ends_at, owner_profile_id, or region_id';
  end if;

  if new.status is distinct from old.status
     and not (old.status in ('active', 'unpublished') and new.status in ('active', 'unpublished')) then
    raise exception 'Vendors can only toggle status between active and unpublished; approval/suspension is admin-only';
  end if;

  return new;
end;
$$;

create trigger guard_vendor_owner_update before update on public.vendors
  for each row execute function public.guard_vendor_owner_update();

create or replace function public.guard_delivery_profile_owner_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.is_ops_admin() then
    return new;
  end if;

  -- Owners may (re)submit for review at any time, but may not self-approve
  -- (delivery_active) or clear a suspension.
  if new.status is distinct from old.status and new.status <> 'delivery_pending_review' then
    raise exception 'Only an ops admin can set vendor_delivery_profiles.status to %', new.status;
  end if;

  return new;
end;
$$;

create trigger guard_delivery_profile_owner_update before update on public.vendor_delivery_profiles
  for each row execute function public.guard_delivery_profile_owner_update();

create or replace function public.guard_review_not_self()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if exists (
    select 1 from public.vendors v where v.id = new.vendor_id and v.owner_profile_id = new.customer_profile_id
  ) then
    raise exception 'Vendors cannot review their own storefront';
  end if;
  return new;
end;
$$;

create trigger guard_review_not_self before insert or update on public.reviews
  for each row execute function public.guard_review_not_self();

-- ---------------------------------------------------------------------------
-- Base table-level grants. Recent Supabase versions do not auto-expose newly
-- created tables to anon/authenticated (locally or on hosted projects) --
-- without this, RLS policies below would have nothing to apply to, since
-- Postgres requires both a table-level privilege AND a satisfied row policy.
-- RLS remains the real access boundary; this just makes the grant explicit and
-- portable to the hosted project instead of relying on a local-only CLI flag.
-- ---------------------------------------------------------------------------

-- service_role has BYPASSRLS (skips policy checks) but is still an ordinary
-- Postgres role for GRANT purposes -- it needs the same explicit table-level
-- privileges, or every service-role query (admin app backend, edge functions,
-- cron jobs) fails with "permission denied" despite RLS being irrelevant to it.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere.
-- ---------------------------------------------------------------------------

alter table public.regions enable row level security;
alter table public.profiles enable row level security;
alter table public.vendors enable row level security;
alter table public.vendor_team_members enable row level security;
alter table public.vendor_delivery_profiles enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.favorites enable row level security;
alter table public.waitlist_entries enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.vendor_suborders enable row level security;
alter table public.order_items enable row level security;
alter table public.delivery_claims enable row level security;
alter table public.delivery_dispatch_events enable row level security;
alter table public.reviews enable row level security;
alter table public.review_items enable row level security;
alter table public.messages enable row level security;
alter table public.audit_log enable row level security;
alter table public.system_settings enable row level security;

-- ---------------------------------------------------------------------------
-- regions
-- ---------------------------------------------------------------------------

create policy regions_select on public.regions
  for select to public
  using (is_active or public.is_ops_admin());

create policy regions_admin_write on public.regions
  for all to authenticated
  using (public.is_ops_admin())
  with check (public.is_ops_admin());

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create policy profiles_select_own_or_admin on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_ops_admin());

create policy profiles_update_own_or_admin on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_ops_admin())
  with check (id = auth.uid() or public.is_ops_admin());

-- ---------------------------------------------------------------------------
-- vendors
-- ---------------------------------------------------------------------------

create policy vendors_select on public.vendors
  for select to public
  using (status = 'active' or owner_profile_id = auth.uid() or public.is_ops_admin());

create policy vendors_insert_own on public.vendors
  for insert to authenticated
  with check (owner_profile_id = auth.uid());

create policy vendors_update_own_or_admin on public.vendors
  for update to authenticated
  using (owner_profile_id = auth.uid() or public.is_ops_admin())
  with check (owner_profile_id = auth.uid() or public.is_ops_admin());

-- ---------------------------------------------------------------------------
-- vendor_team_members (bio-only; see 0002 comment)
-- ---------------------------------------------------------------------------

create policy vendor_team_members_select on public.vendor_team_members
  for select to public
  using (
    public.owns_vendor(vendor_id) or public.is_ops_admin()
    or exists (select 1 from public.vendors v where v.id = vendor_id and v.status = 'active')
  );

create policy vendor_team_members_write on public.vendor_team_members
  for all to authenticated
  using (public.owns_vendor(vendor_id) or public.is_ops_admin())
  with check (public.owns_vendor(vendor_id) or public.is_ops_admin());

-- ---------------------------------------------------------------------------
-- vendor_delivery_profiles (contains DL image URLs -- not public)
-- ---------------------------------------------------------------------------

create policy vendor_delivery_profiles_select on public.vendor_delivery_profiles
  for select to authenticated
  using (public.owns_vendor(vendor_id) or public.is_ops_admin());

create policy vendor_delivery_profiles_insert on public.vendor_delivery_profiles
  for insert to authenticated
  with check (public.owns_vendor(vendor_id));

create policy vendor_delivery_profiles_update on public.vendor_delivery_profiles
  for update to authenticated
  using (public.owns_vendor(vendor_id) or public.is_ops_admin())
  with check (public.owns_vendor(vendor_id) or public.is_ops_admin());

-- ---------------------------------------------------------------------------
-- menu_categories / menu_items
-- ---------------------------------------------------------------------------

create policy menu_categories_select on public.menu_categories
  for select to public
  using (
    public.owns_vendor(vendor_id) or public.is_ops_admin()
    or exists (select 1 from public.vendors v where v.id = vendor_id and v.status = 'active')
  );

create policy menu_categories_write on public.menu_categories
  for all to authenticated
  using (public.owns_vendor(vendor_id) or public.is_ops_admin())
  with check (public.owns_vendor(vendor_id) or public.is_ops_admin());

create policy menu_items_select on public.menu_items
  for select to public
  using (
    public.owns_vendor(vendor_id) or public.is_ops_admin()
    or exists (select 1 from public.vendors v where v.id = vendor_id and v.status = 'active')
  );

create policy menu_items_write on public.menu_items
  for all to authenticated
  using (public.owns_vendor(vendor_id) or public.is_ops_admin())
  with check (public.owns_vendor(vendor_id) or public.is_ops_admin());

-- ---------------------------------------------------------------------------
-- favorites / waitlist_entries
-- ---------------------------------------------------------------------------

create policy favorites_own on public.favorites
  for all to authenticated
  using (profile_id = auth.uid() or public.is_ops_admin())
  with check (profile_id = auth.uid());

create policy waitlist_entries_own on public.waitlist_entries
  for all to authenticated
  using (profile_id = auth.uid() or public.is_ops_admin())
  with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- carts / cart_items
-- Guest carts (profile_id is null) have no auth identity to scope by -- the
-- cart's random id is the only secret, same tradeoff every guest-cart
-- implementation makes. Forced sign-in at checkout means real orders/payment
-- data are never reachable this way.
-- ---------------------------------------------------------------------------

create policy carts_own_or_guest on public.carts
  for all to public
  using (profile_id = auth.uid() or profile_id is null or public.is_ops_admin())
  with check (profile_id = auth.uid() or profile_id is null);

create policy cart_items_own_or_guest on public.cart_items
  for all to public
  using (
    exists (
      select 1 from public.carts c
      where c.id = cart_id and (c.profile_id = auth.uid() or c.profile_id is null)
    ) or public.is_ops_admin()
  )
  with check (
    exists (
      select 1 from public.carts c
      where c.id = cart_id and (c.profile_id = auth.uid() or c.profile_id is null)
    )
  );

-- ---------------------------------------------------------------------------
-- orders / vendor_suborders / order_items
-- Written only by the payment webhook / cron edge functions via the
-- service-role key, so there are deliberately no client-facing insert/update
-- policies here beyond the cook-side status update on vendor_suborders.
-- ---------------------------------------------------------------------------

create policy orders_select on public.orders
  for select to authenticated
  using (customer_profile_id = auth.uid() or public.is_ops_admin());

create policy vendor_suborders_select on public.vendor_suborders
  for select to authenticated
  using (
    public.is_ops_admin()
    or public.is_customer_of_order(order_id)
    or public.owns_vendor(vendor_id)
    or public.is_active_driver_for_suborder(id)
    or public.can_view_pool_suborder(id)
  );

-- Cook-side status transitions (received -> confirmed -> preparing -> ready ->
-- completed). Driver-side transitions (claimed onward) and the claim itself go
-- through SECURITY DEFINER RPCs added in Phase 8, which do not need a
-- client-facing UPDATE grant here.
create policy vendor_suborders_update_cook_or_admin on public.vendor_suborders
  for update to authenticated
  using (public.owns_vendor(vendor_id) or public.is_ops_admin())
  with check (public.owns_vendor(vendor_id) or public.is_ops_admin());

create policy order_items_select on public.order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.vendor_suborders so
      where so.id = vendor_suborder_id
        and (
          public.is_ops_admin()
          or public.is_customer_of_order(so.order_id)
          or public.owns_vendor(so.vendor_id)
          or public.is_active_driver_for_suborder(so.id)
        )
    )
  );

-- ---------------------------------------------------------------------------
-- delivery_claims / delivery_dispatch_events
-- No client-facing insert/update policies yet: claim/release/status-transition
-- writes are SECURITY DEFINER RPCs added in Phase 8, and the narrow
-- customer_rating update lands in Phase 10. Read access is granted now so the
-- pool/queue/history screens have something to query against as those phases land.
-- ---------------------------------------------------------------------------

create policy delivery_claims_select on public.delivery_claims
  for select to authenticated
  using (
    public.is_ops_admin()
    or public.owns_vendor(driver_vendor_id)
    or exists (
      select 1 from public.vendor_suborders so
      where so.id = vendor_suborder_id
        and (public.owns_vendor(so.vendor_id) or public.is_customer_of_order(so.order_id))
    )
  );

create policy delivery_dispatch_events_select on public.delivery_dispatch_events
  for select to authenticated
  using (public.is_ops_admin());

-- ---------------------------------------------------------------------------
-- reviews / review_items
-- ---------------------------------------------------------------------------

create policy reviews_select on public.reviews
  for select to public
  using (is_flagged = false or customer_profile_id = auth.uid() or public.owns_vendor(vendor_id) or public.is_ops_admin());

create policy reviews_insert_own on public.reviews
  for insert to authenticated
  with check (customer_profile_id = auth.uid());

create policy reviews_update_own_or_admin on public.reviews
  for update to authenticated
  using (customer_profile_id = auth.uid() or public.is_ops_admin())
  with check (customer_profile_id = auth.uid() or public.is_ops_admin());

create policy review_items_select on public.review_items
  for select to public
  using (
    exists (
      select 1 from public.reviews r
      where r.id = review_id
        and (r.is_flagged = false or r.customer_profile_id = auth.uid() or public.owns_vendor(r.vendor_id) or public.is_ops_admin())
    )
  );

create policy review_items_write_own on public.review_items
  for all to authenticated
  using (exists (select 1 from public.reviews r where r.id = review_id and r.customer_profile_id = auth.uid()))
  with check (exists (select 1 from public.reviews r where r.id = review_id and r.customer_profile_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------

create policy messages_select on public.messages
  for select to authenticated
  using (from_profile_id = auth.uid() or to_profile_id = auth.uid() or public.is_ops_admin());

create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    from_profile_id = auth.uid()
    and exists (
      select 1 from public.vendor_suborders so
      where so.id = vendor_suborder_id
        and (public.is_customer_of_order(so.order_id) or public.owns_vendor(so.vendor_id))
    )
  );

create policy messages_update_read_receipt on public.messages
  for update to authenticated
  using (to_profile_id = auth.uid())
  with check (to_profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- audit_log / system_settings
-- ---------------------------------------------------------------------------

create policy audit_log_admin_only on public.audit_log
  for all to authenticated
  using (public.is_ops_admin())
  with check (public.is_ops_admin());

create policy system_settings_select on public.system_settings
  for select to public
  using (true);

create policy system_settings_update_admin on public.system_settings
  for update to authenticated
  using (public.is_ops_admin())
  with check (public.is_ops_admin());

-- admin_allow_list is only readable via the service role (admin app backend) --
-- everything else on system_settings is public content (disclaimers, fee
-- defaults) that the customer/vendor app renders pre-login.
revoke select on public.system_settings from anon, authenticated;
grant select (
  id, default_platform_fee_pct, free_trial_default_days, support_email,
  cottage_food_disclaimer_md, delivery_partner_agreement_md, created_at, updated_at
) on public.system_settings to anon, authenticated;
