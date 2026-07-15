-- ============================================================
-- Fase 1: concorrência global por número + burst cap + self-chain
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1) Colunas de concorrência global por número ---------------
ALTER TABLE public.whatsapp_connections
  ADD COLUMN IF NOT EXISTS global_max_concurrency integer NOT NULL DEFAULT 200;

ALTER TABLE public.wa_rate_limits
  ADD COLUMN IF NOT EXISTS active_inflight integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS global_max_concurrency integer NOT NULL DEFAULT 200;

-- 2) Acquire atômico de vagas de concorrência global ---------
CREATE OR REPLACE FUNCTION public.wa_acquire_slots(
  _phone_number_id text,
  _requested integer,
  _max_conc integer DEFAULT 200
) RETURNS TABLE(granted integer, active_after integer, max_concurrency integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.wa_rate_limits%ROWTYPE;
  v_available integer;
  v_granted integer;
  v_effective_max integer;
BEGIN
  IF _requested <= 0 THEN
    RETURN QUERY SELECT 0, 0, COALESCE(_max_conc, 200);
    RETURN;
  END IF;

  INSERT INTO public.wa_rate_limits(
    phone_number_id, rate_per_second, max_concurrency, tokens, last_refill_at,
    active_inflight, global_max_concurrency
  ) VALUES (
    _phone_number_id, 6, COALESCE(_max_conc, 200), 0, clock_timestamp(),
    0, COALESCE(_max_conc, 200)
  ) ON CONFLICT (phone_number_id) DO NOTHING;

  SELECT * INTO v_row FROM public.wa_rate_limits
    WHERE phone_number_id = _phone_number_id FOR UPDATE;

  v_effective_max := COALESCE(_max_conc, v_row.global_max_concurrency, 200);
  v_available := GREATEST(0, v_effective_max - v_row.active_inflight);
  v_granted := LEAST(_requested, v_available);

  UPDATE public.wa_rate_limits
    SET active_inflight = active_inflight + v_granted,
        global_max_concurrency = v_effective_max,
        updated_at = clock_timestamp()
    WHERE phone_number_id = _phone_number_id;

  RETURN QUERY SELECT v_granted, v_row.active_inflight + v_granted, v_effective_max;
END $$;

-- 3) Release em lote ----------------------------------------
CREATE OR REPLACE FUNCTION public.wa_release_slots(
  _phone_number_id text,
  _count integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_new integer;
BEGIN
  IF _count <= 0 THEN
    SELECT active_inflight INTO v_new FROM public.wa_rate_limits
      WHERE phone_number_id = _phone_number_id;
    RETURN COALESCE(v_new, 0);
  END IF;

  UPDATE public.wa_rate_limits
    SET active_inflight = GREATEST(0, active_inflight - _count),
        updated_at = clock_timestamp()
    WHERE phone_number_id = _phone_number_id
    RETURNING active_inflight INTO v_new;

  RETURN COALESCE(v_new, 0);
END $$;

-- 4) Rate limiter global com cap de burst ---------------------
-- Substitui a versão anterior. Novo parâmetro _burst_cap_ms limita
-- a capacidade acumulável para evitar rajadas após pausas.
DROP FUNCTION IF EXISTS public.wa_try_consume_tokens(text, integer, integer, integer, integer, integer);
CREATE OR REPLACE FUNCTION public.wa_try_consume_tokens(
  _phone_number_id text,
  _requested integer,
  _default_rate integer DEFAULT 6,
  _default_conc integer DEFAULT 15,
  _override_rate integer DEFAULT NULL,
  _override_conc integer DEFAULT NULL,
  _burst_cap_ms integer DEFAULT 100
) RETURNS TABLE(
  granted integer, wait_ms integer, rate_per_second integer,
  max_concurrency integer, tokens_after numeric
)
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
  v_granted integer;
  v_effective_rate integer;
  v_effective_conc integer;
