-- 0062: bring the in-app Delivery Partner Agreement in line with the
-- Terms and Conditions as updated 2026-11-18 (cottomarket.com/terms-and-conditions).
--
-- 0058 copied Section 9 while it still had a "Self-claim prohibition"
-- bullet, but self-delivery has been allowed since 0055 because Illinois
-- cottage food law requires vendors to be able to deliver their own
-- products. The website now drops that bullet, and Section 3.2 says
-- vendor-drivers may fulfill deliveries "for other vendors' orders as well
-- as their own". Same text as 0058 otherwise. Plain text, not markdown
-- (rendered in a plain <Text> by delivery-onboarding/agreement-step.tsx).

update public.system_settings
set delivery_partner_agreement_md =
  'Vendor-drivers who complete Cotto Delivery Partner onboarding and receive admin approval agree to the following terms, which govern all delivery activities and are set out in Section 9 of Cotto''s Terms & Conditions (cottomarket.com/terms-and-conditions):' || E'\n\n' ||
  'Independent contractor status: Vendor-drivers are independent contractors, not employees, agents, or partners of Cotto Market.' || E'\n\n' ||
  'Insurance: Vendor-drivers are responsible for maintaining adequate insurance coverage for their delivery activities. Motor vehicle deliveries require valid auto insurance. By attesting to insurance coverage during onboarding, vendor-drivers accept sole liability for any incidents during deliveries.' || E'\n\n' ||
  'Driver payout: Vendor-drivers receive 80% of the delivery fee collected on each completed delivery (configurable per region). Payouts are processed via Stripe Connect and withheld until delivery is confirmed complete.' || E'\n\n' ||
  'Self-delivery: Vendor-drivers may claim and fulfill deliveries for other vendors'' orders as well as their own.' || E'\n\n' ||
  'W-9 requirement: All vendors and vendor-drivers must provide a completed IRS Form W-9 with a valid Taxpayer Identification Number (TIN) before receiving any vendor or driver payouts. Payouts may be withheld until a valid W-9 is on file.' || E'\n\n' ||
  '1099 reporting: Vendor-drivers who earn more than $600 in a calendar year through Cotto will receive a 1099-NEC tax form via Stripe Connect.'
where id = 1;
