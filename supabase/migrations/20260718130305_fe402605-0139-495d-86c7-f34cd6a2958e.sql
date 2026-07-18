CREATE OR REPLACE FUNCTION public.wa_count_dispatch_clicks(
  _campaign_ids uuid[],
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL
)
RETURNS TABLE(wa_campaign_id uuid, clicks bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    cc.wa_campaign_id,
    COUNT(DISTINCT COALESCE(cc.recipient_id::text, 'ip:' || NULLIF(cc.ip, ''), 'click:' || cc.id::text))::bigint AS clicks
  FROM public.campaign_clicks cc
  WHERE cc.wa_campaign_id = ANY(_campaign_ids)
    AND (_from IS NULL OR cc.clicked_at >= _from)
    AND (_to IS NULL OR cc.clicked_at <= _to)
  GROUP BY cc.wa_campaign_id;
$$;

REVOKE ALL ON FUNCTION public.wa_count_dispatch_clicks(uuid[], timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wa_count_dispatch_clicks(uuid[], timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wa_count_dispatch_clicks(uuid[], timestamptz, timestamptz) TO service_role;