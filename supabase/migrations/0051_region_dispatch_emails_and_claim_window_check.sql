-- 0051: Phase 11. regions.dispatch_email -> dispatch_emails text[] (mirrors
-- the existing regions.zip_codes array-column pattern), so a real ops team's
-- dispatch alerts aren't capped at one recipient. Flagged as a known gap at
-- the end of Phase 10 (HANDOFF.md); folded into Phase 11's region-settings
-- CRUD work as planned.
--
-- Also adds the claim-window ordering check that cron-unclaimed-delivery-check
-- assumes (T1 < T2 < T3) but never itself validates -- the region-settings
-- admin form is the first client-facing way to change these values, so the
-- DB should refuse to save an invalid ordering regardless of which layer
-- writes it.

alter table public.regions add column dispatch_emails text[] not null default '{}';

update public.regions
  set dispatch_emails = case
    when dispatch_email is not null and dispatch_email <> '' then array[dispatch_email]
    else '{}'::text[]
  end;

alter table public.regions drop column dispatch_email;

alter table public.regions
  add constraint regions_claim_window_order
  check (claim_window_t1_minutes < claim_window_t2_minutes and claim_window_t2_minutes < claim_window_t3_minutes);
