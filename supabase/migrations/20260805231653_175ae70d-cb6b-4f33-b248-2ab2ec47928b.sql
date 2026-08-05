-- 1. Lanes (parallel workers per campaign)
CREATE TABLE IF NOT EXISTS public.wa_worker_lanes (
  campaign_id uuid NOT NULL REFERENCES public.wa_campaigns(id) ON DELETE CASCADE,
  lane_index int NOT NULL,
  holder text,
  lease_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, lane_index)
);
GRANT SELECT ON public.wa_worker_lanes TO authenticated;
GRANT ALL ON public.wa_worker_lanes TO service_role;
ALTER TABLE public.wa_worker_lanes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read lanes" ON public.wa_worker_lanes
  FOR SELECT TO authenticated USING (public.is_internal_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.wa_lane_acquire(_campaign_id uuid, _lane int, _holder text, _seconds int DEFAULT 25)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_ok boolean;
BEGIN
  INSERT INTO public.wa_worker_lanes(campaign_id, lane_index, holder, lease_until)
  VALUES (_campaign_id, _lane, _holder, v_now + make_interval(secs => GREATEST(1, _seconds)))
  ON CONFLICT (campaign_id, lane_index) DO UPDATE
    SET holder = EXCLUDED.holder,
        lease_until = EXCLUDED.lease_until,
        updated_at = v_now
    WHERE public.wa_worker_lanes.lease_until IS NULL
       OR public.wa_worker_lanes.lease_until <= v_now
  RETURNING true INTO v_ok;
  RETURN COALESCE(v_ok, false);
END $$;
REVOKE EXECUTE ON FUNCTION public.wa_lane_acquire(uuid, int, text, int) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.wa_lane_release(_campaign_id uuid, _lane int, _holder text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_ok boolean;
BEGIN
  UPDATE public.wa_worker_lanes
     SET lease_until = clock_timestamp(), updated_at = clock_timestamp()
   WHERE campaign_id = _campaign_id AND lane_index = _lane AND holder = _holder
  RETURNING true INTO v_ok;
  RETURN COALESCE(v_ok, false);
END $$;
REVOKE EXECUTE ON FUNCTION public.wa_lane_release(uuid, int, text) FROM anon, authenticated;

-- 2. Campaign submission metadata
ALTER TABLE public.wa_campaigns
  ADD COLUMN IF NOT EXISTS bulk_id text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS priority int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS worker_lanes int NOT NULL DEFAULT 4;

-- 3. Per-number adaptive throttle
ALTER TABLE public.wa_rate_limits
  ADD COLUMN IF NOT EXISTS throttle_until timestamptz,
  ADD COLUMN IF NOT EXISTS throttle_rate int,
  ADD COLUMN IF NOT EXISTS throttle_reason text;

CREATE OR REPLACE FUNCTION public.wa_throttle_number(_phone_number_id text, _factor numeric DEFAULT 0.5, _seconds int DEFAULT 20, _reason text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_base int;
  v_new int;
BEGIN
  SELECT COALESCE(throttle_rate, rate_per_second) INTO v_base
    FROM public.wa_rate_limits WHERE phone_number_id = _phone_number_id FOR UPDATE;
  IF v_base IS NULL THEN RETURN NULL; END IF;
  v_new := GREATEST(1, FLOOR(v_base * GREATEST(0.1, LEAST(1.0, _factor)))::int);
  UPDATE public.wa_rate_limits
     SET throttle_rate = v_new,
         throttle_until = v_now + make_interval(secs => GREATEST(1, _seconds)),
         throttle_reason = _reason,
         updated_at = v_now
   WHERE phone_number_id = _phone_number_id;
  RETURN v_new;
END $$;
REVOKE EXECUTE ON FUNCTION public.wa_throttle_number(text, numeric, int, text) FROM anon, authenticated;

-- 4. Fast queue reservation index
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_queue
  ON public.campaign_recipients (campaign_id, next_attempt_at)
  WHERE status = 'pending';