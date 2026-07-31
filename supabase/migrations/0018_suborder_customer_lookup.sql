-- 0018: narrow lookup so a cook can learn the customer_profile_id for a
-- suborder they own, to address to the messages thread (Phase 6). orders_select
-- RLS (migration 0010) only lets the customer themselves (or an admin) read
-- the orders row -- widening that policy would leak the whole multi-vendor
-- order's financials to every vendor on it, which is more than this needs.
-- A SECURITY DEFINER function scoped to exactly this one column, gated the
-- same way is_customer_of_order/owns_vendor already are, is the narrower fix.

create or replace function public.suborder_customer_profile_id(so_id uuid)
returns uuid
language sql security definer set search_path = public stable
as $$
  select o.customer_profile_id
  from public.orders o
  join public.vendor_suborders so on so.order_id = o.id
  where so.id = so_id
    and (public.owns_vendor(so.vendor_id) or public.is_customer_of_order(o.id) or public.is_ops_admin());
$$;

grant execute on function public.suborder_customer_profile_id(uuid) to authenticated;
