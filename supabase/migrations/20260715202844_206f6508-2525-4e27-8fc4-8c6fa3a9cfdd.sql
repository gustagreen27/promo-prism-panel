
CREATE OR REPLACE FUNCTION public.wa_try_consume_tokens(
  _phone_number_id text,
  _requested integer,
  _default_rate integer DEFAULT 6,
  _default_conc integer DEFAULT 15,
  _override_rate integer DEFAULT NULL,
  _override_conc integer DEFAULT NULL
)
RETURNS TABLE(granted integer, wait_ms integer, rate_per_second integer, max_concurrency integer, tokens_after numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.wa_rate_limits%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_elapsed_ms bigint;
  v_refill numeric;
  v_new_tokens numeric;
  v_capacity numeric;
  v_granted integer;
  v_effective_rate integer;
  v_effective_conc integer;
BEGIN
  IF _requested <= 0 THEN
    RETURN QUERY SELECT 0, 0, COALESCE(_override_rate, _default_rate), COALESCE(_override_conc, _default_conc), 0::numeric;
    RETURN;
  END IF;

  INSERT INTO public.wa_rate_limits(phone_number_id, rate_per_second, max_concurrency, tokens, last_refill_at)
  VALUES (_phone_number_id, COALESCE(_override_rate, _default_rate), COALESCE(_override_conc, _default_conc), COALESCE(_override_rate, _default_rate), v_now)
  ON CONFLICT (phone_number_id) DO NOTHING;

  SELECT * INTO v_row FROM public.wa_rate_limits
    WHERE phone_number_id = _phone_number_id FOR UPDATE;

  -- Overrides atualizam config global do número (rate/conc atuais da campanha em curso)
  IF _override_rate IS NOT NULL AND _override_rate <> v_row.rate_per_second THEN
    v_row.rate_per_second := _override_rate;
  END IF;
  IF _override_conc IS NOT NULL AND _override_conc <> v_row.max_concurrency THEN
    v_row.max_concurrency := _override_conc;
  END IF;

  v_effective_rate := v_row.rate_per_second;
  v_effective_conc := v_row.max_concurrency;
  v_capacity := v_effective_rate::numeric;

  v_elapsed_ms := GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_row.last_refill_at)) * 1000)::bigint;
  v_refill := (v_elapsed_ms::numeric / 1000.0) * v_effective_rate;
  v_new_tokens := LEAST(v_row.tokens + v_refill, v_capacity);

  v_granted := LEAST(_requested, FLOOR(v_new_tokens)::integer);

  IF v_granted > 0 THEN
    v_new_tokens := v_new_tokens - v_granted;
    UPDATE public.wa_rate_limits
      SET tokens = v_new_tokens,
          rate_per_second = v_effective_rate,
          max_concurrency = v_effective_conc,
          last_refill_at = v_now,
          updated_at = v_now
      WHERE phone_number_id = _phone_number_id;
    RETURN QUERY SELECT v_granted, 0, v_effective_rate, v_effective_conc, v_new_tokens;
  ELSE
    UPDATE public.wa_rate_limits
      SET tokens = v_new_tokens,
          rate_per_second = v_effective_rate,
          max_concurrency = v_effective_conc,
          last_refill_at = v_now,
          updated_at = v_now
      WHERE phone_number_id = _phone_number_id;
    RETURN QUERY SELECT 0,
      GREATEST(1, CEIL((1 - v_new_tokens) * 1000.0 / v_effective_rate))::integer,
      v_effective_rate, v_effective_conc, v_new_tokens;
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.wa_try_consume_tokens(text, integer, integer, integer, integer, integer) TO service_role, authenticated;
