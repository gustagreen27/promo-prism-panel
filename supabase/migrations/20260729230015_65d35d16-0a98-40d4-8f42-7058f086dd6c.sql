SELECT net.http_post(
  url := 'https://disparosfr.com/api/public/whatsapp/service-tick',
  headers := public.cron_headers('response-flow-repair'),
  body := jsonb_build_object('source','response-flow-repair','campaign_id','a64c8645-9168-409a-83a5-c179677aa144')
);