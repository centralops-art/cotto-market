-- 0058: replace the delivery_partner_agreement_md placeholder (seeded in
-- 0009) with text lifted from Section 9 of the Terms and Conditions
-- (cottomarket.com/terms-and-conditions), which has already passed legal
-- review. Per the founder: use the Terms §9 bullets rather than wait on
-- separate standalone agreement copy. Plain text, not markdown -- the
-- delivery-onboarding screen that renders this field
-- (apps/mobile/src/features/delivery-onboarding/agreement-step.tsx)
-- displays it in a plain <Text>, with no markdown renderer.

update public.system_settings
set delivery_partner_agreement_md =
  'Vendor-drivers who complete Cotto Delivery Partner onboarding and receive admin approval agree to the following terms, which govern all delivery activities and are set out in Section 9 of Cotto''s Terms & Conditions (cottomarket.com/terms-and-conditions):' || E'\n\n' ||
  'Independent contractor status: Vendor-drivers are independent contractors, not employees, agents, or partners of Cotto Market.' || E'\n\n' ||
  'Insurance: Vendor-drivers are responsible for maintaining adequate insurance coverage for their delivery activities. Motor vehicle deliveries require valid auto insurance. By attesting to insurance coverage during onboarding, vendor-drivers accept sole liability for any incidents during deliveries.' || E'\n\n' ||
  'Driver payout: Vendor-drivers receive 80% of the delivery fee collected on each completed delivery (configurable per region). Payouts are processed via Stripe Connect and withheld until delivery is confirmed complete.' || E'\n\n' ||
  'Self-claim prohibition: Vendor-drivers may not claim deliveries for orders placed at their own storefront.' || E'\n\n' ||
  'W-9 requirement: All vendors and vendor-drivers must provide a completed IRS Form W-9 with a valid Taxpayer Identification Number (TIN) before receiving any vendor or driver payouts. Payouts may be withheld until a valid W-9 is on file.' || E'\n\n' ||
  '1099 reporting: Vendor-drivers who earn more than $600 in a calendar year through Cotto will receive a 1099-NEC tax form via Stripe Connect.'
where id = 1;
