-- 0007: delivery claims (race-safe claim/release lifecycle) and dispatch events

create table public.delivery_claims (
  id uuid primary key default gen_random_uuid(),
  vendor_suborder_id uuid not null references public.vendor_suborders (id) on delete cascade,
  driver_vendor_id uuid not null references public.vendors (id) on delete restrict,
  claimed_at timestamptz not null default now(),
  en_route_to_pickup_at timestamptz,
  picked_up_at timestamptz,
  en_route_to_customer_at timestamptz,
  delivered_at timestamptz,
  released_at timestamptz,
  release_reason text,
  -- Locked in at claim time using the region's CURRENT delivery_payout_split_pct
  -- (see packages/shared/src/fees.ts::calculateDeliverySplit -- the only place
  -- this split is computed). Not recalculated afterward even if the region
  -- setting changes later.
  driver_payout_cents integer not null check (driver_payout_cents >= 0),
  cotto_delivery_fee_cents integer not null check (cotto_delivery_fee_cents >= 0),
  stripe_transfer_id text,
  customer_rating smallint check (customer_rating between 1 and 5),
  customer_rating_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index delivery_claims_vendor_suborder_id_idx on public.delivery_claims (vendor_suborder_id);
create index delivery_claims_driver_vendor_id_idx on public.delivery_claims (driver_vendor_id);

-- The race-safe claim invariant: at most one ACTIVE (released_at is null) claim
-- per suborder. The claim_delivery() RPC (added in Phase 8) relies on this
-- constraint plus a single-row UPDATE ... WHERE to guarantee exactly one winner.
create unique index delivery_claims_one_active_per_suborder_uidx
  on public.delivery_claims (vendor_suborder_id) where released_at is null;

-- Stuck-claim watchdog (cron-stuck-delivery-watchdog, Phase 8) scans active
-- claims by how long they've sat without a status update.
create index delivery_claims_active_idx on public.delivery_claims (vendor_suborder_id) where released_at is null;

create trigger set_updated_at before update on public.delivery_claims
  for each row execute function public.set_updated_at();

create type public.delivery_dispatch_event_type as enum (
  't1_sms_sent',
  't2_customer_offer_sent',
  'customer_chose_pickup',
  'customer_chose_refund',
  't3_auto_refunded',
  'claim_cancelled_pending_offer'
);

create table public.delivery_dispatch_events (
  id uuid primary key default gen_random_uuid(),
  vendor_suborder_id uuid not null references public.vendor_suborders (id) on delete cascade,
  event_type public.delivery_dispatch_event_type not null,
  occurred_at timestamptz not null default now(),
  -- Carries cycle-scoping detail (delivery_cycle, action_token, resolved_at, etc.)
  -- for the T2 customer offer links without a schema change each time Phase 9
  -- iterates on the exact fields needed.
  payload jsonb not null default '{}'::jsonb
);

create index delivery_dispatch_events_vendor_suborder_id_idx on public.delivery_dispatch_events (vendor_suborder_id);
create index delivery_dispatch_events_type_idx on public.delivery_dispatch_events (event_type);
