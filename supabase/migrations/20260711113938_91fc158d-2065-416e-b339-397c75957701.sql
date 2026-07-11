
ALTER TABLE public.wa_campaigns
  ADD COLUMN IF NOT EXISTS target_per_hour integer,
  ADD COLUMN IF NOT EXISTS rate_per_second integer,
  ADD COLUMN IF NOT EXISTS max_concurrency integer,
  ADD COLUMN IF NOT EXISTS scheduled_pause_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pause_every_messages integer,
  ADD COLUMN IF NOT EXISTS pause_duration_seconds integer,
  ADD COLUMN IF NOT EXISTS scheduled_pause_until timestamptz;

ALTER TABLE public.wa_campaigns
  DROP CONSTRAINT IF EXISTS wa_campaigns_rate_positive;
ALTER TABLE public.wa_campaigns
  ADD CONSTRAINT wa_campaigns_rate_positive
    CHECK (rate_per_second IS NULL OR rate_per_second > 0);

ALTER TABLE public.wa_campaigns
  DROP CONSTRAINT IF EXISTS wa_campaigns_conc_positive;
ALTER TABLE public.wa_campaigns
  ADD CONSTRAINT wa_campaigns_conc_positive
    CHECK (max_concurrency IS NULL OR max_concurrency >= 1);
