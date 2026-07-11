-- 1) Rate limiter table (token bucket per phone_number_id)
CREATE TABLE IF NOT EXISTS public.wa_rate_limits (
  phone_number_id text PRIMARY KEY,
  rate_per_second integer NOT NULL DEFAULT 6,
  max_concurrency integer NOT NULL DEFAULT 15,
  tokens numeric NOT NULL DEFAULT 6,
  last_refill_at timestamptz NOT NULL DEFAULT now(),
  throughput_level text,
  throughput_mps integer,
  throughput_synced_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.wa_rate_limits TO authenticated;
GRANT ALL ON public.wa_rate_limits TO service_role;

ALTER TABLE public.wa_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read rate limits" ON public.wa_rate_limits;
CREATE POLICY "Staff can read rate limits"
ON public.wa_rate_limits
FOR SELECT
TO authenticated
USING (public.is_internal_staff(auth.uid()));

-- 2) Token bucket RPC — atomic under row lock
CREATE OR REPLACE FUNCTION public.wa_try_consume_token(
  _phone_number_id text,
  _default_rate integer DEFAULT 6,
  _default_conc integer DEFAULT 15
)
RETURNS TABLE(allowed boolean, wait_ms integer, rate_per_second integer, max_concurrency integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.wa_rate_limits%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_elapsed_ms bigint;
  v_refill numeric;
  v_new_tokens numeric;
  v_capacity numeric;
BEGIN
  INSERT INTO public.wa_rate_limits(phone_number_id, rate_per_second, max_concurrency, tokens, last_refill_at)
  VALUES (_phone_number_id, _default_rate, _default_conc, _default_rate, v_now)
  ON CONFLICT (phone_number_id) DO NOTHING;

  SELECT * INTO v_row FROM public.wa_rate_limits
    WHERE phone_number_id = _phone_number_id FOR UPDATE;

  v_capacity := v_row.rate_per_second::numeric;
  v_elapsed_ms := GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_row.last_refill_at)) * 1000)::bigint;
  v_refill := (v_elapsed_ms::numeric / 1000.0) * v_row.rate_per_second;
  v_new_tokens := LEAST(v_row.tokens + v_refill, v_capacity);

  IF v_new_tokens >= 1 THEN
    UPDATE public.wa_rate_limits
      SET tokens = v_new_tokens - 1,
          last_refill_at = v_now,
          updated_at = v_now
      WHERE phone_number_id = _phone_number_id;
    RETURN QUERY SELECT true, 0, v_row.rate_per_second, v_row.max_concurrency;
  ELSE
    UPDATE public.wa_rate_limits
      SET tokens = v_new_tokens,
          last_refill_at = v_now,
          updated_at = v_now
      WHERE phone_number_id = _phone_number_id;
    RETURN QUERY SELECT false,
      GREATEST(1, CEIL((1 - v_new_tokens) * 1000.0 / v_row.rate_per_second))::integer,
      v_row.rate_per_second,
      v_row.max_concurrency;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.wa_try_consume_token(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wa_try_consume_token(text, integer, integer) TO service_role;

-- 3) Per-recipient retry scheduling
ALTER TABLE public.campaign_recipients
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_pending_retry
  ON public.campaign_recipients (campaign_id, status, next_attempt_at)
  WHERE status = 'pending';