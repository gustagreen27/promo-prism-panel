ALTER TABLE public.wa_campaigns
  ADD COLUMN IF NOT EXISTS adaptive_rate_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS adaptive_rate_current integer,
  ADD COLUMN IF NOT EXISTS adaptive_last_step_at timestamptz;