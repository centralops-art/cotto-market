-- 0039: the currently active driver on a suborder is now also a valid
-- message-recipient party (customer <-> driver chat on the claimed-order
-- screen, Phase 8). Extends is_valid_message_recipient (0023) additively --
-- existing customer<->cook messaging is untouched. No RLS policy change
-- needed, messages_insert already calls this function.

create or replace function public.is_valid_message_recipient(so_id uuid, sender_profile_id uuid, recipient_profile_id uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1
    from public.vendor_suborders so
    join public.orders o on o.id = so.order_id
    join public.vendors v on v.id = so.vendor_id
    where so.id = so_id
      and (
        (sender_profile_id = o.customer_profile_id and recipient_profile_id = v.owner_profile_id)
        or (sender_profile_id = v.owner_profile_id and recipient_profile_id = o.customer_profile_id)
      )
  )
  or exists (
    select 1
    from public.vendor_suborders so
    join public.orders o on o.id = so.order_id
    join public.delivery_claims dc on dc.vendor_suborder_id = so.id and dc.released_at is null
    join public.vendors dv on dv.id = dc.driver_vendor_id
    where so.id = so_id
      and (
        (sender_profile_id = o.customer_profile_id and recipient_profile_id = dv.owner_profile_id)
        or (sender_profile_id = dv.owner_profile_id and recipient_profile_id = o.customer_profile_id)
      )
  );
$$;
