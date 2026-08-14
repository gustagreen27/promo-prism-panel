ALTER TABLE public.whatsapp_wabas
  ADD COLUMN IF NOT EXISTS account_review_status text,
  ADD COLUMN IF NOT EXISTS business_verification_status text,
  ADD COLUMN IF NOT EXISTS meta_status text,
  ADD COLUMN IF NOT EXISTS ban_state text,
  ADD COLUMN IF NOT EXISTS restriction_level text,
  ADD COLUMN IF NOT EXISTS restriction_reason text,
  ADD COLUMN IF NOT EXISTS restrictions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS restriction_checked_at timestamptz;