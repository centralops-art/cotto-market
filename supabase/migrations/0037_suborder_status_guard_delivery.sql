-- 0037: extends guard_suborder_status_transition's allow-list with Phase 8's
-- driver-side claim lifecycle. claim_delivery/release_delivery_claim/
-- update-delivery-status all run under the calling driver's own JWT via
-- SECURITY DEFINER, so auth.role() is 'authenticated' inside this trigger,
-- NOT 'service_role' -- the existing bypass clause never fires for them.
-- Safe to allow these transitions directly (not via a role-bypass hack):
-- drivers have zero RLS UPDATE grant on vendor_suborders at all (see
-- vendor_suborders_update_cook_or_admin, migration 0010), so this trigger
-- only ever sees these transitions arrive via the Phase 8 RPCs/functions
-- below -- never from an arbitrary authenticated client UPDATE. Same
-- reasoning already used for the existing ready->completed/pickup entry.

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
      -- Delivery suborders stop at 'ready' on the cook side -- claimed
      -- onward is Phase 8's driver-facing RPCs/functions below.
      or (old.status = 'ready' and new.status = 'completed' and old.fulfillment = 'pickup')
      or (old.status in ('received', 'confirmed', 'preparing') and new.status = 'cancelled')
      -- Phase 8: claim_delivery()
      or (old.status = 'ready' and new.status = 'claimed' and old.fulfillment = 'delivery')
      -- Phase 8: update-delivery-status edge function, one step at a time
      or (old.status = 'claimed' and new.status = 'en_route_to_pickup')
      or (old.status = 'en_route_to_pickup' and new.status = 'picked_up')
      or (old.status = 'picked_up' and new.status = 'en_route_to_customer')
      or (old.status = 'en_route_to_customer' and new.status = 'delivered')
      or (old.status = 'delivered' and new.status = 'completed')
      -- Phase 8: release_delivery_claim() (voluntary or watchdog auto-release)
      or (old.status in ('claimed', 'en_route_to_pickup') and new.status = 'ready')
    ) then
      raise exception 'Illegal suborder status transition: % -> % (fulfillment=%)', old.status, new.status, old.fulfillment;
    end if;
  end if;

  -- Single source of truth for "when did this become ready" -- Phase 8/9's
  -- unclaimed-fallback and release logic read this column, so populate it
  -- here rather than relying on every caller to remember to set it.
  if new.status = 'ready' and old.status is distinct from 'ready' and new.ready_at is null then
    new.ready_at := now();
  end if;

  return new;
end;
$$;
