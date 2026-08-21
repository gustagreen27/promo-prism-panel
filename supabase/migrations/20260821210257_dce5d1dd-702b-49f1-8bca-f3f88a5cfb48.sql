SET lock_timeout = '120s';
ALTER TABLE public.wa_campaigns
  ADD COLUMN IF NOT EXISTS metrics_source text,
  ADD COLUMN IF NOT EXISTS external_total_count integer,
  ADD COLUMN IF NOT EXISTS external_sent_count integer,
  ADD COLUMN IF NOT EXISTS external_delivered_count integer,
  ADD COLUMN IF NOT EXISTS external_failed_count integer,
  ADD COLUMN IF NOT EXISTS external_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS external_finished_at timestamptz;