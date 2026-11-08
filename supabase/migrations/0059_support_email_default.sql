-- 0059: support_email has defaulted to 'CentralOps@CottoMarket.com' since
-- 0009 and isn't read by any app code yet, but it should match what's
-- actually published on the Terms and Conditions page
-- (cottomarket.com/terms-and-conditions, Section 16) whenever it does get
-- wired up somewhere.

alter table public.system_settings
  alter column support_email set default 'support@cottomarket.com';

update public.system_settings
set support_email = 'support@cottomarket.com'
where id = 1;
