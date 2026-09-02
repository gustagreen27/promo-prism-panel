-- lovable-cron-fallback-reviewed: 1440 runs/day; necessário porque a simulação externa precisa avançar os contadores a cada minuto até o horário de finalização configurado
select cron.unschedule('external-progress-1min');
select cron.schedule('external-progress-1min', '*/1 * * * *', $$
  select net.http_post(
    url:='https://project--9c7682d6-edcd-4388-a36c-36249d4d6ab8-dev.lovable.app/api/public/hooks/external-progress',
    headers:='{"Content-Type": "application/json", "apikey": "sb_publishable_dMjzr4nN_eveNFgj5MKIcg_A-w96Vi3"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
$$);