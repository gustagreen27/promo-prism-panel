
-- =====================================================================
-- FASE 1 — Fundação do módulo de atendimento WhatsApp
-- Aditiva, não altera nada existente
-- =====================================================================

-- 1) wa_conversations
CREATE TABLE IF NOT EXISTS public.wa_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  contact_phone TEXT NOT NULL,
  contact_name TEXT,
  wa_id TEXT,
  -- Vínculo com campanha (opcional; pode ser nulo se a conversa foi iniciada fora)
  campaign_id UUID REFERENCES public.wa_campaigns(id) ON DELETE SET NULL,
  campaign_recipient_id UUID REFERENCES public.campaign_recipients(id) ON DELETE SET NULL,
  campaign_route_id UUID REFERENCES public.wa_campaign_routes(id) ON DELETE SET NULL,
  locked_route_id UUID REFERENCES public.wa_campaign_routes(id) ON DELETE SET NULL,
  -- Número da nossa conta que responde a essa conversa (obrigatório após 1ª inbound)
  connection_id UUID REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL,
  phone_number_id TEXT,
  waba_id TEXT,
  template_id UUID,
  template_name TEXT,
  -- Fluxo (usado na Fase 2)
  flow_id UUID,
  flow_version_id UUID,
  -- Atribuição
  assigned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Janela 24h
  last_inbound_at TIMESTAMPTZ,
  last_outbound_at TIMESTAMPTZ,
  service_window_opened_at TIMESTAMPTZ,
  service_window_expires_at TIMESTAMPTZ,
  service_window_status TEXT NOT NULL DEFAULT 'closed', -- 'open' | 'closed'
  -- Estado
  conversation_status TEXT NOT NULL DEFAULT 'open', -- open | waiting | in_progress | resolved | archived
  unread_count INTEGER NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wa_conversations_ws_conn_phone_uk
  ON public.wa_conversations(workspace_id, connection_id, contact_phone)
  WHERE connection_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS wa_conversations_ws_updated_idx
  ON public.wa_conversations(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS wa_conversations_ws_status_idx
  ON public.wa_conversations(workspace_id, conversation_status);
CREATE INDEX IF NOT EXISTS wa_conversations_ws_window_idx
  ON public.wa_conversations(workspace_id, service_window_status, service_window_expires_at);
CREATE INDEX IF NOT EXISTS wa_conversations_campaign_idx
  ON public.wa_conversations(campaign_id);
CREATE INDEX IF NOT EXISTS wa_conversations_assigned_idx
  ON public.wa_conversations(assigned_user_id);
CREATE INDEX IF NOT EXISTS wa_conversations_phone_idx
  ON public.wa_conversations(contact_phone);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_conversations TO authenticated;
GRANT ALL ON public.wa_conversations TO service_role;

ALTER TABLE public.wa_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_conv_ws_members_select" ON public.wa_conversations
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()) OR public.is_internal_staff(auth.uid()));

CREATE POLICY "wa_conv_ws_members_write" ON public.wa_conversations
  FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()) OR public.is_internal_staff(auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) OR public.is_internal_staff(auth.uid()));

CREATE TRIGGER wa_conversations_updated_at
  BEFORE UPDATE ON public.wa_conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- 2) wa_conversation_messages
CREATE TABLE IF NOT EXISTS public.wa_conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL, -- 'inbound' | 'outbound'
  origin TEXT NOT NULL DEFAULT 'manual', -- campaign | manual | automation | template | note | system
  wamid TEXT,
  context_wamid TEXT, -- id da mensagem citada
  message_type TEXT NOT NULL DEFAULT 'text', -- text | image | video | audio | document | sticker | location | contacts | interactive | template | reaction | button | order | unsupported
  interactive_type TEXT, -- button | list | button_reply | list_reply | cta_url ...
  body TEXT,
  media_url TEXT,
  media_mime TEXT,
  media_id TEXT,
  media_caption TEXT,
  media_filename TEXT,
  interactive_button_id TEXT,
  interactive_button_title TEXT,
  interactive_list_id TEXT,
  interactive_list_title TEXT,
  template_id UUID,
  template_name TEXT,
  template_language TEXT,
  template_variables JSONB,
  status TEXT NOT NULL DEFAULT 'received', -- received | queued | sent | delivered | read | failed
  error_code TEXT,
  error_message TEXT,
  sent_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.wa_campaigns(id) ON DELETE SET NULL,
  campaign_recipient_id UUID REFERENCES public.campaign_recipients(id) ON DELETE SET NULL,
  payload JSONB,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotência: um wamid nunca duplica (por workspace, para permitir múltiplos wabas)
CREATE UNIQUE INDEX IF NOT EXISTS wa_conv_msg_wamid_uk
  ON public.wa_conversation_messages(workspace_id, wamid)
  WHERE wamid IS NOT NULL;

