-- 0040: every-5-minute schedule for cron-stuck-delivery-watchdog (Phase 8).
-- Same pg_cron + pg_net idiom as 0014/0034, sub-hourly this time given the
-- 20-minute release threshold (founder's decision -- spec suggested 60).

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'cron-stuck-delivery-watchdog') then
    perform cron.schedule(
      'cron-stuck-delivery-watchdog',
      '*/5 * * * *',
      $cron$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/cron-stuck-delivery-watchdog',
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
