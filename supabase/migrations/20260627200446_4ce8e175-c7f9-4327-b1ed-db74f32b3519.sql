
-- =========================================================
-- Extensões nos números do WhatsApp
-- =========================================================
ALTER TABLE public.whatsapp_connections
  ADD COLUMN IF NOT EXISTS display_phone text,
  ADD COLUMN IF NOT EXISTS phone_number_id text,
  ADD COLUMN IF NOT EXISTS waba_id text,
  ADD COLUMN IF NOT EXISTS business_id text,
  ADD COLUMN IF NOT EXISTS access_token text,
  ADD COLUMN IF NOT EXISTS verify_token text,
  ADD COLUMN IF NOT EXISTS webhook_url text,
  ADD COLUMN IF NOT EXISTS quality_rating text,
  ADD COLUMN IF NOT EXISTS daily_limit integer DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS graph_api_version text DEFAULT 'v21.0';

-- =========================================================
-- Estoque de mensagens — pacotes por cliente/projeto
-- =========================================================
ALTER TABLE public.message_stock
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quantity_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_cost numeric(10,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_price numeric(10,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS purchased_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_msgstock_updated') THEN
    CREATE TRIGGER trg_msgstock_updated BEFORE UPDATE ON public.message_stock
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- =========================================================
-- Enum de status de destinatário
-- =========================================================
DO $$ BEGIN
  CREATE TYPE public.wa_recipient_status AS ENUM
    ('pending','processing','sent','delivered','read','replied','failed','cancelled','opt_out');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.wa_campaign_status AS ENUM
    ('draft','scheduled','running','paused','completed','cancelled','error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.wa_template_status AS ENUM
    ('approved','pending','rejected','paused','disabled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================
-- Templates do WhatsApp
-- =========================================================
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  meta_template_id text,
  name text NOT NULL,
  language text NOT NULL DEFAULT 'pt_BR',
  category text,
  status public.wa_template_status NOT NULL DEFAULT 'pending',
  header_type text,
  header_text text,
  body text NOT NULL DEFAULT '',
  footer text,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  buttons jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS wa_templates_unique ON public.whatsapp_templates(connection_id, name, language);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_templates TO authenticated;
GRANT ALL ON public.whatsapp_templates TO service_role;
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage wa templates" ON public.whatsapp_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_watpl_updated BEFORE UPDATE ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- Contatos e tags
-- =========================================================
CREATE TABLE IF NOT EXISTS public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  phone text NOT NULL,
  email text,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  source text,
  opt_in boolean NOT NULL DEFAULT false,
  opt_in_at timestamptz,
  opt_out boolean NOT NULL DEFAULT false,
  opt_out_at timestamptz,
  last_interaction_at timestamptz,
  invalid boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS contacts_phone_client_idx ON public.contacts(phone, COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage contacts" ON public.contacts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_contacts_updated BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.contact_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text DEFAULT '#3b82f6',
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_tags TO authenticated;
GRANT ALL ON public.contact_tags TO service_role;
ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage tags" ON public.contact_tags FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.contact_tag_assignments (
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.contact_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, tag_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_tag_assignments TO authenticated;
GRANT ALL ON public.contact_tag_assignments TO service_role;
ALTER TABLE public.contact_tag_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage tag assignments" ON public.contact_tag_assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.contact_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_lists TO authenticated;
GRANT ALL ON public.contact_lists TO service_role;
ALTER TABLE public.contact_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage lists" ON public.contact_lists FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_lists_updated BEFORE UPDATE ON public.contact_lists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.contact_list_items (
  list_id uuid NOT NULL REFERENCES public.contact_lists(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, contact_id)
);
CREATE INDEX IF NOT EXISTS cli_contact_idx ON public.contact_list_items(contact_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_list_items TO authenticated;
GRANT ALL ON public.contact_list_items TO service_role;
ALTER TABLE public.contact_list_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage list items" ON public.contact_list_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =========================================================
-- Opt-outs
-- =========================================================
CREATE TABLE IF NOT EXISTS public.opt_outs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  reason text,
  opted_out_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS opt_outs_phone_client_idx ON public.opt_outs(phone, COALESCE(client_id,'00000000-0000-0000-0000-000000000000'::uuid));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opt_outs TO authenticated;
GRANT ALL ON public.opt_outs TO service_role;
ALTER TABLE public.opt_outs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage optouts" ON public.opt_outs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =========================================================
-- Importações de contatos
-- =========================================================
CREATE TABLE IF NOT EXISTS public.import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text,
  total integer NOT NULL DEFAULT 0,
  valid integer NOT NULL DEFAULT 0,
  invalid integer NOT NULL DEFAULT 0,
  duplicated integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'done',
  report jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_jobs TO authenticated;
GRANT ALL ON public.import_jobs TO service_role;
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage imports" ON public.import_jobs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =========================================================
-- Campanhas WhatsApp
-- =========================================================
CREATE TABLE IF NOT EXISTS public.wa_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL,
  template_id uuid REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
  template_variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  list_id uuid REFERENCES public.contact_lists(id) ON DELETE SET NULL,
  tag_filters uuid[] DEFAULT '{}',
  status public.wa_campaign_status NOT NULL DEFAULT 'draft',
  scheduled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  send_rate_per_min integer NOT NULL DEFAULT 30,
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  read_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  replied_count integer NOT NULL DEFAULT 0,
  estimated_cost numeric(12,4) NOT NULL DEFAULT 0,
  linked_revenue_id uuid REFERENCES public.revenues(id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wa_camp_status_idx ON public.wa_campaigns(status, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_campaigns TO authenticated;
GRANT ALL ON public.wa_campaigns TO service_role;
ALTER TABLE public.wa_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage wa campaigns" ON public.wa_campaigns FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_wacamp_updated BEFORE UPDATE ON public.wa_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.wa_campaigns(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  phone text NOT NULL,
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.wa_recipient_status NOT NULL DEFAULT 'pending',
  meta_message_id text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  replied_at timestamptz,
  failed_at timestamptz,
  failed_reason text,
  error_code text,
  attempt integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rec_campaign_status_idx ON public.campaign_recipients(campaign_id, status);
CREATE INDEX IF NOT EXISTS rec_meta_id_idx ON public.campaign_recipients(meta_message_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_recipients TO authenticated;
GRANT ALL ON public.campaign_recipients TO service_role;
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage recipients" ON public.campaign_recipients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_recipients_updated BEFORE UPDATE ON public.campaign_recipients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- Inbox e webhook logs
-- =========================================================
CREATE TABLE IF NOT EXISTS public.whatsapp_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  phone text NOT NULL,
  direction text NOT NULL DEFAULT 'in',
  message_type text DEFAULT 'text',
  body text,
  meta_message_id text,
  status text,
  raw jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inbox_phone_idx ON public.whatsapp_inbox(phone, received_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_inbox TO authenticated;
GRANT ALL ON public.whatsapp_inbox TO service_role;
ALTER TABLE public.whatsapp_inbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage inbox" ON public.whatsapp_inbox FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL,
  event_type text,
  payload jsonb NOT NULL,
  processed boolean NOT NULL DEFAULT false,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wlogs_created_idx ON public.whatsapp_webhook_logs(created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_webhook_logs TO authenticated;
GRANT ALL ON public.whatsapp_webhook_logs TO service_role;
ALTER TABLE public.whatsapp_webhook_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read webhook logs" ON public.whatsapp_webhook_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =========================================================
-- Helper: consumir estoque atômico por projeto/cliente
-- =========================================================
CREATE OR REPLACE FUNCTION public.wa_consume_stock(_client_id uuid, _project_id uuid, _qty integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining integer := _qty;
  pkg record;
BEGIN
  IF _qty <= 0 THEN RETURN true; END IF;
  FOR pkg IN
    SELECT id, quantity, quantity_used
    FROM public.message_stock
    WHERE type = 'entrada'
      AND status = 'ativo'
      AND (client_id = _client_id OR _client_id IS NULL)
      AND (project_id = _project_id OR _project_id IS NULL)
      AND (quantity - quantity_used) > 0
    ORDER BY purchased_at ASC NULLS LAST, created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN remaining <= 0;
    DECLARE avail integer := pkg.quantity - pkg.quantity_used;
    BEGIN
      IF avail >= remaining THEN
        UPDATE public.message_stock SET quantity_used = quantity_used + remaining WHERE id = pkg.id;
        remaining := 0;
      ELSE
        UPDATE public.message_stock SET quantity_used = quantity, status = 'esgotado' WHERE id = pkg.id;
        remaining := remaining - avail;
      END IF;
    END;
  END LOOP;
  RETURN remaining <= 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.wa_available_stock(_client_id uuid, _project_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(SUM(GREATEST(quantity - quantity_used, 0)), 0)::int
  FROM public.message_stock
  WHERE type='entrada' AND status='ativo'
    AND (client_id = _client_id OR _client_id IS NULL)
    AND (project_id = _project_id OR _project_id IS NULL);
$$;
