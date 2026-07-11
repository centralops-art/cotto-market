-- 0014: daily schedule for the cron-cfpm-expiry-check edge function.
--
-- Uses pg_cron + pg_net (the standard Supabase pattern for scheduling edge
-- functions) with the project URL and service role key read from Vault by
-- NAME, not hardcoded here. One-time setup per environment (local AND the
-- hosted project) -- see README:
--
--   select vault.create_secret('http://127.0.0.1:54321', 'project_url');
--   select vault.create_secret('<service-role-key>', 'service_role_key');
--
-- Runs daily at 13:00 UTC (~8am America/Chicago during CDT).

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'cron-cfpm-expiry-check-daily') then
    perform cron.schedule(
      'cron-cfpm-expiry-check-daily',
      '0 13 * * *',
      $cron$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/cron-cfpm-expiry-check',
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
