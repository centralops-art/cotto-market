-- 0017: cook-side status transition guard for vendor_suborders. Same shape as
-- guard_vendor_owner_update (migration 0010) -- RLS's vendor_suborders_update_cook_or_admin
-- policy grants owns_vendor a full-row UPDATE, so an extra trigger is needed
-- to stop a cook from writing an illegal status jump (e.g. received straight
-- to completed) through that same UPDATE. service_role and ops admins always
-- bypass -- Phase 8's SECURITY DEFINER claim/release RPCs and admin refunds
-- both need to set claimed/en_route_*/delivered/refunded/etc. freely.

create or replace function public.guard_suborder_status_transition()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.is_ops_admin() then
    return new;
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'received' and new.status = 'confirmed')
      or (old.status = 'confirmed' and new.status = 'preparing')
      or (old.status = 'preparing' and new.status = 'ready')
      -- Delivery suborders stop at 'ready' on the cook side -- claimed onward
      -- is Phase 8's driver-facing RPCs. Pickup has no driver leg, so the cook
      -- closes it out directly once the customer picks up.
      or (old.status = 'ready' and new.status = 'completed' and old.fulfillment = 'pickup')
      or (old.status in ('received', 'confirmed', 'preparing') and new.status = 'cancelled')
    ) then
      raise exception 'Illegal suborder status transition: % -> % (fulfillment=%)', old.status, new.status, old.fulfillment;
    end if;
  end if;

  -- Single source of truth for "when did this become ready" -- Phase 8's
  -- unclaimed-fallback clocks (T1/T2/T3) read this column, so populate it
  -- here rather than relying on every caller to remember to set it.
  if new.status = 'ready' and old.status is distinct from 'ready' and new.ready_at is null then
    new.ready_at := now();
  end if;

  return new;
end;
$$;

create trigger guard_suborder_status_transition before update on public.vendor_suborders
  for each row execute function public.guard_suborder_status_transition();
