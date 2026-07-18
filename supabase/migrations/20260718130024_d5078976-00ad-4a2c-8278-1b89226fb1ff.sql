ALTER TABLE public.campaign_clicks
  ADD COLUMN IF NOT EXISTS wa_campaign_id uuid REFERENCES public.wa_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recipient_id uuid REFERENCES public.campaign_recipients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_clicks_wa_campaign_id
  ON public.campaign_clicks (wa_campaign_id);

CREATE INDEX IF NOT EXISTS idx_campaign_clicks_recipient_id
  ON public.campaign_clicks (recipient_id);

CREATE INDEX IF NOT EXISTS idx_campaign_clicks_campaign_wa_recipient
  ON public.campaign_clicks (campaign_id, wa_campaign_id, recipient_id);