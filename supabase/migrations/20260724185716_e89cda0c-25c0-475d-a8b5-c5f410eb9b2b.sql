DO $$
DECLARE v_url text;
BEGIN
  v_url := 'https://project--9c7682d6-edcd-4388-a36c-36249d4d6ab8.lovable.app/api/public/whatsapp/service-tick';
  PERFORM cron.unschedule('wa-service-tick-1min') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='wa-service-tick-1min');
END $$;

SELECT cron.schedule(
  'wa-service-tick-1min',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--9c7682d6-edcd-4388-a36c-36249d4d6ab8.lovable.app/api/public/whatsapp/service-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_dMjzr4nN_eveNFgj5MKIcg_A-w96Vi3'
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);