
-- 1) Tabela WABAs
CREATE TABLE IF NOT EXISTS public.whatsapp_wabas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_interno text NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  business_id text,
  waba_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'ativo',
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_wabas TO authenticated;
GRANT ALL ON public.whatsapp_wabas TO service_role;

ALTER TABLE public.whatsapp_wabas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage wabas" ON public.whatsapp_wabas
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_whatsapp_wabas_updated
  BEFORE UPDATE ON public.whatsapp_wabas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Evolução whatsapp_connections (Números)
ALTER TABLE public.whatsapp_connections
  ADD COLUMN IF NOT EXISTS waba_ref_id uuid REFERENCES public.whatsapp_wabas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS nome_interno text,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS messaging_limit text;

-- 3) Evolução whatsapp_templates
ALTER TABLE public.whatsapp_templates
  ADD COLUMN IF NOT EXISTS waba_ref_id uuid REFERENCES public.whatsapp_wabas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS header_media_url text,
  ADD COLUMN IF NOT EXISTS variables_examples jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS history jsonb DEFAULT '[]'::jsonb;

-- 4) Evolução wa_campaigns
ALTER TABLE public.wa_campaigns
  ADD COLUMN IF NOT EXISTS waba_ref_id uuid REFERENCES public.whatsapp_wabas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conn_waba_ref ON public.whatsapp_connections(waba_ref_id);
CREATE INDEX IF NOT EXISTS idx_tpl_waba_ref ON public.whatsapp_templates(waba_ref_id);
CREATE INDEX IF NOT EXISTS idx_camp_waba_ref ON public.wa_campaigns(waba_ref_id);
