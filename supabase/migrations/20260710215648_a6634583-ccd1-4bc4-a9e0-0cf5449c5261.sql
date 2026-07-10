
ALTER TABLE public.whatsapp_connections
  ADD COLUMN IF NOT EXISTS onboarding_mode text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS coexistence_status text,
  ADD COLUMN IF NOT EXISTS embedded_signup_completed_at timestamptz;

ALTER TABLE public.whatsapp_connections
  DROP CONSTRAINT IF EXISTS whatsapp_connections_onboarding_mode_check;
ALTER TABLE public.whatsapp_connections
  ADD CONSTRAINT whatsapp_connections_onboarding_mode_check
  CHECK (onboarding_mode IN ('standard','coexistence'));

ALTER TABLE public.whatsapp_connections
  DROP CONSTRAINT IF EXISTS whatsapp_connections_coexistence_status_check;
ALTER TABLE public.whatsapp_connections
  ADD CONSTRAINT whatsapp_connections_coexistence_status_check
  CHECK (coexistence_status IS NULL OR coexistence_status IN ('pending','connected','attention_required','disconnected'));

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_connections_workspace_phone_key
  ON public.whatsapp_connections (workspace_id, phone_number_id)
  WHERE workspace_id IS NOT NULL AND phone_number_id IS NOT NULL;
