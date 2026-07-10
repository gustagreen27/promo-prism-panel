
-- 1. whatsapp_connections: novos campos
ALTER TABLE public.whatsapp_connections
  ADD COLUMN IF NOT EXISTS use_global_token boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS current_display_name text,
  ADD COLUMN IF NOT EXISTS requested_display_name text,
  ADD COLUMN IF NOT EXISTS display_name_status text,
  ADD COLUMN IF NOT EXISTS display_name_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS display_name_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS display_name_applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS display_name_rejection_reason text,
  ADD COLUMN IF NOT EXISTS last_meta_sync_at timestamptz;

-- Backfill: conexões sem token próprio ficam com use_global_token=true
UPDATE public.whatsapp_connections
  SET use_global_token = true
  WHERE (access_token IS NULL OR access_token = '') AND use_global_token = false;

-- 2. Audit logs
CREATE TABLE IF NOT EXISTS public.whatsapp_profile_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL,
  phone_number_id text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  previous_value jsonb,
  new_value jsonb,
  status text NOT NULL DEFAULT 'success',
  meta_error_code text,
  meta_error_subcode text,
  meta_error_type text,
  meta_fbtrace_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_profile_audit_conn ON public.whatsapp_profile_audit_logs(connection_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_profile_audit_ws ON public.whatsapp_profile_audit_logs(workspace_id, created_at DESC);

GRANT SELECT ON public.whatsapp_profile_audit_logs TO authenticated;
GRANT ALL ON public.whatsapp_profile_audit_logs TO service_role;
ALTER TABLE public.whatsapp_profile_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read audit"
  ON public.whatsapp_profile_audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. Display name PIN attempts (rate-limit)
CREATE TABLE IF NOT EXISTS public.whatsapp_display_name_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  success boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_dn_attempts_conn ON public.whatsapp_display_name_attempts(connection_id, created_at DESC);

GRANT SELECT ON public.whatsapp_display_name_attempts TO authenticated;
GRANT ALL ON public.whatsapp_display_name_attempts TO service_role;
ALTER TABLE public.whatsapp_display_name_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read attempts"
  ON public.whatsapp_display_name_attempts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
