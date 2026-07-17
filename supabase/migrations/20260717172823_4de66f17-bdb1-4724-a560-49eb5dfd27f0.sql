DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'wa-queue-tick-watchdog';
  END IF;
END $$;

SELECT cron.schedule(
  'wa-queue-tick-watchdog',
  '* * * * * *',
  $cronbody$
  SELECT net.http_post(
    url := 'https://project--9c7682d6-edcd-4388-a36c-36249d4d6ab8-dev.lovable.app/api/public/whatsapp/queue-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', current_setting('app.settings.supabase_publishable_key', true),
      'x-tick-source', 'cron-watchdog-1s'
    ),
    body := jsonb_build_object('source', 'cron-watchdog-1s', 'at', now())
  );
  $cronbody$
);