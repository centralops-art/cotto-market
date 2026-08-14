-- 0054: free-mile delivery radius. Founder decision (2026-08-13): delivery
-- fee should be base + per-mile beyond a free radius, billed on one-way
-- pickup->dropoff distance -- not the round-trip-from-mile-zero pricing this
-- project shipped with originally. Region-configurable (like every other
-- delivery fee lever) so the founder can balance it against the per-mile
-- rate and driver payout split from the admin app without a code change.

alter table public.regions
  add column free_delivery_miles numeric not null default 5 check (free_delivery_miles >= 0);
