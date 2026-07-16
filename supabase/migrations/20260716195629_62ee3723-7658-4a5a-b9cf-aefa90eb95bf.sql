DROP POLICY IF EXISTS "public_dispatches_anon_read" ON public.campaign_public_dispatches;
CREATE POLICY "public_dispatches_anon_read"
ON public.campaign_public_dispatches
FOR SELECT
TO anon
USING (
  enabled IS TRUE
  AND EXISTS (
    SELECT 1
    FROM public.campaign_public_settings s
    WHERE s.campaign_id = campaign_public_dispatches.campaign_id
      AND s.enabled IS TRUE
  )
);

DROP POLICY IF EXISTS "public_settings_anon_read" ON public.campaign_public_settings;
CREATE POLICY "public_settings_anon_read"
ON public.campaign_public_settings
FOR SELECT
TO anon
USING (enabled IS TRUE);

DROP POLICY IF EXISTS "public read campaigns" ON public.campaigns;

DROP POLICY IF EXISTS "public_metrics_anon_read" ON public.public_metrics_override;
CREATE POLICY "public_metrics_anon_read"
ON public.public_metrics_override
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.campaign_public_settings s
    WHERE s.campaign_id = public_metrics_override.campaign_id
      AND s.enabled IS TRUE
  )
);

DROP POLICY IF EXISTS "public_simulation_anon_read" ON public.public_progress_simulation;
CREATE POLICY "public_simulation_anon_read"
ON public.public_progress_simulation
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.campaign_public_settings s
    WHERE s.campaign_id = public_progress_simulation.campaign_id
      AND s.enabled IS TRUE
  )
);

CREATE INDEX IF NOT EXISTS idx_campaign_public_settings_enabled_campaign
ON public.campaign_public_settings (campaign_id)
WHERE enabled IS TRUE;

CREATE INDEX IF NOT EXISTS idx_campaign_public_dispatches_enabled_campaign
ON public.campaign_public_dispatches (campaign_id)
WHERE enabled IS TRUE;