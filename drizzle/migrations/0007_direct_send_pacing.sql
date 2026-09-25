ALTER TABLE public.wa_campaigns
  ADD COLUMN IF NOT EXISTS pacing_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pacing_config jsonb,
  ADD COLUMN IF NOT EXISTS pacing_state jsonb,
  ADD COLUMN IF NOT EXISTS pacing_next_at timestamptz;