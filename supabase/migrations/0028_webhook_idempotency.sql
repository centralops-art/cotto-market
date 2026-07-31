-- 0028: stripe-webhook's existing `if (order.status === 'paid') return early`
-- check only guards against SEQUENTIAL replay (a Stripe retry arriving after
-- the first delivery already finished writing). Two concurrent deliveries of
-- the same event could both read 'pending_payment' before either finishes,
-- and both fire vendor Transfers -- a real double-pay risk, not just a
-- theoretical one, per external code review (see HANDOFF.md §12 item 7).
-- Standard Stripe-recommended fix: track processed event IDs, with the
-- primary key itself as the atomic arbitrator -- whichever concurrent
-- request's INSERT wins gets to process the event; the other gets a unique
-- violation and bails out immediately having done no work. No RLS policies
-- are added on purpose (service-role only, same as orders/vendor_suborders'
-- write path) -- RLS stays enabled so no client role can read/write this by
-- accident even if grants were ever misconfigured.

create table public.processed_stripe_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

alter table public.processed_stripe_events enable row level security;
