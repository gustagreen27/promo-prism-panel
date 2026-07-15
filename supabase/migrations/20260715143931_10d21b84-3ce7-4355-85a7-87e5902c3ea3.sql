CREATE INDEX IF NOT EXISTS idx_campaign_clicks_campaign_clicked_at_desc
  ON public.campaign_clicks (campaign_id, clicked_at DESC)
  INCLUDE (id, country, region, city, device_type, os, browser, referer);

CREATE INDEX IF NOT EXISTS idx_wa_campaigns_linked_created_desc
  ON public.wa_campaigns (linked_campaign_id, created_at DESC)
  INCLUDE (id, name, status, scheduled_at, total_recipients, sent_count, delivered_count, read_count, replied_count, failed_count, progress);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_sent_at_desc_sample
  ON public.campaign_recipients (campaign_id, sent_at DESC NULLS LAST)
  INCLUDE (phone, status, delivered_at);