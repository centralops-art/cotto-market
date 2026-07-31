-- 0022: close the cart price/vendor tampering hole flagged by external code
-- review. cart_items.unit_price_cents and vendor_id were client-writable at
-- insert (and, via the broad cart_items_own_or_guest UPDATE policy, at
-- update too) with nothing validating them against the real menu_items row --
-- and checkout-create-payment-intent trusted them as-is when computing the
-- charge. This trigger makes cart_items.unit_price_cents/vendor_id always an
-- authoritative mirror of the live menu_items row, for every caller
-- (no service_role/admin bypass -- there's no legitimate reason for a cart
-- line to ever disagree with the menu item it points at). Unlike the other
-- guard triggers in this codebase, checkout-create-payment-intent (next
-- migration/deploy) additionally re-derives price fresh from menu_items at
-- charge time rather than relying on this alone -- true defense in depth.

create or replace function public.sync_cart_item_price()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  mi record;
begin
  select vendor_id, price_cents into mi from public.menu_items where id = new.menu_item_id;
  if mi is null then
    raise exception 'menu_item_id % does not exist', new.menu_item_id;
  end if;
  new.vendor_id := mi.vendor_id;
  new.unit_price_cents := mi.price_cents;
  return new;
end;
$$;

create trigger sync_cart_item_price before insert or update on public.cart_items
  for each row execute function public.sync_cart_item_price();
