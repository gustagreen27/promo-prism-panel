CREATE OR REPLACE FUNCTION public.wa_dispatch_performance(_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _camp record;
  _queued int; _processing int; _accepted int; _failed int; _total int;
  _last60 int; _last15 int; _peak_min numeric; _avg numeric;
  _lanes int; _numbers int; _ratelimit int; _timeouts int;
  _lat_avg numeric; _lat_max numeric;
  _last_meta jsonb;
  _elapsed numeric;
BEGIN
  SELECT * INTO _camp FROM wa_campaigns WHERE id = _campaign_id;
  IF _camp IS NULL THEN RETURN NULL; END IF;

  SELECT
    count(*) FILTER (WHERE status = 'pending'),
    count(*) FILTER (WHERE status = 'processing'),
    count(*) FILTER (WHERE status IN ('accepted','sent','delivered','read','replied')),
    count(*) FILTER (WHERE status = 'failed'),
    count(*)
  INTO _queued, _processing, _accepted, _failed, _total
  FROM campaign_recipients WHERE campaign_id = _campaign_id;

  SELECT count(*) FILTER (WHERE sent_at > now() - interval '60 seconds'),
         count(*) FILTER (WHERE sent_at > now() - interval '15 seconds')
  INTO _last60, _last15
  FROM campaign_recipients WHERE campaign_id = _campaign_id AND sent_at IS NOT NULL;

  SELECT coalesce(max(c), 0) INTO _peak_min FROM (
    SELECT count(*) c FROM campaign_recipients
    WHERE campaign_id = _campaign_id AND sent_at IS NOT NULL
    GROUP BY date_trunc('second', sent_at)
  ) s;

  SELECT count(*) INTO _lanes FROM wa_worker_lanes
   WHERE campaign_id = _campaign_id AND lease_until > now();

  SELECT count(DISTINCT c.phone_number_id) INTO _numbers
    FROM whatsapp_connections c
    JOIN wa_rate_limits rl ON rl.phone_number_id = c.phone_number_id
   WHERE c.id = _camp.connection_id AND rl.updated_at > now() - interval '2 minutes';

  SELECT count(*) FILTER (WHERE error_code = '130429'),
         count(*) FILTER (WHERE error_code IN ('network_error','timeout'))
  INTO _ratelimit, _timeouts
  FROM campaign_recipients WHERE campaign_id = _campaign_id;

  SELECT round(avg(extract(epoch FROM (response_received_at - request_started_at)) * 1000)),
         round(max(extract(epoch FROM (response_received_at - request_started_at)) * 1000))
  INTO _lat_avg, _lat_max
  FROM campaign_recipients
  WHERE campaign_id = _campaign_id AND response_received_at IS NOT NULL
    AND sent_at > now() - interval '10 minutes';

  SELECT jsonb_build_object(
           'at', coalesce(response_received_at, sent_at, failed_at),
           'status', status,
           'latency_ms', CASE WHEN response_received_at IS NOT NULL AND request_started_at IS NOT NULL
                THEN round(extract(epoch FROM (response_received_at - request_started_at)) * 1000) END,
           'error', failed_reason,
           'error_code', error_code)
    INTO _last_meta
    FROM campaign_recipients
   WHERE campaign_id = _campaign_id AND (sent_at IS NOT NULL OR failed_at IS NOT NULL)
   ORDER BY greatest(coalesce(sent_at, 'epoch'::timestamptz), coalesce(failed_at, 'epoch'::timestamptz)) DESC
   LIMIT 1;

  _elapsed := GREATEST(1, extract(epoch FROM (coalesce(_camp.finished_at, now()) - coalesce(_camp.started_at, _camp.created_at))));
  _avg := round((_accepted / _elapsed)::numeric, 2);

  RETURN jsonb_build_object(
    'campaign_id', _campaign_id,
    'status', _camp.status,
    'submitted_at', _camp.submitted_at,
    'started_at', _camp.started_at,
    'total', _total,
    'queued', _queued,
    'processing', _processing,
    'accepted', _accepted,
    'failed', _failed,
    'rate_now', round((_last15 / 15.0)::numeric, 2),
    'rate_last_minute', _last60,
    'rate_avg', _avg,
    'rate_peak', _peak_min,
    'active_lanes', _lanes,
    'active_numbers', _numbers,
    'rate_limit_errors', _ratelimit,
    'timeouts', _timeouts,
    'api_latency_avg_ms', _lat_avg,
    'api_latency_max_ms', _lat_max,
    'last_meta_response', _last_meta,
    'eta_seconds', CASE WHEN _last60 > 0 AND _queued > 0
                        THEN round((_queued / (_last60 / 60.0))::numeric) ELSE NULL END,
    'measured_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.wa_dispatch_performance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wa_dispatch_performance(uuid) TO authenticated, service_role;