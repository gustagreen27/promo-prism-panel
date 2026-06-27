DROP POLICY IF EXISTS "public insert events" ON public.campaign_events;
CREATE POLICY "public insert events" ON public.campaign_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_events.campaign_id
        AND c.status = 'active'
    )
  );