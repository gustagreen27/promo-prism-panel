
-- 1. campaign_public_settings
CREATE TABLE public.campaign_public_settings (
  campaign_id uuid PRIMARY KEY REFERENCES public.campaigns(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  metrics_mode text NOT NULL DEFAULT 'real' CHECK (metrics_mode IN ('real','replace','merge')),
  custom_totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  clicks_series jsonb NOT NULL DEFAULT '[]'::jsonb,
  hourly_series jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_public_settings TO authenticated;
GRANT SELECT ON public.campaign_public_settings TO anon;
GRANT ALL ON public.campaign_public_settings TO service_role;
ALTER TABLE public.campaign_public_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_settings_anon_read" ON public.campaign_public_settings
  FOR SELECT TO anon USING (true);
CREATE POLICY "public_settings_member_read" ON public.campaign_public_settings
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_id
      AND (c.workspace_id IS NULL OR public.is_workspace_member(c.workspace_id, auth.uid()) OR public.is_internal_staff(auth.uid())))
  );
CREATE POLICY "public_settings_member_write" ON public.campaign_public_settings
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_id
      AND (c.workspace_id IS NULL OR public.is_workspace_member(c.workspace_id, auth.uid()) OR public.is_internal_staff(auth.uid())))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_id
      AND (c.workspace_id IS NULL OR public.is_workspace_member(c.workspace_id, auth.uid()) OR public.is_internal_staff(auth.uid())))
  );

-- 2. public_metrics_override
CREATE TABLE public.public_metrics_override (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('country','city','device','browser')),
  label text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_public_metrics_override_campaign_kind ON public.public_metrics_override(campaign_id, kind, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.public_metrics_override TO authenticated;
GRANT SELECT ON public.public_metrics_override TO anon;
GRANT ALL ON public.public_metrics_override TO service_role;
ALTER TABLE public.public_metrics_override ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_metrics_anon_read" ON public.public_metrics_override
  FOR SELECT TO anon USING (true);
CREATE POLICY "public_metrics_member_all" ON public.public_metrics_override
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_id
      AND (c.workspace_id IS NULL OR public.is_workspace_member(c.workspace_id, auth.uid()) OR public.is_internal_staff(auth.uid())))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_id
      AND (c.workspace_id IS NULL OR public.is_workspace_member(c.workspace_id, auth.uid()) OR public.is_internal_staff(auth.uid())))
  );

-- 3. campaign_public_dispatches
CREATE TABLE public.campaign_public_dispatches (
  wa_campaign_id uuid PRIMARY KEY REFERENCES public.wa_campaigns(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  mode text NOT NULL DEFAULT 'real' CHECK (mode IN ('real','fixed','auto')),
  public_name text,
  public_status text,
  fixed jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_public_dispatches_campaign ON public.campaign_public_dispatches(campaign_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_public_dispatches TO authenticated;
GRANT SELECT ON public.campaign_public_dispatches TO anon;
GRANT ALL ON public.campaign_public_dispatches TO service_role;
ALTER TABLE public.campaign_public_dispatches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_dispatches_anon_read" ON public.campaign_public_dispatches
  FOR SELECT TO anon USING (true);
CREATE POLICY "public_dispatches_member_all" ON public.campaign_public_dispatches
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.wa_campaigns w
      WHERE w.id = wa_campaign_id
      AND (w.workspace_id IS NULL OR public.is_workspace_member(w.workspace_id, auth.uid()) OR public.is_internal_staff(auth.uid())))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.wa_campaigns w
      WHERE w.id = wa_campaign_id
      AND (w.workspace_id IS NULL OR public.is_workspace_member(w.workspace_id, auth.uid()) OR public.is_internal_staff(auth.uid())))
  );

-- 4. public_progress_simulation
CREATE TABLE public.public_progress_simulation (
  wa_campaign_id uuid PRIMARY KEY REFERENCES public.wa_campaigns(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  start_at timestamptz,
  end_at timestamptz,
  duration_sec integer,
  refresh_interval_sec integer NOT NULL DEFAULT 5,
  sent_start integer NOT NULL DEFAULT 0,
  sent_end integer NOT NULL DEFAULT 0,
  delivered_ratio numeric,
  failed_ratio numeric,
  delivered_start integer,
  delivered_end integer,
  failed_start integer,
  failed_end integer,
  percent_start numeric,
  percent_end numeric,
  growth text NOT NULL DEFAULT 'linear' CHECK (growth IN ('linear','random','batches','stepped','real_plus','manual')),
  growth_params jsonb NOT NULL DEFAULT '{}'::jsonb,
  pauses jsonb NOT NULL DEFAULT '[]'::jsonb,
  runtime jsonb NOT NULL DEFAULT '{"active":false}'::jsonb,
  status_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_public_simulation_campaign ON public.public_progress_simulation(campaign_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.public_progress_simulation TO authenticated;
GRANT SELECT ON public.public_progress_simulation TO anon;
GRANT ALL ON public.public_progress_simulation TO service_role;
ALTER TABLE public.public_progress_simulation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_simulation_anon_read" ON public.public_progress_simulation
  FOR SELECT TO anon USING (true);
CREATE POLICY "public_simulation_member_all" ON public.public_progress_simulation
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.wa_campaigns w
      WHERE w.id = wa_campaign_id
      AND (w.workspace_id IS NULL OR public.is_workspace_member(w.workspace_id, auth.uid()) OR public.is_internal_staff(auth.uid())))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.wa_campaigns w
      WHERE w.id = wa_campaign_id
      AND (w.workspace_id IS NULL OR public.is_workspace_member(w.workspace_id, auth.uid()) OR public.is_internal_staff(auth.uid())))
  );

-- Triggers de updated_at
CREATE TRIGGER trg_cps_updated_at BEFORE UPDATE ON public.campaign_public_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_pmo_updated_at BEFORE UPDATE ON public.public_metrics_override
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_cpd_updated_at BEFORE UPDATE ON public.campaign_public_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_pps_updated_at BEFORE UPDATE ON public.public_progress_simulation
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
