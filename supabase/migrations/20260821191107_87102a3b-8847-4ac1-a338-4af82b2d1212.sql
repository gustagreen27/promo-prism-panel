ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS allow_tests boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.wa_test_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  campaign_id uuid,
  connection_id uuid,
  template_id uuid,
  phone text NOT NULL,
  phone_raw text,
  status text NOT NULL DEFAULT 'queued',
  meta_message_id text,
  error_code text,
  error_message text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.wa_test_sends TO authenticated;
GRANT ALL ON public.wa_test_sends TO service_role;

ALTER TABLE public.wa_test_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_test_sends_member_read" ON public.wa_test_sends;
CREATE POLICY "wa_test_sends_member_read" ON public.wa_test_sends
FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()) OR public.is_internal_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_wa_test_sends_ws_created ON public.wa_test_sends (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_test_sends_campaign ON public.wa_test_sends (campaign_id);

DROP TRIGGER IF EXISTS trg_wa_test_sends_updated ON public.wa_test_sends;
CREATE TRIGGER trg_wa_test_sends_updated BEFORE UPDATE ON public.wa_test_sends
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();