-- 0031: narrow lookup so a cook can learn the customer's display name for a
-- suborder they own (e.g. pickup verification). Mirrors
-- suborder_customer_profile_id (migration 0018) exactly -- same gate
-- (owns_vendor/is_customer_of_order/is_ops_admin), just returning
-- profiles.full_name instead of the profile id, since profiles_select_own_or_admin
-- (migration 0010) only lets a profile read its own row and widening that
-- policy would let any authenticated user read any other user's full_name.

create or replace function public.suborder_customer_display_name(so_id uuid)
returns text
language sql security definer set search_path = public stable
as $$
  select p.full_name
  from public.orders o
  join public.vendor_suborders so on so.order_id = o.id
  join public.profiles p on p.id = o.customer_profile_id
  where so.id = so_id
    and (public.owns_vendor(so.vendor_id) or public.is_customer_of_order(o.id) or public.is_ops_admin());
$$;

grant execute on function public.suborder_customer_display_name(uuid) to authenticated;
