-- 0033: mirrors vendors.cfpm_expiry_warned_at (migration 0012) -- lets the
-- new driver-license expiry cron (migration 0034, cron-driver-license-expiry-
-- check edge function) mark a vendor_delivery_profiles row as "already
-- warned" so the daily job doesn't re-send the 60-day digest email every run.

alter table public.vendor_delivery_profiles
  add column drivers_license_expiry_warned_at timestamptz;
