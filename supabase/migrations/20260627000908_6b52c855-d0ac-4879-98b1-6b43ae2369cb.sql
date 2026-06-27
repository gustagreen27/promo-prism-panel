DO $$ BEGIN
  CREATE TYPE public.campaign_event_type AS ENUM (
    'page_view',
    'iframe_loaded',
    'iframe_blocked',
    'redirect_started',
    'redirect_completed',
    'cta_clicked',
    'utm_detected',
    'duplicate_click',
    'returning_visitor',
    'bot_detected'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  click_id uuid REFERENCES public.campaign_clicks(id) ON DELETE SET NULL,
  event_type public.campaign_event_type NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.campaign_events TO authenticated;
GRANT INSERT ON public.campaign_events TO anon, authenticated;
GRANT ALL ON public.campaign_events TO service_role;

ALTER TABLE public.campaign_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read events" ON public.campaign_events;
CREATE POLICY "admins read events" ON public.campaign_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "public insert events" ON public.campaign_events;
CREATE POLICY "public insert events" ON public.campaign_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS campaign_events_campaign_idx
  ON public.campaign_events (campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS campaign_events_type_idx
  ON public.campaign_events (event_type, created_at DESC);