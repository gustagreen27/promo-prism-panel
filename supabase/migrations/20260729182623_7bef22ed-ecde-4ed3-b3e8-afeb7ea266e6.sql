
-- 1) Cron secret store (server-only)
CREATE TABLE IF NOT EXISTS public.app_cron_secret (
  id int PRIMARY KEY DEFAULT 1,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_cron_secret ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_cron_secret FROM anon, authenticated;
GRANT ALL ON public.app_cron_secret TO service_role;

CREATE OR REPLACE FUNCTION public.cron_headers(_src text DEFAULT 'cron')
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'Content-Type','application/json',
    'x-cron-secret', COALESCE((SELECT value FROM public.app_cron_secret WHERE id=1), ''),
    'x-tick-source', _src
  );
$$;
REVOKE ALL ON FUNCTION public.cron_headers(text) FROM PUBLIC, anon, authenticated;

-- 2) Rewrite cron jobs to authenticate with the secret instead of the publishable key
SELECT cron.alter_job(1, command := $cmd$
  SELECT net.http_post(
    url := 'https://project--9c7682d6-edcd-4388-a36c-36249d4d6ab8.lovable.app/api/public/whatsapp/queue-tick',
    headers := public.cron_headers('cron-1min'),
    body := '{}'::jsonb);
$cmd$);
SELECT cron.alter_job(2, command := $cmd$
  SELECT net.http_post(
    url := 'https://project--9c7682d6-edcd-4388-a36c-36249d4d6ab8.lovable.app/api/public/hooks/wa-templates-sync',
    headers := public.cron_headers('cron-15min'),
    body := '{}'::jsonb);
$cmd$);
SELECT cron.alter_job(3, command := $cmd$
  SELECT net.http_post(
    url := 'https://project--9c7682d6-edcd-4388-a36c-36249d4d6ab8.lovable.app/api/public/whatsapp/sync-numbers',
    headers := public.cron_headers('cron-6h'),
    body := '{}'::jsonb);
$cmd$);
SELECT cron.alter_job(4, command := $cmd$
  SELECT net.http_post(
    url := 'https://project--9c7682d6-edcd-4388-a36c-36249d4d6ab8.lovable.app/api/public/hooks/notify-upcoming-campaigns',
    headers := public.cron_headers('cron-5min'),
    body := '{}'::jsonb);
$cmd$);
SELECT cron.alter_job(7, command := $cmd$
  SELECT net.http_post(
    url := 'https://project--9c7682d6-edcd-4388-a36c-36249d4d6ab8-dev.lovable.app/api/public/whatsapp/queue-tick',
    headers := public.cron_headers('cron-watchdog-1s'),
    body := jsonb_build_object('source','cron-watchdog-1s','at', now()));
$cmd$);
SELECT cron.alter_job(9, command := $cmd$
  SELECT net.http_post(
    url := 'https://project--9c7682d6-edcd-4388-a36c-36249d4d6ab8.lovable.app/api/public/whatsapp/service-tick',
    headers := public.cron_headers('cron-service-1min'),
    body := jsonb_build_object('source','cron'));
$cmd$);

-- 3) billing_settings: column-level restriction for regular users
REVOKE SELECT ON public.billing_settings FROM authenticated;
GRANT SELECT (id, default_price_cents, minimum_deposit_cents, default_minimum_messages, currency)
  ON public.billing_settings TO authenticated;
GRANT ALL ON public.billing_settings TO service_role;

-- 4) campaign_events: no anonymous/user inserts (server writes with service role)
DROP POLICY IF EXISTS "public insert events" ON public.campaign_events;
REVOKE INSERT ON public.campaign_events FROM anon;
REVOKE SELECT ON public.campaign_events FROM anon;

-- 5) Public image proxy: only paths referenced by an existing campaign
CREATE OR REPLACE FUNCTION public.ci_path_is_public(_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE to_jsonb(c)::text LIKE '%' || _path || '%'
  );
$$;
REVOKE ALL ON FUNCTION public.ci_path_is_public(text) FROM PUBLIC, anon, authenticated;

-- 6) Lock down direct execution of internal SECURITY DEFINER functions
DO $do$
DECLARE
  f record;
  allow_all text[] := ARRAY['has_role','has_workspace_role','is_workspace_member','is_internal_staff','user_workspace_ids'];
  allow_auth text[] := ARRAY[
    'get_my_context','seed_onboarding_checklist','log_auth_event','wa_check_scheduling_conflict',
    'wa_count_dispatch_clicks','wa_recalc_campaign_progress','wallet_release_reservation',
    'wallet_consume_reservation','wa_available_stock','wa_consume_stock','wallet_reserve',
    'wallet_credit','wallet_debit','wa_build_recipients','wallet_effective_price',
    'wallet_minimum_messages','wallet_required_deposit_cents','wallet_available',
    'notify_workspace','wa_hourly_sends','wa_daily_sends','wa_campaign_active_routes',
    'campaign_next_destination_cursor'
  ];
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
    IF f.proname = ANY(allow_all) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', f.sig);
    ELSIF f.proname = ANY(allow_auth) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
  END LOOP;
END
$do$;
