ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS open_mode text NOT NULL DEFAULT 'smart',
  ADD COLUMN IF NOT EXISTS iframe_compatible boolean,
  ADD COLUMN IF NOT EXISTS iframe_checked_at timestamptz;

ALTER TABLE public.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_open_mode_check;
ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_open_mode_check
  CHECK (open_mode IN ('smart','iframe','redirect','wrapper'));