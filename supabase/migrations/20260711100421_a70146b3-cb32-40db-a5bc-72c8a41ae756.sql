CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_created ON public.campaign_recipients (campaign_id, created_at);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_sent_at ON public.campaign_recipients (campaign_id, sent_at) WHERE sent_at IS NOT NULL;
ANALYZE public.campaign_recipients;