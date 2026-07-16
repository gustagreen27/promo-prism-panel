
ALTER TABLE public.campaign_clicks
  ADD COLUMN IF NOT EXISTS continent text,
  ADD COLUMN IF NOT EXISTS continent_code text,
  ADD COLUMN IF NOT EXISTS country_code3 text,
  ADD COLUMN IF NOT EXISTS region_code text,
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS utc_offset integer,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS calling_code text,
  ADD COLUMN IF NOT EXISTS as_number text,
  ADD COLUMN IF NOT EXISTS reverse_dns text,
  ADD COLUMN IF NOT EXISTS mobile boolean,
  ADD COLUMN IF NOT EXISTS proxy boolean,
  ADD COLUMN IF NOT EXISTS hosting boolean;