BEGIN
  IF _requested <= 0 THEN
    RETURN QUERY SELECT 0, 0,
      COALESCE(_override_rate, _default_rate),
      COALESCE(_override_conc, _default_conc), 0::numeric;
    RETURN;
  END IF;

  INSERT INTO public.wa_rate_limits(
    phone_number_id, rate_per_second, max_concurrency, tokens, last_refill_at
  ) VALUES (
    _phone_number_id,
    COALESCE(_override_rate, _default_rate),
    COALESCE(_override_conc, _default_conc),
    0, v_now
  ) ON CONFLICT (phone_number_id) DO NOTHING;

  SELECT * INTO v_row FROM public.wa_rate_limits
    WHERE phone_number_id = _phone_number_id FOR UPDATE;

  IF _override_rate IS NOT NULL AND _override_rate <> v_row.rate_per_second THEN
    v_row.rate_per_second := _override_rate;
  END IF;
  IF _override_conc IS NOT NULL AND _override_conc <> v_row.max_concurrency THEN
    v_row.max_concurrency := _override_conc;
  END IF;

  v_effective_rate := v_row.rate_per_second;
  v_effective_conc := v_row.max_concurrency;
  -- Cap de burst: no máximo _burst_cap_ms de rate acumulável.
  -- Ex.: rate 80 + burst_cap 100ms → capacidade 8 tokens (100ms de trabalho).
  v_capacity := GREATEST(1, CEIL(v_effective_rate::numeric * (_burst_cap_ms::numeric / 1000.0)));

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
END $$;

-- 5) Lease singleton para self-chaining -----------------------
CREATE TABLE IF NOT EXISTS public.wa_tick_lease(
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  holder text,
  acquired_at timestamptz,
  expires_at timestamptz,
  chained_at timestamptz,
  chain_count bigint NOT NULL DEFAULT 0,
  last_chain_request_id bigint
);
GRANT ALL ON public.wa_tick_lease TO service_role;
ALTER TABLE public.wa_tick_lease ENABLE ROW LEVEL SECURITY;
-- sem policies: apenas service_role acessa (via RPCs SECURITY DEFINER)
INSERT INTO public.wa_tick_lease(id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.wa_tick_acquire_lease(
  _holder text,
  _duration_seconds integer DEFAULT 60
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_ok boolean;
BEGIN
  UPDATE public.wa_tick_lease
    SET holder = _holder,
        acquired_at = v_now,
        expires_at = v_now + make_interval(secs => _duration_seconds)
    WHERE id = 1
      AND (expires_at IS NULL OR expires_at <= v_now)
    RETURNING true INTO v_ok;
  RETURN COALESCE(v_ok, false);
END $$;

CREATE OR REPLACE FUNCTION public.wa_tick_release_lease(_holder text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_ok boolean;
BEGIN
  UPDATE public.wa_tick_lease
    SET expires_at = clock_timestamp()
    WHERE id = 1 AND holder = _holder
    RETURNING true INTO v_ok;
  RETURN COALESCE(v_ok, false);
END $$;

-- Encadeia o próximo tick via pg_net. Só dispara se o lease atual foi
-- liberado (evita duplicar quando o cron watchdog e o chain colidem).
CREATE OR REPLACE FUNCTION public.wa_tick_chain(
  _url text,
  _apikey text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lease public.wa_tick_lease%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_request_id bigint;
BEGIN
  SELECT * INTO v_lease FROM public.wa_tick_lease WHERE id = 1 FOR UPDATE;

  IF v_lease.expires_at IS NOT NULL AND v_lease.expires_at > v_now THEN
    RETURN jsonb_build_object('chained', false, 'reason', 'lease_active',
      'expires_at', v_lease.expires_at);
  END IF;

  SELECT net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', _apikey,
      'x-tick-source', 'chain'
    ),
    body := jsonb_build_object('source', 'chain', 'at', v_now)
  ) INTO v_request_id;

  UPDATE public.wa_tick_lease
    SET chained_at = v_now,
        chain_count = chain_count + 1,
        last_chain_request_id = v_request_id
    WHERE id = 1;

  RETURN jsonb_build_object('chained', true, 'request_id', v_request_id);
END $$;