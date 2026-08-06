
SELECT cron.unschedule('wa-health-refresh-15min') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='wa-health-refresh-15min');
SELECT cron.schedule('wa-health-refresh-15min','*/15 * * * *', $$
  SELECT net.http_post(
    url := 'https://project--9c7682d6-edcd-4388-a36c-36249d4d6ab8.lovable.app/api/public/whatsapp/health-refresh',
    headers := public.cron_headers('cron-health-15min'),
    body := '{}'::jsonb);
$$);
