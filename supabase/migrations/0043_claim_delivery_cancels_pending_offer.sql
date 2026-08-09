-- 0043: Phase 9 -- claim_delivery() now logs claim_cancelled_pending_offer
-- when a driver claims a suborder that has an active T2 customer offer
-- pending (the enum value already existed since migration 0007, reserved
-- for exactly this). No behavior change to the claim itself: the existing
-- atomic `update ... where status = 'ready'` a few lines up already makes
-- the driver win this race for free (a customer's resolve-delivery-offer
-- call guards on the same status/cycle and will cleanly no-op if a claim
-- lands first) -- this is purely the audit trail the events table was
-- built for.

create or replace function public.claim_delivery(so_id uuid)
returns public.delivery_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_vendor_id uuid;
  v_driver_region_id uuid;
  v_cook_vendor_id uuid;
  v_cook_region_id uuid;
  v_conflict_rule public.delivery_conflict_rule;
  v_split_pct numeric;
  v_delivery_fee_cents integer;
  v_driver_payout_cents integer;
  v_cotto_fee_cents integer;
  v_open_kitchen_orders integer;
  v_claim public.delivery_claims;
  v_delivery_cycle integer;
  v_pending_offer boolean;
begin
  -- Caller must own an on-duty, delivery-active vendor.
  select v.id, v.region_id
    into v_driver_vendor_id, v_driver_region_id
  from public.vendors v
  join public.vendor_delivery_profiles vdp on vdp.vendor_id = v.id
  where v.owner_profile_id = auth.uid()
    and vdp.status = 'delivery_active'
    and vdp.on_duty = true
  limit 1;

  if v_driver_vendor_id is null then
    raise exception 'You must be an on-duty, delivery-active driver to claim deliveries';
  end if;

  -- Resolve the cooking vendor + region + delivery fee for this suborder.
  -- These fields never change after checkout, so a plain (non-locking) read
  -- here is safe -- the only field that can race is `status`, which the
  -- conditional UPDATE below handles atomically.
  select so.vendor_id, cv.region_id, so.delivery_fee_cents, r.delivery_conflict_rule, r.delivery_payout_split_pct, so.delivery_cycle
    into v_cook_vendor_id, v_cook_region_id, v_delivery_fee_cents, v_conflict_rule, v_split_pct, v_delivery_cycle
  from public.vendor_suborders so
  join public.vendors cv on cv.id = so.vendor_id
  join public.regions r on r.id = cv.region_id
  where so.id = so_id;

  if v_cook_vendor_id is null then
    raise exception 'Suborder not found';
  end if;

  -- Self-claim block (defense-in-depth: can_view_pool_suborder already keeps
  -- this off a driver's own pool list, but a client could call this RPC
  -- directly with an arbitrary uuid).
  if v_driver_vendor_id = v_cook_vendor_id then
    raise exception 'You cannot claim your own order';
  end if;

  if v_driver_region_id is distinct from v_cook_region_id then
    raise exception 'This order is outside your delivery region';
  end if;

  if v_conflict_rule = 'hard_block' then
    select count(*) into v_open_kitchen_orders
    from public.vendor_suborders
    where vendor_id = v_driver_vendor_id
      and status in ('received', 'confirmed', 'preparing');
    if v_open_kitchen_orders > 0 then
      raise exception 'You have an open kitchen order in progress -- this region requires you to finish it before claiming a delivery';
    end if;
  end if;

  -- The atomic, race-safe step. A concurrent claim_delivery() call on the
  -- same so_id blocks on Postgres's row lock for this UPDATE until this
  -- transaction commits or rolls back, then re-evaluates `status = 'ready'`
  -- against the now-committed row and finds zero matching rows -- FOUND is
  -- false below, and it loses cleanly with a clear error instead of a raw
  -- unique-violation. delivery_claims_one_active_per_suborder_uidx (0007) is
  -- the second, defense-in-depth backstop for this same invariant.
  update public.vendor_suborders
  set status = 'claimed'
  where id = so_id
    and status = 'ready'
    and fulfillment = 'delivery';

  if not found then
    raise exception 'This order was just claimed by another driver';
  end if;

  -- Mirrors packages/shared/src/fees.ts::calculateDeliverySplit exactly
  -- (round-half-up on cents, matching percentOfCents's Math.round). Locked
  -- in using the region's CURRENT split -- not the checkout-time value.
  v_driver_payout_cents := round(v_delivery_fee_cents * v_split_pct / 100.0)::integer;
  v_cotto_fee_cents := v_delivery_fee_cents - v_driver_payout_cents;

  insert into public.delivery_claims (vendor_suborder_id, driver_vendor_id, driver_payout_cents, cotto_delivery_fee_cents)
  values (so_id, v_driver_vendor_id, v_driver_payout_cents, v_cotto_fee_cents)
  returning * into v_claim;

  insert into public.audit_log (actor_profile_id, action, target_table, target_id, metadata)
  values (
    auth.uid(), 'delivery_claimed', 'vendor_suborders', so_id,
    jsonb_build_object('driver_vendor_id', v_driver_vendor_id, 'driver_payout_cents', v_driver_payout_cents, 'claim_id', v_claim.id)
  );

  -- Phase 9: did this suborder have an active T2 customer offer (pickup-or-
  -- refund) pending for the current cycle, with no resolution yet? If so,
  -- the claim just won the race against it -- log it, same cycle-scoping
  -- convention as every other Phase 9 event.
  select exists (
    select 1 from public.delivery_dispatch_events e
    where e.vendor_suborder_id = so_id
      and e.event_type = 't2_customer_offer_sent'
      and (e.payload->>'delivery_cycle')::integer = v_delivery_cycle
  ) and not exists (
    select 1 from public.delivery_dispatch_events e
    where e.vendor_suborder_id = so_id
      and e.event_type in ('customer_chose_pickup', 'customer_chose_refund', 't3_auto_refunded')
      and (e.payload->>'delivery_cycle')::integer = v_delivery_cycle
  ) into v_pending_offer;

  if v_pending_offer then
    insert into public.delivery_dispatch_events (vendor_suborder_id, event_type, payload)
    values (so_id, 'claim_cancelled_pending_offer', jsonb_build_object('delivery_cycle', v_delivery_cycle, 'claim_id', v_claim.id));
  end if;

  return v_claim;
end;
$$;

grant execute on function public.claim_delivery(uuid) to authenticated;