CREATE INDEX IF NOT EXISTS wa_conv_msg_conv_created_idx
  ON public.wa_conversation_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wa_conv_msg_conv_created_asc_idx
  ON public.wa_conversation_messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS wa_conv_msg_ws_created_idx
  ON public.wa_conversation_messages(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wa_conv_msg_status_idx
  ON public.wa_conversation_messages(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_conversation_messages TO authenticated;
GRANT ALL ON public.wa_conversation_messages TO service_role;

ALTER TABLE public.wa_conversation_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_conv_msg_ws_members_select" ON public.wa_conversation_messages
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()) OR public.is_internal_staff(auth.uid()));

CREATE POLICY "wa_conv_msg_ws_members_write" ON public.wa_conversation_messages
  FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()) OR public.is_internal_staff(auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) OR public.is_internal_staff(auth.uid()));

CREATE TRIGGER wa_conv_msg_updated_at
  BEFORE UPDATE ON public.wa_conversation_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- 3) wa_service_queue (fila separada do atendimento)
CREATE TABLE IF NOT EXISTS public.wa_service_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL,
  phone_number_id TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  message_id UUID REFERENCES public.wa_conversation_messages(id) ON DELETE SET NULL,
  payload JSONB NOT NULL,
  idempotency_key TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | processing | sent | failed | cancelled
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  wamid TEXT,
  origin TEXT NOT NULL DEFAULT 'manual', -- manual | automation | template
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wa_service_queue_idem_uk
  ON public.wa_service_queue(workspace_id, idempotency_key);
CREATE INDEX IF NOT EXISTS wa_service_queue_pending_idx
  ON public.wa_service_queue(status, next_attempt_at)
  WHERE status IN ('pending','processing');
CREATE INDEX IF NOT EXISTS wa_service_queue_conv_idx
  ON public.wa_service_queue(conversation_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_service_queue TO authenticated;
GRANT ALL ON public.wa_service_queue TO service_role;

ALTER TABLE public.wa_service_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_srv_queue_ws_members" ON public.wa_service_queue
  FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()) OR public.is_internal_staff(auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) OR public.is_internal_staff(auth.uid()));

CREATE TRIGGER wa_service_queue_updated_at
  BEFORE UPDATE ON public.wa_service_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- 4) wa_conversation_events
CREATE TABLE IF NOT EXISTS public.wa_conversation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- assigned | status_change | window_open | window_close | flow_step | tag_add | tag_remove | note
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wa_conv_events_conv_idx
  ON public.wa_conversation_events(conversation_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_conversation_events TO authenticated;
GRANT ALL ON public.wa_conversation_events TO service_role;

ALTER TABLE public.wa_conversation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_conv_events_ws_members" ON public.wa_conversation_events
  FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()) OR public.is_internal_staff(auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) OR public.is_internal_staff(auth.uid()));


-- 5) wa_internal_notes
CREATE TABLE IF NOT EXISTS public.wa_internal_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wa_internal_notes_conv_idx
  ON public.wa_internal_notes(conversation_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_internal_notes TO authenticated;
GRANT ALL ON public.wa_internal_notes TO service_role;

ALTER TABLE public.wa_internal_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_notes_ws_members" ON public.wa_internal_notes
  FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()) OR public.is_internal_staff(auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) OR public.is_internal_staff(auth.uid()));

CREATE TRIGGER wa_internal_notes_updated_at
  BEFORE UPDATE ON public.wa_internal_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- 6) Colunas aditivas em wa_campaigns (usadas na Fase 2, default seguro)
ALTER TABLE public.wa_campaigns
  ADD COLUMN IF NOT EXISTS response_flow_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS response_flow_id UUID,
  ADD COLUMN IF NOT EXISTS response_flow_version_id UUID,
  ADD COLUMN IF NOT EXISTS response_flow_config JSONB;


-- 7) Realtime
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_conversations; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_conversation_messages; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

ALTER TABLE public.wa_conversations REPLICA IDENTITY FULL;
ALTER TABLE public.wa_conversation_messages REPLICA IDENTITY FULL;


-- 8) Helper: abre/atualiza janela de 24h ao registrar inbound
CREATE OR REPLACE FUNCTION public.wa_touch_service_window(_conversation_id UUID, _inbound_at TIMESTAMPTZ DEFAULT now())
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.wa_conversations
    SET last_inbound_at = _inbound_at,
        service_window_opened_at = _inbound_at,
        service_window_expires_at = _inbound_at + interval '24 hours',
        service_window_status = 'open',
        updated_at = now()
  WHERE id = _conversation_id;
END $$;


-- 9) Cron: fechar janelas expiradas a cada minuto (não altera métricas de campanha)
DO $$ BEGIN
  PERFORM cron.unschedule('wa-service-window-expiry');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'wa-service-window-expiry',
  '* * * * *',
  $$
    UPDATE public.wa_conversations
       SET service_window_status = 'closed', updated_at = now()
     WHERE service_window_status = 'open'
       AND service_window_expires_at IS NOT NULL
       AND service_window_expires_at <= now();
  $$
);
