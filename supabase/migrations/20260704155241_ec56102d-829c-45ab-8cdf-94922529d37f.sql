
ALTER TABLE public.wa_campaigns
  ADD COLUMN IF NOT EXISTS variables_mapping jsonb,
  ADD COLUMN IF NOT EXISTS button_url_mapping jsonb,
  ADD COLUMN IF NOT EXISTS custom_fields jsonb,
  ADD COLUMN IF NOT EXISTS responsavel_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
