CREATE OR REPLACE FUNCTION public.wa_hourly_sends(_campaign_id uuid)
RETURNS TABLE(hour int, count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXTRACT(HOUR FROM (r.sent_at AT TIME ZONE 'America/Sao_Paulo'))::int AS hour,
         COUNT(*)::bigint AS count
  FROM public.campaign_recipients r
  JOIN public.wa_campaigns w ON w.id = r.campaign_id
  WHERE w.linked_campaign_id = _campaign_id
    AND r.sent_at IS NOT NULL
  GROUP BY 1
  ORDER BY 1
$$;

GRANT EXECUTE ON FUNCTION public.wa_hourly_sends(uuid) TO anon, authenticated, service_role;