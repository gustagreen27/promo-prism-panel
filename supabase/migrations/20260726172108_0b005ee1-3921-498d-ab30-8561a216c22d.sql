CREATE OR REPLACE FUNCTION public.wa_daily_sends(_campaign_id uuid)
RETURNS TABLE(day date, count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT (r.sent_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
         COUNT(*)::bigint AS count
  FROM public.campaign_recipients r
  JOIN public.wa_campaigns w ON w.id = r.campaign_id
  WHERE w.linked_campaign_id = _campaign_id
    AND r.sent_at IS NOT NULL
  GROUP BY 1
  ORDER BY 1
$function$;