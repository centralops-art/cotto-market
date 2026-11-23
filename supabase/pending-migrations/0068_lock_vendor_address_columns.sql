-- 0068: remove the public read of a kitchen's street address and exact map
-- coordinates (HANDOFF.md §44). Until now vendors_select let anyone, signed
-- in or not, read address_line1/lat/lng of every active vendor. City, state
-- and ZIP stay public (general area only). Authorized readers use the
-- functions from 0067.
--
-- HELD in supabase/pending-migrations/ on purpose: app builds before the
-- §44 change read vendors with select("*"), which this grant rejects
-- (browse, kitchen pages and the cook's own screens would break). Move it
-- into supabase/migrations/ and `db push` only once testers are on a store
-- build that includes §44.
--
-- Same column-grant pattern as system_settings (0010). GOTCHA: a column
-- added to vendors later is NOT readable by anon/authenticated until it is
-- added to this list in a new migration.

revoke select on public.vendors from anon, authenticated;
grant select (
  id, owner_profile_id, region_id, storefront_name, slug, tagline, description,
  vendor_types, city, state, zip, phone, email, website, header_image_url,
  theme_palette, layout_style, hours, preorder_hours, status, published_at,
  cfpm_cert_url, cfpm_cert_expires_on, cfpm_expiry_warned_at,
  cottage_food_acknowledged_at, platform_fee_pct, free_trial_ends_at,
  stripe_account_id, stripe_account_model, stripe_charges_enabled,
  il_tax_account_id, stripe_tax_registration_id, stripe_tax_ready_at,
  sms_opt_in, rejected_reason, suspended_reason, deleted_at, search_tsv,
  created_at, updated_at
) on public.vendors to anon, authenticated;
