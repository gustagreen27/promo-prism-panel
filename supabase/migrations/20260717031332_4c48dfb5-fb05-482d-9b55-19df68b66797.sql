-- 1) Unique wamid per campaign (guards against double-send races).
CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_recipients_wamid
  ON public.campaign_recipients (campaign_id, meta_message_id)
  WHERE meta_message_id IS NOT NULL;

-- 2) Watchdog cron: 10-second recovery loop. Self-chain remains the primary
-- loop; queue-tick already holds a global lease (wa_tick_acquire_lease) so
-- overlapping invocations cannot process the same campaign twice.
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
      FROM cron.job WHERE jobname = 'wa-queue-tick-watchdog';
  END IF;
END $mig$;

SELECT cron.schedule(
  'wa-queue-tick-watchdog',
  '10 seconds',
  $cronbody$
  SELECT net.http_post(
    url := 'https://project--9c7682d6-edcd-4388-a36c-36249d4d6ab8.lovable.app/api/public/whatsapp/queue-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-tick-source', 'cron-watchdog'
    ),
    body := '{}'::jsonb
  );
  $cronbody$
);