-- 0041: narrow lookup so a customer (or admin) can see the name of the
-- driver currently assigned to their delivery suborder, mirrors
-- suborder_customer_display_name (migration 0031) in reverse. Gated the
-- same way -- profiles RLS only lets a profile read its own row, so this is
-- the only way the customer's order-tracking screen can show "Driver: ...".

create or replace function public.suborder_driver_display_name(so_id uuid)
returns text
language sql security definer set search_path = public stable
as $$
  select p.full_name
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

grant execute on function public.suborder_driver_display_name(uuid) to authenticated;
