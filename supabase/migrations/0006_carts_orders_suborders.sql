-- 0006: cart, order, and per-vendor suborder lifecycle

create type public.cart_status as enum ('open', 'abandoned', 'checked_out');
create type public.fulfillment_type as enum ('pickup', 'delivery');
create type public.order_payment_status as enum ('pending_payment', 'paid', 'refunded', 'partially_refunded', 'cancelled');

create type public.suborder_status as enum (
  'received',
  'confirmed',
  'preparing',
  'ready',
  'claimed',
  'en_route_to_pickup',
  'picked_up',
  'en_route_to_customer',
  'delivered',
  'completed',
  'cancelled',
  'refunded'
);

-- profile_id is nullable to support guest carts; checkout forces sign-in, at which
-- point the cart is attached to a profile before payment.
create table public.carts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete cascade,
  session_id text,
  status public.cart_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index carts_profile_id_idx on public.carts (profile_id);
create index carts_session_id_idx on public.carts (session_id);

create trigger set_updated_at before update on public.carts
  for each row execute function public.set_updated_at();

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts (id) on delete cascade,
  menu_item_id uuid not null references public.menu_items (id) on delete restrict,
  vendor_id uuid not null references public.vendors (id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  customization jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index cart_items_cart_id_idx on public.cart_items (cart_id);

create trigger set_updated_at before update on public.cart_items
  for each row execute function public.set_updated_at();

-- One PaymentIntent per order (Separate Charges and Transfers pattern: this
-- PaymentIntent is charged directly on the platform Stripe account -- there is no
-- destination/application_fee_amount split here. Per-vendor payouts are explicit
-- Transfer calls fired from the payment_intent.succeeded webhook and, for
-- delivery, from the `delivered` transition -- see vendor_suborders below).
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_profile_id uuid not null references public.profiles (id) on delete restrict,
  region_id uuid not null references public.regions (id) on delete restrict,
  subtotal_cents integer not null check (subtotal_cents >= 0),
  delivery_fee_cents integer not null default 0 check (delivery_fee_cents >= 0),
  tax_cents integer not null default 0 check (tax_cents >= 0),
  platform_fee_cents integer not null default 0 check (platform_fee_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  currency text not null default 'usd',
  status public.order_payment_status not null default 'pending_payment',
  payment_intent_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_customer_profile_id_idx on public.orders (customer_profile_id);
create index orders_payment_intent_id_idx on public.orders (payment_intent_id);

create trigger set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

create table public.vendor_suborders (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  vendor_id uuid not null references public.vendors (id) on delete restrict,
  fulfillment public.fulfillment_type not null,
  pickup_at timestamptz,
  delivery_address jsonb,
  delivery_lat double precision,
  delivery_lng double precision,
  delivery_instructions text,
  subtotal_cents integer not null check (subtotal_cents >= 0),
  delivery_fee_cents integer not null default 0 check (delivery_fee_cents >= 0),
  platform_fee_cents integer not null default 0 check (platform_fee_cents >= 0),
  vendor_payout_cents integer not null default 0 check (vendor_payout_cents >= 0),
  status public.suborder_status not null default 'received',
  ready_at timestamptz,
  -- Incremented every time a delivery claim on this suborder is released back to
  -- the pool. Scopes the T1/T2/T3 unclaimed-fallback clocks and dispatch/customer
  -- action links to the current claim/release cycle.
  delivery_cycle integer not null default 1,
  mapbox_eta_minutes integer,
  stripe_transfer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vendor_suborders_order_id_idx on public.vendor_suborders (order_id);
create index vendor_suborders_vendor_id_idx on public.vendor_suborders (vendor_id);
create index vendor_suborders_status_idx on public.vendor_suborders (status);
-- Powers the "Available" delivery pool query: unclaimed, ready, delivery suborders.
create index vendor_suborders_pool_idx on public.vendor_suborders (fulfillment, status, ready_at)
  where fulfillment = 'delivery' and status = 'ready';

create trigger set_updated_at before update on public.vendor_suborders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  vendor_suborder_id uuid not null references public.vendor_suborders (id) on delete cascade,
  menu_item_id uuid references public.menu_items (id) on delete set null,
  name_snapshot text not null,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity integer not null check (quantity > 0),
  customization jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index order_items_vendor_suborder_id_idx on public.order_items (vendor_suborder_id);
