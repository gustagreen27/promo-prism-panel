
ALTER TABLE public.whatsapp_wabas
  ADD COLUMN IF NOT EXISTS access_token text,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarded_via text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;

CREATE TABLE IF NOT EXISTS public.whatsapp_onboarding_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  waba_ref_id uuid REFERENCES public.whatsapp_wabas(id) ON DELETE SET NULL,
  connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  step text NOT NULL,
  status text NOT NULL,
  payload jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_onboarding_logs TO authenticated;
GRANT ALL ON public.whatsapp_onboarding_logs TO service_role;

ALTER TABLE public.whatsapp_onboarding_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage onboarding logs"
  ON public.whatsapp_onboarding_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_onboarding_logs_waba ON public.whatsapp_onboarding_logs(waba_ref_id, created_at DESC);
