-- 0052: Phase 11. Daily schedule for cron-vendor-trial-expiry-check. Mirrors
-- 0014/0034's pg_cron + pg_net idiom exactly. Runs 13:45 UTC -- 30 min after
-- the CFPM job (13:00) and 30 min after the driver-license job (13:15), same
-- stagger pattern used for every daily cron in this project so Resend never
-- gets hit by more than one job at the same instant.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'cron-vendor-trial-expiry-check-daily') then
    perform cron.schedule(
      'cron-vendor-trial-expiry-check-daily',
      '45 13 * * *',
      $cron$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/cron-vendor-trial-expiry-check',
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
