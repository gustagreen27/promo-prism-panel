DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='campaign_clicks') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_clicks';
  END IF;
END $$;
ALTER TABLE public.campaign_clicks REPLICA IDENTITY FULL;