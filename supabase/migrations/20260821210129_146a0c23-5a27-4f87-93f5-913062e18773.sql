SET lock_timeout = '120s';
ALTER TABLE public.wa_campaigns
  ADD COLUMN IF NOT EXISTS execution_type text DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS external_status text,
  ADD COLUMN IF NOT EXISTS external_note text;