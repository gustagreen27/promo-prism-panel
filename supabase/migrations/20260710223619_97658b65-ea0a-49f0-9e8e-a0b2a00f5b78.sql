
-- 1) Novos campos em wa_campaigns
ALTER TABLE public.wa_campaigns
  ADD COLUMN IF NOT EXISTS google_event_id text,
  ADD COLUMN IF NOT EXISTS google_calendar_id text,
  ADD COLUMN IF NOT EXISTS google_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS wa_campaigns_scheduling_idx
  ON public.wa_campaigns (connection_id, scheduled_at)
  WHERE status IN ('scheduled','running','paused');

CREATE INDEX IF NOT EXISTS wa_campaigns_workspace_scheduled_idx
  ON public.wa_campaigns (workspace_id, scheduled_at);

-- 2) Tabela de auditoria de campanha
CREATE TABLE IF NOT EXISTS public.campaign_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.wa_campaigns(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  from_data jsonb,
  to_data jsonb,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.campaign_audit_log TO authenticated;
GRANT ALL ON public.campaign_audit_log TO service_role;

ALTER TABLE public.campaign_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members read audit"
  ON public.campaign_audit_log FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()) OR public.is_internal_staff(auth.uid()));

CREATE POLICY "workspace members insert audit"
  ON public.campaign_audit_log FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) OR public.is_internal_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS campaign_audit_log_campaign_idx ON public.campaign_audit_log(campaign_id, created_at DESC);

-- 3) Conexão Google Calendar por workspace
CREATE TABLE IF NOT EXISTS public.workspace_google_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  connected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  google_email text,
  calendar_id text NOT NULL DEFAULT 'primary',
  calendar_name text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  scopes text,
  auto_sync boolean NOT NULL DEFAULT true,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_google_calendar TO authenticated;
GRANT ALL ON public.workspace_google_calendar TO service_role;

ALTER TABLE public.workspace_google_calendar ENABLE ROW LEVEL SECURITY;

-- Only owner/admin of the workspace can manage; but hide tokens from SELECT via a view.
CREATE POLICY "workspace owner admin manage gcal"
  ON public.workspace_google_calendar FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]));

CREATE TRIGGER workspace_google_calendar_updated
  BEFORE UPDATE ON public.workspace_google_calendar
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) Função de detecção de conflito
CREATE OR REPLACE FUNCTION public.wa_check_scheduling_conflict(
  _connection_id uuid,
  _scheduled_at timestamptz,
  _duration_min integer DEFAULT 30,
  _exclude_id uuid DEFAULT NULL
) RETURNS TABLE(id uuid, name text, scheduled_at timestamptz, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.id, c.name, c.scheduled_at, c.status::text
  FROM public.wa_campaigns c
  WHERE c.connection_id = _connection_id
    AND c.status::text IN ('scheduled','running','paused')
    AND (_exclude_id IS NULL OR c.id <> _exclude_id)
    AND c.scheduled_at IS NOT NULL
    AND c.scheduled_at BETWEEN (_scheduled_at - make_interval(mins => _duration_min))
                           AND (_scheduled_at + make_interval(mins => _duration_min))
$$;

REVOKE ALL ON FUNCTION public.wa_check_scheduling_conflict(uuid, timestamptz, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wa_check_scheduling_conflict(uuid, timestamptz, integer, uuid) TO authenticated, service_role;

-- 5) Trigger de auditoria automática para mudanças de status
CREATE OR REPLACE FUNCTION public.trg_wa_campaign_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.campaign_audit_log (campaign_id, workspace_id, actor_id, action, to_data, message)
    VALUES (NEW.id, NEW.workspace_id, NEW.created_by, 'created',
      jsonb_build_object('status', NEW.status, 'scheduled_at', NEW.scheduled_at),
      'Campanha criada');
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.campaign_audit_log (campaign_id, workspace_id, actor_id, action, from_data, to_data, message)
    VALUES (NEW.id, NEW.workspace_id, COALESCE(NEW.started_by, NEW.paused_by, NEW.canceled_by),
      NEW.status::text,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status, 'scheduled_at', NEW.scheduled_at, 'last_error', NEW.last_error),
      'Status alterado: ' || OLD.status::text || ' → ' || NEW.status::text);
  ELSIF NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at THEN
    INSERT INTO public.campaign_audit_log (campaign_id, workspace_id, action, from_data, to_data, message)
    VALUES (NEW.id, NEW.workspace_id, 'rescheduled',
      jsonb_build_object('scheduled_at', OLD.scheduled_at),
      jsonb_build_object('scheduled_at', NEW.scheduled_at),
      'Reagendada');
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_wa_campaign_audit ON public.wa_campaigns;
CREATE TRIGGER trg_wa_campaign_audit
  AFTER INSERT OR UPDATE ON public.wa_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.trg_wa_campaign_audit();
