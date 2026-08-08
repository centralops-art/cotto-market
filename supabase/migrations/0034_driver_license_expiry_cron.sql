-- 0034: daily schedule for the cron-driver-license-expiry-check edge function
-- (Phase 7). Mirrors 0014_cfpm_expiry_cron.sql exactly -- same pg_cron +
-- pg_net idiom, project URL and service role key read from Vault by name
-- (already set up for the CFPM cron, no new one-time setup needed). Runs 15
-- minutes after the CFPM job (13:00 UTC) to avoid both hitting Resend at the
-- same instant.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'cron-driver-license-expiry-check-daily') then
    perform cron.schedule(
      'cron-driver-license-expiry-check-daily',
      '15 13 * * *',
      $cron$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/cron-driver-license-expiry-check',
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
