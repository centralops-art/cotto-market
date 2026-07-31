-- 0023: close the reviews/messages abuse gaps flagged by external code
-- review (see HANDOFF.md §12, items 4). reviews_insert_own only checked
-- customer_profile_id = auth.uid() -- anyone could review any vendor without
-- ever ordering from them. messages_insert correctly required the sender to
-- be the real customer or vendor owner on a specific suborder, but never
-- validated to_profile_id was the actual counterpart, letting a legitimate
-- customer address a message on their own real order to an arbitrary third
-- profile (who would then see it via messages_select's `to_profile_id =
-- auth.uid()` clause).

-- Extends the existing guard_review_not_self trigger (migration 0010) rather
-- than adding a second one -- same attachment point, same "before insert or
-- update" firing.
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

  if not exists (
    select 1
    from public.vendor_suborders so
    join public.orders o on o.id = so.order_id
    where so.id = new.vendor_suborder_id
      and so.vendor_id = new.vendor_id
      and o.customer_profile_id = new.customer_profile_id
      and so.status = 'completed'
  ) then
    raise exception 'Reviews can only be left for a completed order you placed with this vendor';
  end if;

  return new;
end;
$$;

-- Sender and recipient must be the two opposite parties on the suborder --
-- mirrors the is_customer_of_order/owns_vendor helper-function pattern
-- already used throughout migration 0010's policies.
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
  );
$$;

drop policy if exists messages_insert on public.messages;

create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    from_profile_id = auth.uid()
    and public.is_valid_message_recipient(vendor_suborder_id, from_profile_id, to_profile_id)
  );
