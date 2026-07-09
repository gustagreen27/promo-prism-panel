
ALTER TABLE public.whatsapp_connections
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_name text,
  ADD COLUMN IF NOT EXISTS code_verification_status text,
  ADD COLUMN IF NOT EXISTS meta_sync_status text NOT NULL DEFAULT 'connected';

ALTER TABLE public.whatsapp_wabas
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_error text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_connections_phone_number_id
  ON public.whatsapp_connections (phone_number_id)
  WHERE phone_number_id IS NOT NULL;
