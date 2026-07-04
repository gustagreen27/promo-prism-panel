ALTER TABLE public.wa_campaigns REPLICA IDENTITY FULL;
ALTER TABLE public.campaign_recipients REPLICA IDENTITY FULL;
ALTER TABLE public.campaign_timeline REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_campaigns;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_recipients;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_timeline;