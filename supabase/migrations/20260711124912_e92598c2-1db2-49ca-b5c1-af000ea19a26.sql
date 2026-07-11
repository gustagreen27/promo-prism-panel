
-- 1) Enum de status de rota
DO $$ BEGIN
  CREATE TYPE public.wa_route_status AS ENUM (
    'active','paused','template_unavailable','number_unavailable','rate_limited','disabled','completed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Colunas novas em wa_campaigns (flag e configuração de multi-rota)
ALTER TABLE public.wa_campaigns
  ADD COLUMN IF NOT EXISTS use_multi_route boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS distribution_strategy text NOT NULL DEFAULT 'weighted'
    CHECK (distribution_strategy IN ('weighted','round_robin','primary_reserve','template_primary_reserve','custom')),
  ADD COLUMN IF NOT EXISTS template_failover_mode text NOT NULL DEFAULT 'manual'
    CHECK (template_failover_mode IN ('manual','auto')),
  ADD COLUMN IF NOT EXISTS number_failover_mode text NOT NULL DEFAULT 'manual'
    CHECK (number_failover_mode IN ('manual','auto'));

-- 3) Tabela de rotas
CREATE TABLE IF NOT EXISTS public.wa_campaign_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.wa_campaigns(id) ON DELETE CASCADE,
  workspace_id uuid,
  connection_id uuid NOT NULL,
  phone_number_id text NOT NULL,
  waba_ref_id uuid,
  template_id uuid NOT NULL,
  template_name text NOT NULL,
  template_language text NOT NULL,
  template_category text,
  priority integer NOT NULL DEFAULT 100,
  weight integer NOT NULL DEFAULT 100,
  status public.wa_route_status NOT NULL DEFAULT 'active',
  is_primary boolean NOT NULL DEFAULT true,
  rate_requested integer,
  rate_effective integer,
  max_concurrency integer,
  variables_mapping jsonb,
  button_url_mapping jsonb,
  accepted_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  last_error_code text,
  last_error_message text,
  last_error_at timestamptz,
  disabled_reason text,
  swrr_current_weight integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_campaign_routes TO authenticated;
GRANT ALL ON public.wa_campaign_routes TO service_role;

ALTER TABLE public.wa_campaign_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage routes"
  ON public.wa_campaign_routes FOR ALL
  USING (public.is_internal_staff(auth.uid()))
  WITH CHECK (public.is_internal_staff(auth.uid()));

CREATE POLICY "Workspace members read routes"
  ON public.wa_campaign_routes FOR SELECT
  USING (workspace_id IS NULL OR public.is_workspace_member(workspace_id, auth.uid()));

CREATE INDEX IF NOT EXISTS idx_wa_routes_campaign ON public.wa_campaign_routes(campaign_id);
CREATE INDEX IF NOT EXISTS idx_wa_routes_campaign_status ON public.wa_campaign_routes(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_wa_routes_phone ON public.wa_campaign_routes(phone_number_id);

CREATE TRIGGER wa_routes_set_updated_at
  BEFORE UPDATE ON public.wa_campaign_routes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) Tabela de tentativas (histórico imutável)
CREATE TABLE IF NOT EXISTS public.wa_campaign_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.wa_campaigns(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.campaign_recipients(id) ON DELETE CASCADE,
  route_id uuid REFERENCES public.wa_campaign_routes(id) ON DELETE SET NULL,
  phone_number_id text,
  template_id uuid,
  template_name text,
  attempt_number integer NOT NULL DEFAULT 1,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  http_status integer,
  meta_message_id text,
  message_status text,
  error_code text,
  error_details jsonb,
  fbtrace_id text,
  worker_id uuid,
  workspace_id uuid
);

GRANT SELECT, INSERT ON public.wa_campaign_attempts TO authenticated;
GRANT ALL ON public.wa_campaign_attempts TO service_role;

ALTER TABLE public.wa_campaign_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read attempts"
  ON public.wa_campaign_attempts FOR SELECT
  USING (public.is_internal_staff(auth.uid()));

CREATE POLICY "Workspace members read attempts"
  ON public.wa_campaign_attempts FOR SELECT
  USING (workspace_id IS NULL OR public.is_workspace_member(workspace_id, auth.uid()));

CREATE INDEX IF NOT EXISTS idx_attempts_campaign ON public.wa_campaign_attempts(campaign_id, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_recipient ON public.wa_campaign_attempts(recipient_id, attempted_at);
CREATE INDEX IF NOT EXISTS idx_attempts_route ON public.wa_campaign_attempts(route_id);

-- 5) campaign_recipients: coluna de rota escolhida e afinidade
ALTER TABLE public.campaign_recipients
  ADD COLUMN IF NOT EXISTS route_id uuid REFERENCES public.wa_campaign_routes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS locked_route_id uuid REFERENCES public.wa_campaign_routes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recipients_route ON public.campaign_recipients(route_id);

-- 6) Função helper: contar rotas ativas por campanha
CREATE OR REPLACE FUNCTION public.wa_campaign_active_routes(_campaign_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COUNT(*)::int FROM public.wa_campaign_routes
   WHERE campaign_id = _campaign_id AND status = 'active';
$$;

-- 7) Evento no timeline quando rota muda de status
CREATE OR REPLACE FUNCTION public.trg_wa_route_status_timeline()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.campaign_timeline (campaign_id, event_type, message, payload)
    VALUES (NEW.campaign_id, 'route_created',
      'Rota criada: ' || COALESCE(NEW.template_name,'?') || ' via ' || NEW.phone_number_id,
      jsonb_build_object('route_id', NEW.id, 'status', NEW.status,
        'template_id', NEW.template_id, 'phone_number_id', NEW.phone_number_id));
    RETURN NEW;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.campaign_timeline (campaign_id, event_type, message, payload)
    VALUES (NEW.campaign_id, 'route_status_change',
      'Rota ' || COALESCE(NEW.template_name,'?') || ': ' || OLD.status::text || ' → ' || NEW.status::text,
      jsonb_build_object('route_id', NEW.id, 'from', OLD.status, 'to', NEW.status,
        'error_code', NEW.last_error_code, 'reason', NEW.disabled_reason));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_wa_route_status_timeline ON public.wa_campaign_routes;
CREATE TRIGGER trg_wa_route_status_timeline
  AFTER INSERT OR UPDATE ON public.wa_campaign_routes
  FOR EACH ROW EXECUTE FUNCTION public.trg_wa_route_status_timeline();
