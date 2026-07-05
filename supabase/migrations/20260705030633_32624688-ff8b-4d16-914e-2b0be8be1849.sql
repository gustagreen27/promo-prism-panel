
-- Notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','success','warning','error')),
  title text NOT NULL,
  body text,
  link text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_ws_created ON public.notifications(workspace_id, created_at DESC);
CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, is_read) WHERE is_read = false;

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read workspace notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (
    (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
    OR user_id = auth.uid()
    OR public.is_internal_staff(auth.uid())
  );

CREATE POLICY "Members mark own notifications read"
  ON public.notifications FOR UPDATE TO authenticated
  USING (
    (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
    OR user_id = auth.uid()
  )
  WITH CHECK (
    (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
    OR user_id = auth.uid()
  );

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- Notify helper
CREATE OR REPLACE FUNCTION public.notify_workspace(
  _ws uuid, _kind text, _title text, _body text DEFAULT NULL,
  _link text DEFAULT NULL, _severity text DEFAULT 'info',
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.notifications(workspace_id, kind, title, body, link, severity, metadata)
  VALUES (_ws, _kind, _title, _body, _link, _severity, COALESCE(_metadata,'{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Trigger for wa_campaigns lifecycle
CREATE OR REPLACE FUNCTION public.trg_notify_wa_campaign()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_link text; v_sev text; v_title text; v_body text;
BEGIN
  v_link := '/painel/campanhas/' || NEW.id::text;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_workspace(
      NEW.workspace_id, 'campaign.created',
      'Campanha criada', 'A campanha "' || COALESCE(NEW.name,'sem nome') || '" foi criada.',
      v_link, 'info', jsonb_build_object('campaign_id', NEW.id)
    );
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_sev := CASE NEW.status::text
      WHEN 'failed' THEN 'error'
      WHEN 'completed' THEN 'success'
      WHEN 'paused' THEN 'warning'
      ELSE 'info' END;
    v_title := 'Campanha ' || CASE NEW.status::text
      WHEN 'running' THEN 'em execução'
      WHEN 'scheduled' THEN 'agendada'
      WHEN 'completed' THEN 'concluída'
      WHEN 'failed' THEN 'falhou'
      WHEN 'paused' THEN 'pausada'
      WHEN 'cancelled' THEN 'cancelada'
      ELSE NEW.status::text END;
    v_body := '"' || COALESCE(NEW.name,'sem nome') || '" agora está ' || NEW.status::text || '.';
    PERFORM public.notify_workspace(
      NEW.workspace_id, 'campaign.status', v_title, v_body, v_link, v_sev,
      jsonb_build_object('campaign_id', NEW.id, 'from', OLD.status, 'to', NEW.status)
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_wa_campaign ON public.wa_campaigns;
CREATE TRIGGER trg_notify_wa_campaign
  AFTER INSERT OR UPDATE OF status ON public.wa_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_wa_campaign();

-- Trigger for campaigns (cloaker) creation
CREATE OR REPLACE FUNCTION public.trg_notify_campaign()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.workspace_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_workspace(
      NEW.workspace_id, 'cloaker.created',
      'Página pública criada',
      'A página "' || COALESCE(NEW.name,'sem nome') || '" está disponível em /' || NEW.slug,
      '/' || NEW.slug, 'success',
      jsonb_build_object('campaign_id', NEW.id, 'slug', NEW.slug)
    );
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.notify_workspace(
      NEW.workspace_id, 'cloaker.status',
      'Status da página alterado',
      '"' || COALESCE(NEW.name,'sem nome') || '" agora está ' || NEW.status::text,
      '/' || NEW.slug, 'info',
      jsonb_build_object('campaign_id', NEW.id, 'to', NEW.status)
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_campaign ON public.campaigns;
CREATE TRIGGER trg_notify_campaign
  AFTER INSERT OR UPDATE OF status ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_campaign();
