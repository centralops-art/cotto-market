-- Seed data for local development: the single North Shore Chicago region and
-- the system_settings singleton.

insert into public.regions (
  name, slug, zip_codes,
  dispatch_contact_name, dispatch_email, dispatch_phone,
  base_delivery_fee_cents, per_mile_fee_cents,
  delivery_payout_split_pct, claim_window_t1_minutes, claim_window_t2_minutes, claim_window_t3_minutes,
  delivery_conflict_rule, is_active
) values (
  'North Shore Chicago',
  'north-shore-chicago',
  array[
    '60201', '60202', '60203', -- Evanston
    '60076', '60077',          -- Skokie
    '60091',                   -- Wilmette
    '60093',                   -- Winnetka
    '60022',                   -- Glencoe
    '60035',                   -- Highland Park
    '60040',                   -- Highwood
    '60062'                    -- Northbrook
  ],
  null, null, null, -- dispatch contact: placeholder, founder to fill in
  499,  -- $4.99 base delivery fee
  150,  -- $1.50 per mile
  80,   -- 80% driver / 20% Cotto
  10, 30, 60,
  'soft_warning',
  true
)
on conflict (slug) do nothing;

insert into public.system_settings (
  id, default_platform_fee_pct, free_trial_default_days, support_email,
  cottage_food_disclaimer_md, delivery_partner_agreement_md, admin_allow_list
) values (
  1,
  8,
  90,
  'CentralOps@CottoMarket.com',
  '# Cottage Food Disclaimer' || E'\n\n' ||
  '_Placeholder -- must be reviewed by an Illinois attorney before live launch (see spec section 7)._',
  '# Cotto Delivery Partner Agreement' || E'\n\n' ||
  '_Placeholder -- must be reviewed by an Illinois attorney before live launch. Covers independent contractor status, ' ||
  'insurance attestation, liability waiver, payout terms, and suspension/termination rules (see spec section 7)._',
  array['CentralOps@CottoMarket.com', 'Neal.Weingarden@gmail.com', 'CPITTS1183@gmail.com']
)
on conflict (id) do update set
  admin_allow_list = excluded.admin_allow_list;
