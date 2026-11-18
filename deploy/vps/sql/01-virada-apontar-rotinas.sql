-- Rode na VIRADA (cópia final), depois de restaurar os dados na VPS.
-- Recria as rotinas automáticas apontando para o novo endereço do painel.
--
--   docker exec -i supabase-db psql -U supabase_admin -d postgres \
--     -v base_url='https://aagencianext.com' \
--     -v anon_key='SUA_ANON_KEY' \
--     -v cron_secret='MESMO_VALOR_DE_WA_CRON_SECRET' \
--     < deploy/vps/sql/01-virada-apontar-rotinas.sql
\set ON_ERROR_STOP on
SELECT set_config('migr.base_url', :'base_url', false),
       set_config('migr.anon_key', :'anon_key', false);

-- Segredo que as rotinas enviam ao painel
INSERT INTO public.app_cron_secret (id, value) VALUES (1, :'cron_secret')
ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value;

DO $mig$
DECLARE
  b text := rtrim(current_setting('migr.base_url'), '/');
  k text := current_setting('migr.anon_key');
  r record;
BEGIN
  -- Remove as rotinas antigas (as que apontavam para *.lovable.app)
  FOR r IN SELECT jobname FROM cron.job LOOP
    PERFORM cron.unschedule(r.jobname);
  END LOOP;

  -- Rotinas que chamam o painel
  PERFORM cron.schedule('wa-campaign-worker-tick', '* * * * *', format($j$
    SELECT net.http_post(url := %L, headers := public.cron_headers('cron-1min'), body := '{}'::jsonb);$j$,
    b || '/api/public/whatsapp/queue-tick'));
  PERFORM cron.schedule('wa-queue-tick-watchdog', '1 seconds', format($j$
    SELECT net.http_post(url := %L, headers := public.cron_headers('cron-watchdog-1s'),
      body := jsonb_build_object('source','cron-watchdog-1s','at', now()));$j$,
    b || '/api/public/whatsapp/queue-tick'));
  PERFORM cron.schedule('wa-service-tick-1min', '* * * * *', format($j$
    SELECT net.http_post(url := %L, headers := public.cron_headers('cron-service-1min'),
      body := jsonb_build_object('source','cron'));$j$,
    b || '/api/public/whatsapp/service-tick'));
  PERFORM cron.schedule('wa-health-refresh-15min', '*/15 * * * *', format($j$
    SELECT net.http_post(url := %L, headers := public.cron_headers('cron-health-15min'), body := '{}'::jsonb);$j$,
    b || '/api/public/whatsapp/health-refresh'));
  PERFORM cron.schedule('wa-templates-sync-15min', '*/15 * * * *', format($j$
    SELECT net.http_post(url := %L, headers := public.cron_headers('cron-15min'), body := '{}'::jsonb);$j$,
    b || '/api/public/hooks/wa-templates-sync'));
  PERFORM cron.schedule('whatsapp-sync-numbers-6h', '0 */6 * * *', format($j$
    SELECT net.http_post(url := %L, headers := public.cron_headers('cron-6h'), body := '{}'::jsonb);$j$,
    b || '/api/public/whatsapp/sync-numbers'));
  PERFORM cron.schedule('notify-upcoming-campaigns-5min', '*/5 * * * *', format($j$
    SELECT net.http_post(url := %L, headers := public.cron_headers('cron-5min'), body := '{}'::jsonb);$j$,
    b || '/api/public/hooks/notify-upcoming-campaigns'));
  PERFORM cron.schedule('external-progress-1min', '* * * * *', format($j$
    SELECT net.http_post(url := %L,
      headers := jsonb_build_object('Content-Type','application/json','apikey', %L), body := '{}'::jsonb);$j$,
    b || '/api/public/hooks/external-progress', k));

  -- Rotinas que rodam só dentro do banco
  PERFORM cron.schedule('platform-capacity-auto-tick', '* * * * *', 'SELECT public.platform_capacity_auto_tick();');
  PERFORM cron.schedule('wa-sla-sweep-1min', '* * * * *', 'SELECT public.wa_sla_sweep();');
  PERFORM cron.schedule('wa-service-window-expiry', '* * * * *', $j$
    UPDATE public.wa_conversations SET service_window_status = 'closed', updated_at = now()
     WHERE service_window_status = 'open' AND service_window_expires_at IS NOT NULL
       AND service_window_expires_at <= now();$j$);
  PERFORM cron.schedule('wa-sim-2f6498fa', '* * * * *',
    $j$SELECT public.wa_simulate_campaign_tick('2f6498fa-737d-41e4-b92f-7d975c891069')$j$);

  -- Rotinas que ligam sozinhas quando precisam (automações / Pix)
  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION public.automation_tick_start() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'cron' AS $body$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'automation-tick') THEN
        PERFORM cron.schedule('automation-tick', '* * * * *',
          'SELECT net.http_post(url := %s, headers := public.cron_headers(''cron-automation-1min''), body := ''{}''::jsonb);');
      END IF;
    END $body$;$f$, replace(quote_literal(b || '/api/public/hooks/automation-tick'), '''', ''''''));
  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION public.inter_pix_poll_start() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'cron' AS $body$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'inter-pix-poll') THEN
        PERFORM cron.schedule('inter-pix-poll', '* * * * *',
          'SELECT net.http_post(url := %s, headers := public.cron_headers(''cron-1min''), body := ''{}''::jsonb);');
      END IF;
    END $body$;$f$, replace(quote_literal(b || '/api/public/hooks/inter-pix-poll'), '''', ''''''));

  -- Automações: religa a rotina se houver execução esperando
  PERFORM public.automation_tick_start();
END
$mig$;

SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
