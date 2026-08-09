-- 0038: idempotency marker for the stuck-claim watchdog's dispatch-email
-- step (Phase 8), mirrors the drivers_license_expiry_warned_at pattern
-- (0033) -- avoids re-emailing dispatch every 5-minute cron run for the
-- same stuck claim.

alter table public.delivery_claims add column stuck_notified_at timestamptz;
