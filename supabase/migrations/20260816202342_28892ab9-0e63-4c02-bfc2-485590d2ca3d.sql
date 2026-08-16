select net.http_post(
  url := 'https://graph.facebook.com/v21.0/1007888915415085/subscribed_apps',
  headers := jsonb_build_object('Authorization', 'Bearer ' || coalesce((select access_token from public.whatsapp_wabas where waba_id = '1007888915415085' and access_token is not null limit 1), (select access_token from public.whatsapp_connections where waba_id = '1007888915415085' and access_token is not null limit 1)), 'Content-Type','application/json'),
  body := '{}'::jsonb
) as req_id;