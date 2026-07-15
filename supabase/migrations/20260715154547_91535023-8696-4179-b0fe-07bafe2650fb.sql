
ALTER TABLE public.campaign_public_settings
  ADD COLUMN IF NOT EXISTS clicks_generator jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.public_metrics_override
  ADD COLUMN IF NOT EXISTS percent numeric;
