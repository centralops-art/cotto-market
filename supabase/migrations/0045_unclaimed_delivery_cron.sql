-- 0045: every-5-minute schedule for cron-unclaimed-delivery-check (Phase 9).
-- Same pg_cron + pg_net idiom as 0014/0034/0040. 5 minutes comfortably
-- resolves the smallest configured window (T1 default 10 minutes) without
-- meaningfully delaying any stage.

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'cron-unclaimed-delivery-check') then
    perform cron.schedule(
      'cron-unclaimed-delivery-check',
      '*/5 * * * *',
      $cron$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/cron-unclaimed-delivery-check',
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
