CREATE OR REPLACE FUNCTION public.wa_tick_acquire_lease(_holder text, _duration_seconds integer DEFAULT 60)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_ok boolean;
  v_duration integer := LEAST(GREATEST(COALESCE(_duration_seconds, 6), 1), 6);
BEGIN
  UPDATE public.wa_tick_lease
    SET holder = _holder,
        acquired_at = v_now,
        expires_at = v_now + make_interval(secs => v_duration)
    WHERE id = 1
      AND (expires_at IS NULL OR expires_at <= v_now)
    RETURNING true INTO v_ok;
  RETURN COALESCE(v_ok, false);
END
$function$;

UPDATE public.wa_tick_lease
SET expires_at = LEAST(expires_at, clock_timestamp() + interval '6 seconds')
WHERE id = 1
  AND expires_at IS NOT NULL
  AND expires_at > clock_timestamp() + interval '6 seconds';

INSERT INTO public.campaign_timeline (campaign_id, event_type, message, payload)
VALUES (
  'cf31166b-1b8d-4e59-9ae8-9801334fce25',
  'throughput_fix',
  'Proteção ativa: lease global do tick limitado a 6s',
  jsonb_build_object('max_tick_lease_seconds', 6)
);