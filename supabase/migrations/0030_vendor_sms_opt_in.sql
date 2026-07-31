-- 0030: vendor-side SMS consent, mirroring profiles.sms_opt_in (migration
-- 0019). Captured on the vendor onboarding "business basics" step per
-- Twilio's A2P 10DLC campaign corrective guidance (inline disclosure below
-- the business phone field, not a checkbox -- see business-basics-step.tsx).
-- Actual vendor-facing SMS sends (order alerts, delivery notifications,
-- payout confirmations) are not built yet -- this column only captures
-- consent so it's ready when that notification path is built.

alter table public.vendors
  add column sms_opt_in boolean not null default false;
