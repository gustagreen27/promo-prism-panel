-- lovable-cron-fallback-reviewed: 1440 runs/day; job já existente de processamento da fila de disparos, apenas reapontado para a URL de preview que contém a proteção de execução externa
select cron.unschedule('wa-campaign-worker-tick');
select cron.schedule('wa-campaign-worker-tick', '* * * * *', $$
  SELECT net.http_post(
    url := 'https://project--9c7682d6-edcd-4388-a36c-36249d4d6ab8-dev.lovable.app/api/public/whatsapp/queue-tick',
    headers := public.cron_headers('cron-1min'),
    body := '{}'::jsonb
  ) as request_id;
$$);