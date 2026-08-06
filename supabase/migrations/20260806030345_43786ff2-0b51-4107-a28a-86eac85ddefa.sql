
CREATE TABLE IF NOT EXISTS public.wa_health_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_kind text NOT NULL,
  node_id text NOT NULL,
  connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  waba_ref_id uuid REFERENCES public.whatsapp_wabas(id) ON DELETE SET NULL,
  template_ref_id uuid REFERENCES public.whatsapp_templates(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  label text,
  can_send_message text,
  entities jsonb NOT NULL DEFAULT '[]'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  additional_info jsonb NOT NULL DEFAULT '[]'::jsonb,
  ok boolean NOT NULL DEFAULT true,
  fetch_error text,
  checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS wa_health_status_node_key ON public.wa_health_status(node_kind, node_id);
CREATE INDEX IF NOT EXISTS wa_health_status_conn_idx ON public.wa_health_status(connection_id);

CREATE TABLE IF NOT EXISTS public.wa_health_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_kind text NOT NULL,
  node_id text NOT NULL,
  connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  label text,
  entity_type text,
  previous_status text,
  new_status text,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  additional_info jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wa_health_events_created_idx ON public.wa_health_events(created_at DESC);
CREATE INDEX IF NOT EXISTS wa_health_events_node_idx ON public.wa_health_events(node_kind, node_id, created_at DESC);

GRANT SELECT ON public.wa_health_status TO authenticated;
GRANT ALL ON public.wa_health_status TO service_role;
GRANT SELECT ON public.wa_health_events TO authenticated;
GRANT ALL ON public.wa_health_events TO service_role;

ALTER TABLE public.wa_health_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_health_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_health_status_read" ON public.wa_health_status
  FOR SELECT TO authenticated
  USING (
    public.is_internal_staff(auth.uid())
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
  );

CREATE POLICY "wa_health_events_read" ON public.wa_health_events
  FOR SELECT TO authenticated
  USING (
    public.is_internal_staff(auth.uid())
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
  );

CREATE TRIGGER wa_health_status_touch BEFORE UPDATE ON public.wa_health_status
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
