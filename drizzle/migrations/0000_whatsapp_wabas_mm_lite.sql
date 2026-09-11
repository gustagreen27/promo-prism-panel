ALTER TABLE public.whatsapp_wabas
  ADD COLUMN IF NOT EXISTS mm_lite_status text,
  ADD COLUMN IF NOT EXISTS mm_lite_tos_status text,
  ADD COLUMN IF NOT EXISTS mm_lite_ad_account_id text,
  ADD COLUMN IF NOT EXISTS mm_lite_reason text,
  ADD COLUMN IF NOT EXISTS mm_lite_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS mm_lite_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mm_lite_activity_sharing boolean NOT NULL DEFAULT true;