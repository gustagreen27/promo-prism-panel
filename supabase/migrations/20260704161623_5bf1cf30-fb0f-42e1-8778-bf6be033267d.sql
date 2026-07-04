ALTER TABLE public.wa_campaigns
  ADD COLUMN IF NOT EXISTS batch_size integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS jitter_ms integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_per_hour integer,
  ADD COLUMN IF NOT EXISTS max_per_day integer,
  ADD COLUMN IF NOT EXISTS quiet_hours_start text,
  ADD COLUMN IF NOT EXISTS quiet_hours_end text,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  ADD COLUMN IF NOT EXISTS abort_on_failure_rate numeric,
  ADD COLUMN IF NOT EXISTS min_processed_for_abort integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS pause_reason text;