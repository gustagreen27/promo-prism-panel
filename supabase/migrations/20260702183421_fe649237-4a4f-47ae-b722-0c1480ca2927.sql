
CREATE TABLE public.message_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.wa_campaigns(id) ON DELETE SET NULL,
  recipient_id uuid REFERENCES public.campaign_recipients(id) ON DELETE SET NULL,
  connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL,
  to_phone text NOT NULL,
  template_name text,
  language_code text,
  request_payload jsonb,
  response_payload jsonb,
  meta_message_id text,
  message_status text,
  failed_reason text,
  error_code text,
  http_status int,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_logs TO authenticated;
GRANT ALL ON public.message_logs TO service_role;

ALTER TABLE public.message_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage message_logs" ON public.message_logs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX message_logs_meta_id_idx ON public.message_logs(meta_message_id);
CREATE INDEX message_logs_campaign_idx ON public.message_logs(campaign_id);
CREATE INDEX message_logs_recipient_idx ON public.message_logs(recipient_id);

CREATE TRIGGER trg_message_logs_updated
  BEFORE UPDATE ON public.message_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
