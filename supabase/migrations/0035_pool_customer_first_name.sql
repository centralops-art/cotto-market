-- 0035: narrow lookup so an on-duty, delivery_active vendor viewing the
-- regional delivery pool (spec 3.6) can see the customer's first name on a
-- suborder they don't own or drive yet. suborder_customer_display_name
-- (migration 0031) returns the customer's FULL name but is gated on
-- owns_vendor/is_customer_of_order/is_ops_admin -- it does not (and should
-- not) cover a pool viewer, since spec 3.6 deliberately shows less
-- information pre-claim ("customer first name only") than the Kitchen screen
-- shows a cook. Widening 0031's function instead of adding this one would
-- leak the full name of every ready delivery order's customer to every
-- on-duty vendor in the region, not just the one who ends up claiming it.

create or replace function public.pool_suborder_customer_first_name(so_id uuid)
returns text
language sql security definer set search_path = public stable
as $$
  select split_part(p.full_name, ' ', 1)
  from public.orders o
  join public.vendor_suborders so on so.order_id = o.id
  join public.profiles p on p.id = o.customer_profile_id
  where so.id = so_id
    and public.can_view_pool_suborder(so.id);
$$;

grant execute on function public.pool_suborder_customer_first_name(uuid) to authenticated;
