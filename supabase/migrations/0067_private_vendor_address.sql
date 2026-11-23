-- 0067: access functions for a kitchen's private location (HANDOFF.md §44).
-- Additive only: nothing changes for existing app builds. 0068 then removes
-- the public read of vendors.address_line1/lat/lng, and must be applied only
-- after a store build that uses these functions is in testers' hands.
--
-- Who gets the street address / exact coordinates:
--   * the kitchen's owner        -> my_vendor() (full row, for the cook's own screens)
--   * a customer with a paid order from that kitchen, the driver with the
--     active claim, the owner, ops admins -> suborder_pickup_location(so_id)
--   * an on-duty driver viewing the open delivery pool -> pool_pickup_coords(),
--     coordinates rounded to 3 decimals (~100 m), enough for a distance.
-- Edge functions and the admin app use the service role and are unaffected.

-- The signed-in cook's own vendor row, all columns.
create or replace function public.my_vendor()
returns setof public.vendors
language sql security definer set search_path = public stable
as $$
  select * from public.vendors where owner_profile_id = auth.uid() limit 1;
$$;

-- Pickup address for one suborder.
create or replace function public.suborder_pickup_location(so_id uuid)
returns table (address_line1 text, city text, state text, zip text, lat double precision, lng double precision)
language sql security definer set search_path = public stable
as $$
  select v.address_line1, v.city, v.state, v.zip, v.lat, v.lng
  from public.vendor_suborders so
  join public.vendors v on v.id = so.vendor_id
  join public.orders o on o.id = so.order_id
  where so.id = so_id
    and (
      (o.customer_profile_id = auth.uid() and o.status in ('paid', 'partially_refunded'))
      or public.is_active_driver_for_suborder(so.id)
      or v.owner_profile_id = auth.uid()
      or public.is_ops_admin()
    );
$$;

-- Pickup coordinates for the driver's delivery list: exact for a suborder
-- the caller has claimed, rounded (~100 m) for one they can only see in the
-- pool, nothing otherwise.
create or replace function public.pool_pickup_coords(so_ids uuid[])
returns table (suborder_id uuid, lat double precision, lng double precision)
language sql security definer set search_path = public stable
as $$
  select so.id,
         case when public.is_active_driver_for_suborder(so.id) then v.lat else round(v.lat::numeric, 3)::double precision end,
         case when public.is_active_driver_for_suborder(so.id) then v.lng else round(v.lng::numeric, 3)::double precision end
  from public.vendor_suborders so
  join public.vendors v on v.id = so.vendor_id
  where so.id = any(so_ids)
    and (public.is_active_driver_for_suborder(so.id) or public.can_view_pool_suborder(so.id));
$$;

revoke execute on function public.my_vendor() from anon, public;
revoke execute on function public.suborder_pickup_location(uuid) from anon, public;
revoke execute on function public.pool_pickup_coords(uuid[]) from anon, public;
grant execute on function public.my_vendor() to authenticated;
grant execute on function public.suborder_pickup_location(uuid) to authenticated;
grant execute on function public.pool_pickup_coords(uuid[]) to authenticated;
