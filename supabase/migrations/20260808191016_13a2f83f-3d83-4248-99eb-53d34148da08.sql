ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS loading_image_url text,
  ADD COLUMN IF NOT EXISTS loading_bg_color text;