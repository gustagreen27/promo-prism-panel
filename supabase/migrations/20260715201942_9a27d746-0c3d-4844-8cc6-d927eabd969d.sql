
ALTER TABLE public.whatsapp_connections
  ADD COLUMN IF NOT EXISTS global_rate_per_second integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS maximum_rate_per_second integer NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS adaptive_rate_enabled boolean NOT NULL DEFAULT true;
