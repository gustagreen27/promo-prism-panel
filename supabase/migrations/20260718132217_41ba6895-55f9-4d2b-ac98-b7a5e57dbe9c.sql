CREATE OR REPLACE FUNCTION public.wa_count_dispatch_clicks(
  _campaign_ids uuid[],
  _from timestamp with time zone DEFAULT NULL::timestamp with time zone,
  _to timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS TABLE(wa_campaign_id uuid, clicks bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH requested AS (
    SELECT
      wc.id,
      wc.linked_campaign_id,
      COALESCE(wc.started_at, wc.created_at) AS started_at,
      COALESCE(wc.finished_at, wc.started_at, wc.created_at) AS finished_at,
      LEAD(COALESCE(wc.started_at, wc.created_at)) OVER (
        PARTITION BY wc.linked_campaign_id
        ORDER BY COALESCE(wc.started_at, wc.created_at), wc.created_at, wc.id
      ) AS next_started_at,
      wc.workspace_id
    FROM public.wa_campaigns wc
    WHERE wc.id = ANY(_campaign_ids)
  ), allowed AS (
    SELECT r.*
    FROM requested r
    WHERE auth.role() = 'service_role'
       OR public.is_internal_staff(auth.uid())
       OR public.is_workspace_member(r.workspace_id, auth.uid())
  ), direct_clicks AS (
    SELECT
      cc.wa_campaign_id,
      COALESCE(cc.recipient_id::text, 'ip:' || NULLIF(cc.ip, ''), 'click:' || cc.id::text) AS person_key
    FROM public.campaign_clicks cc
    JOIN allowed a ON a.id = cc.wa_campaign_id
    WHERE (_from IS NULL OR cc.clicked_at >= _from)
      AND (_to IS NULL OR cc.clicked_at <= _to)
  ), legacy_clicks AS (
    SELECT
      a.id AS wa_campaign_id,
      COALESCE(cc.recipient_id::text, 'ip:' || NULLIF(cc.ip, ''), 'click:' || cc.id::text) AS person_key
    FROM allowed a
    JOIN public.campaign_clicks cc
      ON cc.wa_campaign_id IS NULL
     AND cc.campaign_id = a.linked_campaign_id
     AND cc.clicked_at >= a.started_at
     AND cc.clicked_at < COALESCE(a.next_started_at, a.finished_at + interval '24 hours')
    WHERE a.linked_campaign_id IS NOT NULL
      AND (_from IS NULL OR cc.clicked_at >= _from)
      AND (_to IS NULL OR cc.clicked_at <= _to)
  ), combined AS (
    SELECT * FROM direct_clicks
    UNION ALL
    SELECT * FROM legacy_clicks
  )
  SELECT combined.wa_campaign_id, COUNT(DISTINCT combined.person_key)::bigint AS clicks
  FROM combined
  GROUP BY combined.wa_campaign_id;
$function$;

REVOKE ALL ON FUNCTION public.wa_count_dispatch_clicks(uuid[], timestamp with time zone, timestamp with time zone) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wa_count_dispatch_clicks(uuid[], timestamp with time zone, timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wa_count_dispatch_clicks(uuid[], timestamp with time zone, timestamp with time zone) TO service_role;