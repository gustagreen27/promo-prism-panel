
-- Wave A: foundation tables for SaaS admin panel

-- CLIENTS
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  document text,
  email text,
  phone text,
  address text,
  city text,
  state text,
  status text NOT NULL DEFAULT 'ativo',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage clients" ON public.clients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- PROJECTS
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'planejado',
  start_date date,
  end_date date,
  contract_value numeric(14,2) DEFAULT 0,
  estimated_cost numeric(14,2) DEFAULT 0,
  responsible text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage projects" ON public.projects FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- REVENUES
CREATE TABLE public.revenues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  description text,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  issue_date date,
  due_date date,
  paid_date date,
  payment_method text,
  status text NOT NULL DEFAULT 'pendente',
  attachment_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.revenues TO authenticated;
GRANT ALL ON public.revenues TO service_role;
ALTER TABLE public.revenues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage revenues" ON public.revenues FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_revenues_updated BEFORE UPDATE ON public.revenues FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- COSTS
CREATE TABLE public.costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  category text,
  supplier text,
  description text,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  due_date date,
  paid_date date,
  status text NOT NULL DEFAULT 'pendente',
  is_recurring boolean NOT NULL DEFAULT false,
  recurrence_type text,
  attachment_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.costs TO authenticated;
GRANT ALL ON public.costs TO service_role;
ALTER TABLE public.costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage costs" ON public.costs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_costs_updated BEFORE UPDATE ON public.costs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- CALENDAR EVENTS
CREATE TABLE public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  event_type text,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  status text NOT NULL DEFAULT 'pendente',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_events TO authenticated;
GRANT ALL ON public.calendar_events TO service_role;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage events" ON public.calendar_events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_events_updated BEFORE UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- MESSAGE STOCK
CREATE TABLE public.message_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  amount numeric(14,2) DEFAULT 0,
  supplier text,
  source text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_stock TO authenticated;
GRANT ALL ON public.message_stock TO service_role;
ALTER TABLE public.message_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage stock" ON public.message_stock FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- WHATSAPP CONNECTIONS
CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  provider text,
  api_key text,
  status text NOT NULL DEFAULT 'inativo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_connections TO authenticated;
GRANT ALL ON public.whatsapp_connections TO service_role;
ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage wa conn" ON public.whatsapp_connections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_waconn_updated BEFORE UPDATE ON public.whatsapp_connections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- WHATSAPP MESSAGES
CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  phone text,
  template_name text,
  status text NOT NULL DEFAULT 'pendente',
  cost numeric(10,4) DEFAULT 0,
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_messages TO authenticated;
GRANT ALL ON public.whatsapp_messages TO service_role;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage wa msg" ON public.whatsapp_messages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- CLOSINGS
CREATE TABLE public.closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month integer NOT NULL,
  year integer NOT NULL,
  total_revenue numeric(14,2) DEFAULT 0,
  total_cost numeric(14,2) DEFAULT 0,
  net_profit numeric(14,2) DEFAULT 0,
  margin numeric(6,2) DEFAULT 0,
  total_messages integer DEFAULT 0,
  delivered_messages integer DEFAULT 0,
  failed_messages integer DEFAULT 0,
  cost_per_message numeric(10,4) DEFAULT 0,
  status text NOT NULL DEFAULT 'aberto',
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(month, year)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.closings TO authenticated;
GRANT ALL ON public.closings TO service_role;
ALTER TABLE public.closings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage closings" ON public.closings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- UPSELL CAMPAIGNS (separate from existing campaigns table; can reference one)
CREATE TABLE public.upsell_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  name text NOT NULL,
  url text,
  status text NOT NULL DEFAULT 'rascunho',
  revenue numeric(14,2) DEFAULT 0,
  clicks integer DEFAULT 0,
  conversions integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.upsell_campaigns TO authenticated;
GRANT ALL ON public.upsell_campaigns TO service_role;
ALTER TABLE public.upsell_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage upsell" ON public.upsell_campaigns FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_upsell_updated BEFORE UPDATE ON public.upsell_campaigns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ACTIVITY LOGS
CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  module text,
  action text,
  description text,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read logs" ON public.activity_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins insert logs" ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- SETTINGS (key/value)
CREATE TABLE public.settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage settings" ON public.settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
