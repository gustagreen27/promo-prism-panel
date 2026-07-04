
-- ============ FASE A: Modelo white-glove ============

-- 1. wa_campaign_status: novos estados
ALTER TYPE public.wa_campaign_status ADD VALUE IF NOT EXISTS 'awaiting_approval';
ALTER TYPE public.wa_campaign_status ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE public.wa_campaign_status ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE public.wa_campaign_status ADD VALUE IF NOT EXISTS 'blocked';
ALTER TYPE public.wa_campaign_status ADD VALUE IF NOT EXISTS 'queued';

-- 2. whatsapp_connections: campos de disponibilidade
ALTER TABLE public.whatsapp_connections
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'internal'
    CHECK (visibility IN ('internal','shared','exclusive')),
  ADD COLUMN IF NOT EXISTS daily_cap int,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS quality_visible_to_client bool NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes text;

-- 3. whatsapp_number_grants
CREATE TABLE IF NOT EXISTS public.whatsapp_number_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_number_grants_unique
  ON public.whatsapp_number_grants (connection_id, workspace_id, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid));
GRANT SELECT ON public.whatsapp_number_grants TO authenticated;
GRANT ALL ON public.whatsapp_number_grants TO service_role;
ALTER TABLE public.whatsapp_number_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_all_number_grants" ON public.whatsapp_number_grants
  FOR ALL TO authenticated USING (public.is_internal_staff(auth.uid())) WITH CHECK (public.is_internal_staff(auth.uid()));
CREATE POLICY "client_read_own_number_grants" ON public.whatsapp_number_grants
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));

-- 4. whatsapp_templates: visibility
ALTER TABLE public.whatsapp_templates
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'internal'
    CHECK (visibility IN ('internal','shared','exclusive'));

-- 5. whatsapp_template_grants
CREATE TABLE IF NOT EXISTS public.whatsapp_template_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.whatsapp_templates(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (workspace_id IS NOT NULL OR connection_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS wtg_template ON public.whatsapp_template_grants(template_id);
CREATE INDEX IF NOT EXISTS wtg_workspace ON public.whatsapp_template_grants(workspace_id);
GRANT SELECT ON public.whatsapp_template_grants TO authenticated;
GRANT ALL ON public.whatsapp_template_grants TO service_role;
ALTER TABLE public.whatsapp_template_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_all_template_grants" ON public.whatsapp_template_grants
  FOR ALL TO authenticated USING (public.is_internal_staff(auth.uid())) WITH CHECK (public.is_internal_staff(auth.uid()));
CREATE POLICY "client_read_own_template_grants" ON public.whatsapp_template_grants
  FOR SELECT TO authenticated USING (workspace_id IS NULL OR public.is_workspace_member(workspace_id, auth.uid()));

-- 6. whatsapp_template_requests
CREATE TABLE IF NOT EXISTS public.whatsapp_template_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  name text NOT NULL,
  category text NOT NULL,
  language text NOT NULL DEFAULT 'pt_BR',
  header_type text,
  header_media_type text,
  body text NOT NULL,
  footer text,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  buttons jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','em_revisao','enviado_meta','aprovado','rejeitado')),
  admin_notes text,
  created_template_id uuid REFERENCES public.whatsapp_templates(id),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.whatsapp_template_requests TO authenticated;
GRANT ALL ON public.whatsapp_template_requests TO service_role;
ALTER TABLE public.whatsapp_template_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_all_template_requests" ON public.whatsapp_template_requests
  FOR ALL TO authenticated USING (public.is_internal_staff(auth.uid())) WITH CHECK (public.is_internal_staff(auth.uid()));
CREATE POLICY "client_manage_own_template_requests" ON public.whatsapp_template_requests
  FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE TRIGGER trg_wtr_updated BEFORE UPDATE ON public.whatsapp_template_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. wa_campaigns: aprovação
ALTER TABLE public.wa_campaigns
  ADD COLUMN IF NOT EXISTS approval_mode text NOT NULL DEFAULT 'auto'
    CHECK (approval_mode IN ('auto','manual')),
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'not_required'
    CHECK (approval_status IN ('not_required','pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- 8. workspaces: aprovação e bloqueio
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS approval_mode text NOT NULL DEFAULT 'auto'
    CHECK (approval_mode IN ('auto','manual')),
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS block_reason text;

-- 9. message_stock_reservations
CREATE TABLE IF NOT EXISTS public.message_stock_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.wa_campaigns(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  qty_reserved int NOT NULL DEFAULT 0,
  qty_consumed int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'held' CHECK (status IN ('held','consumed','released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS msr_campaign ON public.message_stock_reservations(campaign_id);
GRANT SELECT ON public.message_stock_reservations TO authenticated;
GRANT ALL ON public.message_stock_reservations TO service_role;
ALTER TABLE public.message_stock_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_all_reservations" ON public.message_stock_reservations
  FOR ALL TO authenticated USING (public.is_internal_staff(auth.uid())) WITH CHECK (public.is_internal_staff(auth.uid()));
CREATE POLICY "client_read_own_reservations" ON public.message_stock_reservations
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE TRIGGER trg_msr_updated BEFORE UPDATE ON public.message_stock_reservations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 10. VIEWS seguras para clientes
DROP VIEW IF EXISTS public.v_client_numbers;
CREATE VIEW public.v_client_numbers WITH (security_invoker=on) AS
SELECT
  c.id,
  COALESCE(c.display_name, c.nome_interno, c.name) AS display_name,
  regexp_replace(COALESCE(c.display_phone, c.phone, ''), '(\d{2,4})$', '****') AS phone_masked,
  c.status,
  CASE WHEN c.quality_visible_to_client THEN c.quality_rating ELSE NULL END AS quality_rating,
  c.daily_cap,
  c.paused_at,
  c.visibility,
  g.workspace_id,
  g.project_id
FROM public.whatsapp_connections c
JOIN public.whatsapp_number_grants g ON g.connection_id = c.id
WHERE c.status IS DISTINCT FROM 'inactive'
  AND c.paused_at IS NULL
  AND c.visibility IN ('shared','exclusive');
GRANT SELECT ON public.v_client_numbers TO authenticated;

DROP VIEW IF EXISTS public.v_client_templates;
CREATE VIEW public.v_client_templates WITH (security_invoker=on) AS
SELECT
  t.id,
  t.name,
  t.language,
  t.category,
  t.status,
  t.header_type,
  t.header_text,
  t.body,
  t.footer,
  t.variables,
  t.buttons,
  t.visibility,
  g.workspace_id,
  g.connection_id
FROM public.whatsapp_templates t
LEFT JOIN public.whatsapp_template_grants g ON g.template_id = t.id
WHERE t.status = 'approved'
  AND t.visibility IN ('shared','exclusive');
GRANT SELECT ON public.v_client_templates TO authenticated;

-- 11. Bloqueio de leitura direta de credenciais em whatsapp_connections para o cliente
-- (as policies staff/workspace já existem; cliente só deve usar a view v_client_numbers)
