-- 0044: Phase 9 -- suborder_pending_customer_offer(so_id) SECURITY DEFINER
-- function, same narrow-lookup pattern as suborder_customer_display_name
-- (0031) / suborder_driver_display_name (0041). Lets the customer's
-- order-tracking screen know whether there's an active T2 pickup-or-refund
-- offer awaiting their response, without widening delivery_dispatch_events'
-- RLS (currently admin-only, see migration 0010) to every customer.
--
-- Returns the offer's T3 deadline (for display) if one is active for the
-- suborder's CURRENT delivery_cycle, else null. "Active" = a
-- t2_customer_offer_sent event exists for this cycle with no resolution
-- event (customer_chose_pickup/customer_chose_refund/t3_auto_refunded/
-- claim_cancelled_pending_offer) yet for the same cycle, AND the suborder
-- is still 'ready' (defense in depth against a resolution that happened via
-- some other path without logging an event).

create or replace function public.suborder_pending_customer_offer(so_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_status public.suborder_status;
  v_cycle integer;
  v_expires_at timestamptz;
begin
  select order_id, status, delivery_cycle into v_order_id, v_status, v_cycle
  from public.vendor_suborders
  where id = so_id;

  if v_order_id is null then
    return null;
  end if;

  if not (public.is_customer_of_order(v_order_id) or public.is_ops_admin()) then
    return null;
  end if;

  if v_status is distinct from 'ready' then
    return null;
  end if;

  select (e.payload->>'expires_at')::timestamptz into v_expires_at
  from public.delivery_dispatch_events e
  where e.vendor_suborder_id = so_id
    and e.event_type = 't2_customer_offer_sent'
    and (e.payload->>'delivery_cycle')::integer = v_cycle
    and not exists (
      select 1 from public.delivery_dispatch_events r
      where r.vendor_suborder_id = so_id
        and r.event_type in ('customer_chose_pickup', 'customer_chose_refund', 't3_auto_refunded', 'claim_cancelled_pending_offer')
        and (r.payload->>'delivery_cycle')::integer = v_cycle
    )
  order by e.occurred_at desc
  limit 1;

  return v_expires_at;
end;
$$;

grant execute on function public.suborder_pending_customer_offer(uuid) to authenticated;
