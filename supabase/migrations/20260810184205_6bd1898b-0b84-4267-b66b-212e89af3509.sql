CREATE INDEX IF NOT EXISTS idx_campaign_clicks_campaign_ip ON public.campaign_clicks (campaign_id, ip);

CREATE OR REPLACE FUNCTION public.campaigns_click_counts()
RETURNS TABLE (campaign_id uuid, total bigint, uniques bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.campaign_id, count(*)::bigint, count(DISTINCT c.ip)::bigint
  FROM public.campaign_clicks c
  GROUP BY c.campaign_id
$$;

REVOKE ALL ON FUNCTION public.campaigns_click_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.campaigns_click_counts() TO service_role;