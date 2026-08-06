ALTER TABLE public.wa_campaigns
  ADD COLUMN IF NOT EXISTS fatal_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fatal_error_code text,
  ADD COLUMN IF NOT EXISTS fatal_error_message text,
  ADD COLUMN IF NOT EXISTS fatal_locked_at timestamptz;

ALTER TABLE public.whatsapp_connections
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS blocked_reason text,
  ADD COLUMN IF NOT EXISTS blocked_error_code text;