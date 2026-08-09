-- 0048: every-5-minute schedule for cron-waitlist-restock-check (Phase 10).
-- Same pg_cron + pg_net idiom as 0014/0034/0040. 5-minute cadence matches
-- cron-stuck-delivery-watchdog rather than the daily CFPM/license-expiry
-- jobs -- a restocked item is a customer-facing "come buy it now" moment,
-- not a slow-moving admin warning, so it should notify promptly.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'cron-waitlist-restock-check') then
    perform cron.schedule(
      'cron-waitlist-restock-check',
      '*/5 * * * *',
      $cron$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/cron-waitlist-restock-check',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      );
      $cron$
    );
  end if;
end;
$$;
