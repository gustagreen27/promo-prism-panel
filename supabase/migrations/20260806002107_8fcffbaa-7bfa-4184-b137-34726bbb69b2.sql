ALTER TABLE public.wa_campaigns ADD COLUMN IF NOT EXISTS http_concurrency integer NOT NULL DEFAULT 10;

ALTER TABLE public.wa_worker_lanes
  ADD COLUMN IF NOT EXISTS reserved integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS http_in_flight integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS http_concurrency_limit integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS requests_started integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS requests_completed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accepted_total integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS started_last_second integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_last_second integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_request_ms integer,
  ADD COLUMN IF NOT EXISTS idle_ms integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS time_between_requests_ms integer,
  ADD COLUMN IF NOT EXISTS idle_reason text,
  ADD COLUMN IF NOT EXISTS lease_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;

CREATE OR REPLACE FUNCTION public.wa_lane_heartbeat(
  _campaign_id uuid,
  _lane integer,
  _holder text,
  _reserved integer,
  _http_in_flight integer,
  _http_concurrency_limit integer,
  _requests_started integer,
  _requests_completed integer,
  _accepted_total integer,
  _started_last_second integer,
  _completed_last_second integer,
  _avg_request_ms integer,
  _idle_ms integer,
  _time_between_requests_ms integer,
  _idle_reason text
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.wa_worker_lanes SET
    reserved = _reserved,
    http_in_flight = _http_in_flight,
    http_concurrency_limit = _http_concurrency_limit,
    requests_started = _requests_started,
    requests_completed = _requests_completed,
    accepted_total = _accepted_total,
    started_last_second = _started_last_second,
    completed_last_second = _completed_last_second,
    avg_request_ms = _avg_request_ms,
    idle_ms = _idle_ms,
    time_between_requests_ms = _time_between_requests_ms,
    idle_reason = _idle_reason,
    lease_started_at = coalesce(lease_started_at, now()),
    heartbeat_at = now(),
    updated_at = now()
  WHERE campaign_id = _campaign_id AND lane_index = _lane AND holder = _holder;
$$;

REVOKE ALL ON FUNCTION public.wa_lane_heartbeat(uuid,integer,text,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_lane_heartbeat(uuid,integer,text,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,text) TO service_role;

CREATE OR REPLACE FUNCTION public.wa_dispatch_performance(_campaign_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _camp record;
  _queued int; _processing int; _accepted int; _failed int; _total int;
  _last60 int; _last15 int; _peak_min numeric; _avg numeric;
  _lanes int; _numbers int; _ratelimit int; _timeouts int;
  _lat_avg numeric; _lat_max numeric;
  _last_meta jsonb;
  _elapsed numeric;
  _in_flight int; _conc_limit int; _started_ls int; _completed_ls int;
  _idle_avg numeric; _gap_avg numeric;
  _lane_rows jsonb;
  _accepted_ls int;
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
         count(*) FILTER (WHERE sent_at > now() - interval '15 seconds'),
         count(*) FILTER (WHERE sent_at > now() - interval '1 second')
  INTO _last60, _last15, _accepted_ls
  FROM campaign_recipients WHERE campaign_id = _campaign_id AND sent_at IS NOT NULL;

  SELECT coalesce(max(c), 0) INTO _peak_min FROM (
    SELECT count(*) c FROM campaign_recipients
    WHERE campaign_id = _campaign_id AND sent_at IS NOT NULL
    GROUP BY date_trunc('second', sent_at)
  ) s;

  SELECT count(*),
         coalesce(sum(http_in_flight) FILTER (WHERE heartbeat_at > now() - interval '10 seconds'), 0),
         coalesce(sum(http_concurrency_limit), 0),
         coalesce(sum(started_last_second) FILTER (WHERE heartbeat_at > now() - interval '5 seconds'), 0),
         coalesce(sum(completed_last_second) FILTER (WHERE heartbeat_at > now() - interval '5 seconds'), 0),
         round(avg(idle_ms)), round(avg(time_between_requests_ms))
    INTO _lanes, _in_flight, _conc_limit, _started_ls, _completed_ls, _idle_avg, _gap_avg
    FROM wa_worker_lanes
   WHERE campaign_id = _campaign_id AND lease_until > now();

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'lane', lane_index,
           'reserved', reserved,
           'http_in_flight', http_in_flight,
           'http_concurrency_limit', http_concurrency_limit,
           'sent_last_minute', accepted_total,
           'avg_request_ms', avg_request_ms,
           'idle_ms', idle_ms,
           'time_between_requests_ms', time_between_requests_ms,
           'idle_reason', idle_reason,
           'lease_started_at', lease_started_at,
           'lease_until', lease_until,
           'heartbeat_at', heartbeat_at
         ) ORDER BY lane_index), '[]'::jsonb)
    INTO _lane_rows
    FROM wa_worker_lanes
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
    'reserved_recipients', _processing,
    'http_in_flight', _in_flight,
    'http_concurrency_limit', _conc_limit,
    'requests_started_last_second', _started_ls,
    'requests_completed_last_second', _completed_ls,
    'accepted_last_second', _accepted_ls,
    'worker_idle_time_ms', _idle_avg,
    'time_between_requests_ms', _gap_avg,
    'lanes', _lane_rows,
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
$function$;