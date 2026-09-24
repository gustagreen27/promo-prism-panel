ALTER TABLE public.wa_campaigns
  ADD COLUMN IF NOT EXISTS send_mode text NOT NULL DEFAULT 'template',
  ADD COLUMN IF NOT EXISTS direct_text text;
ALTER TABLE public.wa_campaigns DROP CONSTRAINT IF EXISTS wa_campaigns_send_mode_chk;
ALTER TABLE public.wa_campaigns ADD CONSTRAINT wa_campaigns_send_mode_chk CHECK (send_mode IN ('template','direct_utility'));
ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS request_payload jsonb;