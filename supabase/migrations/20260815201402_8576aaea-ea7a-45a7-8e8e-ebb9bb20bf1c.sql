CREATE TABLE public.imported_dispatch_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  boost_id text UNIQUE,
  total integer NOT NULL DEFAULT 0,
  completed integer NOT NULL DEFAULT 0,
  errors integer NOT NULL DEFAULT 0,
  completion_rate numeric NOT NULL DEFAULT 0,
  error_rate numeric NOT NULL DEFAULT 0,
  first_started_at timestamptz,
  first_sent_at timestamptz,
  last_sent_at timestamptz,
  source text NOT NULL DEFAULT 'json_import',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.imported_dispatch_reports TO authenticated;
GRANT ALL ON public.imported_dispatch_reports TO service_role;
ALTER TABLE public.imported_dispatch_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage imported dispatch reports"
  ON public.imported_dispatch_reports FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER imported_dispatch_reports_updated_at
  BEFORE UPDATE ON public.imported_dispatch_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.imported_dispatch_report_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.imported_dispatch_reports(id) ON DELETE CASCADE,
  boost_item_id text,
  lead_id text,
  status text,
  name text,
  phone text,
  email text,
  created_at_source timestamptz,
  entered_at timestamptz,
  started_at timestamptz,
  status_changed_at timestamptz,
  whatsapp_instance_id text,
  is_pending boolean,
  last_sent_message_id text,
  last_sent_at timestamptz,
  last_sent_error_code text,
  last_received_message_id text,
  last_received_at timestamptz,
  last_received_error_code text,
  error_code text,
  error_message text,
  message_status text,
  raw_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.imported_dispatch_report_records TO authenticated;
GRANT ALL ON public.imported_dispatch_report_records TO service_role;
ALTER TABLE public.imported_dispatch_report_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage imported dispatch report records"
  ON public.imported_dispatch_report_records FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE UNIQUE INDEX idx_idrr_report_item ON public.imported_dispatch_report_records (report_id, boost_item_id) WHERE boost_item_id IS NOT NULL;
CREATE INDEX idx_idrr_report ON public.imported_dispatch_report_records (report_id);
CREATE INDEX idx_idrr_report_status ON public.imported_dispatch_report_records (report_id, status);
CREATE INDEX idx_idrr_phone ON public.imported_dispatch_report_records (phone);
CREATE INDEX idx_idrr_email ON public.imported_dispatch_report_records (email);
CREATE INDEX idx_idrr_lead ON public.imported_dispatch_report_records (lead_id);
CREATE INDEX idx_idrr_item ON public.imported_dispatch_report_records (boost_item_id);
CREATE INDEX idx_idrr_name_lower ON public.imported_dispatch_report_records (lower(name));
CREATE INDEX idx_idrr_started ON public.imported_dispatch_report_records (report_id, started_at DESC);