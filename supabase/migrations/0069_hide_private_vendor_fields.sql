-- 0069: hide a kitchen's business/admin fields from customers and the public
-- (HANDOFF.md §47 A, stage 1). READ permission only: INSERT/UPDATE grants, the
-- vendor guard triggers and RLS are untouched, so vendors keep editing
-- everything they can edit today. They read their own full row through
-- my_vendor() (0067); the admin app and edge functions use the service role.
--
-- DEPLOY ORDER: first deploy stripe-connect-onboarding, stripe-connect-status
-- and update-delivery-status from the same PR (older versions read these
-- columns with the user's login), then apply this.
--
-- No app build needed: iOS 12 / Android vc 10 never select or filter on these
-- columns. The contact/location columns they do select are stage 2.

revoke select (
  stripe_account_id, stripe_account_model, stripe_charges_enabled,
  stripe_tax_registration_id, stripe_tax_ready_at, il_tax_account_id,
  platform_fee_pct, free_trial_ends_at,
  cfpm_cert_url, cfpm_cert_expires_on, cfpm_expiry_warned_at,
  cottage_food_acknowledged_at, sms_opt_in,
  rejected_reason, suspended_reason, deleted_at
) on public.vendors from anon, authenticated;
