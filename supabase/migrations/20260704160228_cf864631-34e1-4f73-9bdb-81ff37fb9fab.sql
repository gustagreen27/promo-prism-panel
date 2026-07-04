
-- Extend enums
ALTER TYPE public.wa_campaign_status ADD VALUE IF NOT EXISTS 'partial';
ALTER TYPE public.wa_recipient_status ADD VALUE IF NOT EXISTS 'accepted';
ALTER TYPE public.wa_recipient_status ADD VALUE IF NOT EXISTS 'skipped';

-- Extend wa_campaigns
ALTER TABLE public.wa_campaigns
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS resumed_at timestamptz,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz,
  ADD COLUMN IF NOT EXISTS started_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paused_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS canceled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS last_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS avg_speed_per_min numeric(10,2),
  ADD COLUMN IF NOT EXISTS final_report jsonb,
  ADD COLUMN IF NOT EXISTS worker_lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS worker_lease_id uuid;

-- Extend recipients
ALTER TABLE public.campaign_recipients
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS responded_at timestamptz;

-- Dedup index (unique per campaign+phone)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_recipient_campaign_phone
  ON public.campaign_recipients(campaign_id, phone);

-- Timeline table
CREATE TABLE IF NOT EXISTS public.campaign_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.wa_campaigns(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.campaign_timeline TO authenticated;
GRANT ALL ON public.campaign_timeline TO service_role;

ALTER TABLE public.campaign_timeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage timeline"
  ON public.campaign_timeline
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_timeline_campaign_created
  ON public.campaign_timeline(campaign_id, created_at DESC);

-- Helper: recalc progress + counters + finalize
CREATE OR REPLACE FUNCTION public.wa_recalc_campaign_progress(_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total int := 0;
  c_pending int := 0;
  c_processing int := 0;
  c_sent int := 0;
  c_delivered int := 0;
  c_read int := 0;
  c_replied int := 0;
  c_failed int := 0;
  c_optout int := 0;
  c_cancelled int := 0;
  c_skipped int := 0;
  c_accepted int := 0;
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT status, count(*) AS n
    FROM public.campaign_recipients
    WHERE campaign_id = _campaign_id
    GROUP BY status
  LOOP
    total := total + rec.n;
    CASE rec.status::text
      WHEN 'pending' THEN c_pending := rec.n;
      WHEN 'processing' THEN c_processing := rec.n;
      WHEN 'accepted' THEN c_accepted := rec.n;
      WHEN 'sent' THEN c_sent := rec.n;
      WHEN 'delivered' THEN c_delivered := rec.n;
      WHEN 'read' THEN c_read := rec.n;
      WHEN 'replied' THEN c_replied := rec.n;
      WHEN 'failed' THEN c_failed := rec.n;
      WHEN 'opt_out' THEN c_optout := rec.n;
      WHEN 'cancelled' THEN c_cancelled := rec.n;
      WHEN 'skipped' THEN c_skipped := rec.n;
      ELSE NULL;
    END CASE;
  END LOOP;

  UPDATE public.wa_campaigns SET
    progress = jsonb_build_object(
      'total', total,
      'pending', c_pending,
      'processing', c_processing,
      'accepted', c_accepted,
      'sent', c_sent + c_delivered + c_read + c_replied,
      'delivered', c_delivered + c_read + c_replied,
      'read', c_read + c_replied,
      'replied', c_replied,
      'failed', c_failed,
      'opt_out', c_optout,
      'cancelled', c_cancelled,
      'skipped', c_skipped,
      'processed', total - c_pending - c_processing,
      'percent', CASE WHEN total > 0
        THEN round(((total - c_pending - c_processing)::numeric / total::numeric) * 100, 2)
        ELSE 0 END
    ),
    sent_count = c_sent + c_delivered + c_read + c_replied,
    delivered_count = c_delivered + c_read + c_replied,
    read_count = c_read + c_replied,
    replied_count = c_replied,
    failed_count = c_failed
  WHERE id = _campaign_id;
END;
$$;

-- Trigger recalcs on recipient status change
CREATE OR REPLACE FUNCTION public.trg_wa_recipient_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status) THEN
    PERFORM public.wa_recalc_campaign_progress(COALESCE(NEW.campaign_id, OLD.campaign_id));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wa_recipient_progress ON public.campaign_recipients;
CREATE TRIGGER trg_wa_recipient_progress
AFTER INSERT OR UPDATE OF status ON public.campaign_recipients
FOR EACH ROW EXECUTE FUNCTION public.trg_wa_recipient_touch();

-- Timeline event on campaign status change
CREATE OR REPLACE FUNCTION public.trg_wa_campaign_status_timeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.campaign_timeline (campaign_id, event_type, message, payload)
    VALUES (NEW.id, 'created', 'Campanha criada', jsonb_build_object('status', NEW.status));
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.campaign_timeline (campaign_id, event_type, message, payload)
    VALUES (NEW.id, 'status_change',
      'Status: ' || OLD.status::text || ' → ' || NEW.status::text,
      jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wa_campaign_status ON public.wa_campaigns;
CREATE TRIGGER trg_wa_campaign_status
AFTER INSERT OR UPDATE OF status ON public.wa_campaigns
FOR EACH ROW EXECUTE FUNCTION public.trg_wa_campaign_status_timeline();

-- Ensure extensions & schedule worker
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
