CREATE OR REPLACE FUNCTION public.public_report_stats(p_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH r AS (
    SELECT id FROM public.imported_dispatch_reports
    WHERE public_slug = lower(p_slug) AND is_public = true
    LIMIT 1
  ), rec AS (
    SELECT * FROM public.imported_dispatch_report_records WHERE report_id = (SELECT id FROM r)
  ), sent_buckets AS (
    SELECT to_char(date_trunc('minute', last_sent_at AT TIME ZONE 'America/Sao_Paulo'), 'DD/MM HH24:MI') AS t,
           count(*) AS v
    FROM rec WHERE last_sent_at IS NOT NULL GROUP BY 1
  ), reply_buckets AS (
    SELECT to_char(date_trunc('hour', last_received_at AT TIME ZONE 'America/Sao_Paulo'), 'DD/MM HH24:MI') AS t,
           count(*) AS v
    FROM rec WHERE last_received_at IS NOT NULL GROUP BY 1
  ), ddds AS (
    SELECT substring(regexp_replace(phone, '\D', '', 'g') from 3 for 2) AS ddd, count(*) AS v
    FROM rec
    WHERE phone IS NOT NULL AND length(regexp_replace(phone, '\D', '', 'g')) >= 12
    GROUP BY 1 ORDER BY 2 DESC LIMIT 12
  )
  SELECT jsonb_build_object(
    'sent', (SELECT count(*) FROM rec WHERE last_sent_at IS NOT NULL),
    'replied', (SELECT count(*) FROM rec WHERE last_received_at IS NOT NULL),
    'noSend', (SELECT count(*) FROM rec WHERE last_sent_at IS NULL),
    'medianReplySec', (
      SELECT COALESCE(percentile_disc(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (last_received_at - last_sent_at))
      ), 0)::int
      FROM rec WHERE last_received_at IS NOT NULL AND last_sent_at IS NOT NULL
        AND last_received_at >= last_sent_at
    ),
    'timeline', COALESCE((SELECT jsonb_agg(jsonb_build_object('t', t, 'v', v) ORDER BY t) FROM sent_buckets), '[]'::jsonb),
    'replyTimeline', COALESCE((SELECT jsonb_agg(jsonb_build_object('t', t, 'v', v) ORDER BY t) FROM reply_buckets), '[]'::jsonb),
    'ddd', COALESCE((SELECT jsonb_agg(jsonb_build_object('ddd', ddd, 'v', v) ORDER BY v DESC) FROM ddds), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.public_report_stats(text) TO anon, authenticated, service_role;