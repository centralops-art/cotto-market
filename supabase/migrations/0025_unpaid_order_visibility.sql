-- 0025: vendors should not see (or be able to act on) a suborder before its
-- order is actually paid. checkout-create-payment-intent writes the
-- suborder as 'received' before the customer's PaymentIntent is confirmed,
-- and vendor_suborders_select / vendor_suborders_update_cook_or_admin
-- (migration 0010) never filtered on orders.status -- a vendor could see
-- (and, via the update policy, advance) an order that was never paid for.
-- Customers still see their own suborder pre-payment (is_customer_of_order
-- is untouched) -- order-confirmation.tsx/the Orders tab rely on that while
-- polling for the webhook to flip status to 'paid'. Admins are untouched
-- (support/refund scenarios legitimately need to see everything).
--
-- Fixing the UPDATE policy transitively protects the driver-visibility
-- clauses (is_active_driver_for_suborder/can_view_pool_suborder) too --
-- those only ever match a suborder already at 'ready'/'claimed', which a
-- cook can no longer reach for an unpaid order in the first place.

create or replace function public.is_order_paid(target_order_id uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.orders where id = target_order_id and status = 'paid'
  );
$$;

drop policy if exists vendor_suborders_select on public.vendor_suborders;
drop policy if exists vendor_suborders_update_cook_or_admin on public.vendor_suborders;

create policy vendor_suborders_select on public.vendor_suborders
  for select to authenticated
  using (
    public.is_ops_admin()
    or public.is_customer_of_order(order_id)
    or (public.owns_vendor(vendor_id) and public.is_order_paid(order_id))
    or public.is_active_driver_for_suborder(id)
    or public.can_view_pool_suborder(id)
  );

create policy vendor_suborders_update_cook_or_admin on public.vendor_suborders
  for update to authenticated
  using ((public.owns_vendor(vendor_id) and public.is_order_paid(order_id)) or public.is_ops_admin())
  with check ((public.owns_vendor(vendor_id) and public.is_order_paid(order_id)) or public.is_ops_admin());
