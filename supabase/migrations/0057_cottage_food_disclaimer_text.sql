-- 0057: replace the cottage_food_disclaimer_md placeholder (seeded in 0009)
-- with the attorney-reviewed text, now part of the Terms and Conditions
-- published at cottomarket.com/terms-and-conditions. Plain text, not
-- markdown -- the vendor-onboarding screen that renders this field
-- (apps/mobile/src/features/vendor-onboarding/cottage-food-step.tsx)
-- displays it in a plain <Text>, with no markdown renderer.
--
-- seed.sql's own comment says production system_settings values are
-- normally applied as a one-off update against the hosted DB, not
-- committed -- that's aimed at operational/contact fields (support_email,
-- admin_allow_list). This field is legal copy already public on the
-- website's own Terms and Conditions page, and a migration avoids needing
-- the service-role key or a raw DB connection string for a one-off
-- update (both previously blocked this session), so it's handled as a
-- normal versioned migration instead.

update public.system_settings
set cottage_food_disclaimer_md =
  'Products sold on Cotto Market are produced in home kitchens that are not inspected by the Illinois Department of Public Health or any local health department. These products are produced under the Illinois Cottage Food Operation Law. Cotto Market does not independently verify the safety or quality of cottage food products. Customers with food allergies or dietary restrictions should review ingredient and allergen information carefully before ordering.'
where id = 1;
