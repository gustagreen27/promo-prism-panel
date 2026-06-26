
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS campaign_type text,
  ADD COLUMN IF NOT EXISTS link_intent text,
  ADD COLUMN IF NOT EXISTS page_category text,
  ADD COLUMN IF NOT EXISTS intermediate_text text,
  ADD COLUMN IF NOT EXISTS cta_label text;
