ALTER TABLE public.wa_rate_limits
  ADD COLUMN IF NOT EXISTS slot_updated_at timestamptz;

UPDATE public.wa_rate_limits
SET slot_updated_at = COALESCE(slot_updated_at, updated_at, last_refill_at, clock_timestamp())
WHERE slot_updated_at IS NULL;

CREATE OR REPLACE FUNCTION public.wa_acquire_slots(
  _phone_number_id text,
  _requested integer,
  _max_conc integer DEFAULT 200
)
RETURNS TABLE(granted integer, active_after integer, max_concurrency integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.wa_rate_limits%ROWTYPE;
  v_available integer;
  v_granted integer;
  v_effective_max integer;
  v_now timestamptz := clock_timestamp();
  v_slot_last_seen timestamptz;
  v_reset_stale boolean := false;
BEGIN
  IF _requested <= 0 THEN
    RETURN QUERY SELECT 0, 0, COALESCE(_max_conc, 200);
    RETURN;
  END IF;

  INSERT INTO public.wa_rate_limits(
    phone_number_id, rate_per_second, max_concurrency, tokens, last_refill_at,
    active_inflight, global_max_concurrency, slot_updated_at
  ) VALUES (
    _phone_number_id, 6, COALESCE(_max_conc, 200), 0, v_now,
    0, COALESCE(_max_conc, 200), v_now
  ) ON CONFLICT (phone_number_id) DO NOTHING;

  SELECT * INTO v_row FROM public.wa_rate_limits
    WHERE phone_number_id = _phone_number_id FOR UPDATE;

  v_effective_max := COALESCE(_max_conc, v_row.global_max_concurrency, 200);
  v_slot_last_seen := COALESCE(v_row.slot_updated_at, v_row.updated_at, v_row.last_refill_at, v_now - interval '1 hour');

  IF v_row.active_inflight >= v_effective_max AND v_slot_last_seen < (v_now - interval '20 seconds') THEN
    v_row.active_inflight := 0;
    v_reset_stale := true;
  END IF;

  v_available := GREATEST(0, v_effective_max - v_row.active_inflight);
  v_granted := LEAST(_requested, v_available);

  IF v_granted > 0 OR v_reset_stale THEN
    UPDATE public.wa_rate_limits
      SET active_inflight = v_row.active_inflight + v_granted,
          global_max_concurrency = v_effective_max,
          slot_updated_at = v_now,
          updated_at = v_now
      WHERE phone_number_id = _phone_number_id;
  ELSE
    UPDATE public.wa_rate_limits
      SET global_max_concurrency = v_effective_max
      WHERE phone_number_id = _phone_number_id;
  END IF;

  RETURN QUERY SELECT v_granted, v_row.active_inflight + v_granted, v_effective_max;
END
$function$;

CREATE OR REPLACE FUNCTION public.wa_release_slots(_phone_number_id text, _count integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new integer;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF _count <= 0 THEN
    SELECT active_inflight INTO v_new FROM public.wa_rate_limits
      WHERE phone_number_id = _phone_number_id;
    RETURN COALESCE(v_new, 0);
  END IF;

  UPDATE public.wa_rate_limits
    SET active_inflight = GREATEST(0, active_inflight - _count),
        slot_updated_at = v_now,
        updated_at = v_now
    WHERE phone_number_id = _phone_number_id
    RETURNING active_inflight INTO v_new;

  RETURN COALESCE(v_new, 0);
END
$function$;

UPDATE public.wa_campaigns
SET rate_per_second = 80,
    max_concurrency = GREATEST(COALESCE(max_concurrency, 0), 200),
    batch_size = 80,
    worker_lease_id = NULL,
    worker_lease_until = NULL,
    last_error = NULL,
    updated_at = clock_timestamp()
WHERE id = 'cf31166b-1b8d-4e59-9ae8-9801334fce25';

WITH target AS (
  SELECT wc.phone_number_id
  FROM public.wa_campaigns c
  JOIN public.whatsapp_connections wc ON wc.id = c.connection_id
  WHERE c.id = 'cf31166b-1b8d-4e59-9ae8-9801334fce25'
)
UPDATE public.wa_rate_limits rl
SET active_inflight = 0,
    tokens = GREATEST(COALESCE(rl.tokens, 0), COALESCE(rl.rate_per_second, 80)),
    last_refill_at = clock_timestamp(),
    slot_updated_at = clock_timestamp(),
    updated_at = clock_timestamp()
FROM target
WHERE rl.phone_number_id = target.phone_number_id;

UPDATE public.campaign_recipients
SET status = 'pending',
    failed_reason = NULL,
    error_code = NULL,
    next_attempt_at = NULL
WHERE campaign_id = 'cf31166b-1b8d-4e59-9ae8-9801334fce25'
  AND status = 'processing'
  AND meta_message_id IS NULL
  AND last_attempt_at < (clock_timestamp() - interval '45 seconds');

INSERT INTO public.campaign_timeline (campaign_id, event_type, message, payload)
VALUES (
  'cf31166b-1b8d-4e59-9ae8-9801334fce25',
  'throughput_fix',
  'Correção aplicada: devolução de slots batch não usados e campanha ajustada para 80 req/s',
  jsonb_build_object('rate_per_second', 80, 'max_concurrency_min', 200, 'batch_size', 80)
);