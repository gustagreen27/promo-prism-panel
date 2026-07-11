CREATE OR REPLACE FUNCTION public.wa_simulate_rate_limiter(
  _phone text,
  _duration_ms integer DEFAULT 10000,
  _rate integer DEFAULT 6,
  _conc integer DEFAULT 15
)
RETURNS TABLE(
  total_allowed integer,
  duration_ms integer,
  avg_mps numeric,
  peak_mps integer,
  p95_mps integer,
  bucket_by_second jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_end timestamptz;
  v_start timestamptz := clock_timestamp();
  v_res record;
  v_wait_s double precision;
  v_ts timestamptz;
  v_total integer := 0;
BEGIN
  -- Reset (or create) the bucket for this test number
  DELETE FROM public.wa_rate_limits WHERE phone_number_id = _phone;
  INSERT INTO public.wa_rate_limits(phone_number_id, rate_per_second, max_concurrency, tokens, last_refill_at)
    VALUES (_phone, _rate, _conc, 0, v_start);

  CREATE TEMP TABLE IF NOT EXISTS _sim_hits(t timestamptz) ON COMMIT DROP;
  TRUNCATE _sim_hits;

  v_end := v_start + make_interval(secs => _duration_ms::double precision / 1000.0);

  LOOP
    EXIT WHEN clock_timestamp() >= v_end;

    SELECT * INTO v_res FROM public.wa_try_consume_token(_phone, _rate, _conc);
    IF v_res.allowed THEN
      v_ts := clock_timestamp();
      INSERT INTO _sim_hits(t) VALUES (v_ts);
      v_total := v_total + 1;
    ELSE
      v_wait_s := GREATEST(0.001, LEAST(v_res.wait_ms::double precision / 1000.0, 0.5));
      PERFORM pg_sleep(v_wait_s);
    END IF;
  END LOOP;

  RETURN QUERY
  WITH per_sec AS (
    SELECT floor(extract(epoch from (t - v_start)))::integer AS sec, count(*) AS hits
    FROM _sim_hits
    GROUP BY 1
    ORDER BY 1
  )
  SELECT
    v_total AS total_allowed,
    _duration_ms AS duration_ms,
    ROUND((v_total::numeric * 1000.0) / _duration_ms, 3) AS avg_mps,
    COALESCE(MAX(hits), 0)::integer AS peak_mps,
    COALESCE(
      (SELECT hits FROM per_sec
        ORDER BY hits
        OFFSET GREATEST(0, (SELECT count(*) FROM per_sec) - 1 - ((SELECT count(*) FROM per_sec) / 20))
        LIMIT 1),
      0
    )::integer AS p95_mps,
    COALESCE(jsonb_object_agg(sec::text, hits ORDER BY sec), '{}'::jsonb) AS bucket_by_second
  FROM per_sec;

  -- Clean up the test bucket
  DELETE FROM public.wa_rate_limits WHERE phone_number_id = _phone;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.wa_simulate_rate_limiter(text, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wa_simulate_rate_limiter(text, integer, integer, integer) TO service_role;