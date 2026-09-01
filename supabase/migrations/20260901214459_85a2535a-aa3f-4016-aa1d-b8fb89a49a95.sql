-- lovable-cron-fallback-reviewed: 1440 runs/day; admin-configurable update interval can be as low as 1 minute, so the tick must be evaluated every minute
ALTER TABLE public.platform_capacity DROP COLUMN daily_available;
ALTER TABLE public.platform_capacity
  ADD COLUMN daily_available bigint GENERATED ALWAYS AS (GREATEST(daily_capacity - daily_completed, 0)) STORED;

ALTER TABLE public.platform_capacity
  ADD COLUMN auto_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN auto_start_time time NOT NULL DEFAULT '08:00',
  ADD COLUMN auto_end_time time NOT NULL DEFAULT '22:00',
  ADD COLUMN auto_interval_minutes integer NOT NULL DEFAULT 15 CHECK (auto_interval_minutes BETWEEN 1 AND 1440),
  ADD COLUMN auto_min_step integer NOT NULL DEFAULT 1000 CHECK (auto_min_step >= 0),
  ADD COLUMN auto_max_step integer NOT NULL DEFAULT 5000 CHECK (auto_max_step >= 0),
  ADD COLUMN auto_target_completed bigint NOT NULL DEFAULT 0 CHECK (auto_target_completed >= 0),
  ADD COLUMN auto_last_run_at timestamptz;

CREATE OR REPLACE FUNCTION public.platform_capacity_auto_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.platform_capacity%ROWTYPE;
  now_sp timestamptz := now();
  local_time time := (now() AT TIME ZONE 'America/Sao_Paulo')::time;
  step bigint;
  target bigint;
  new_completed bigint;
BEGIN
  SELECT * INTO r FROM public.platform_capacity ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR NOT r.auto_enabled THEN
    RETURN jsonb_build_object('ran', false, 'reason', 'disabled');
  END IF;

  IF r.auto_start_time <= r.auto_end_time THEN
    IF local_time < r.auto_start_time OR local_time > r.auto_end_time THEN
      RETURN jsonb_build_object('ran', false, 'reason', 'outside_window');
    END IF;
  ELSE
    IF local_time < r.auto_start_time AND local_time > r.auto_end_time THEN
      RETURN jsonb_build_object('ran', false, 'reason', 'outside_window');
    END IF;
  END IF;

  IF r.auto_last_run_at IS NOT NULL
     AND now_sp < r.auto_last_run_at + make_interval(mins => r.auto_interval_minutes) THEN
    RETURN jsonb_build_object('ran', false, 'reason', 'interval_not_elapsed');
  END IF;

  target := LEAST(NULLIF(r.auto_target_completed, 0), r.daily_capacity);
  IF target IS NULL THEN target := r.daily_capacity; END IF;

  IF r.daily_completed >= target THEN
    UPDATE public.platform_capacity SET auto_enabled = false WHERE id = r.id;
    RETURN jsonb_build_object('ran', false, 'reason', 'target_reached');
  END IF;

  step := r.auto_min_step + floor(random() * (GREATEST(r.auto_max_step, r.auto_min_step) - r.auto_min_step + 1))::bigint;
  new_completed := LEAST(r.daily_completed + step, target);

  UPDATE public.platform_capacity
     SET daily_completed = new_completed,
         auto_last_run_at = now_sp
   WHERE id = r.id;

  INSERT INTO public.platform_capacity_audit (previous, next, internal_note, changed_by)
  VALUES (
    jsonb_build_object('daily_capacity', r.daily_capacity, 'daily_completed', r.daily_completed,
                       'daily_available', GREATEST(r.daily_capacity - r.daily_completed, 0)),
    jsonb_build_object('daily_capacity', r.daily_capacity, 'daily_completed', new_completed,
                       'daily_available', GREATEST(r.daily_capacity - new_completed, 0)),
    'Atualização automática (+' || (new_completed - r.daily_completed) || ')',
    NULL
  );

  RETURN jsonb_build_object('ran', true, 'added', new_completed - r.daily_completed, 'daily_completed', new_completed);
END;
$$;

REVOKE ALL ON FUNCTION public.platform_capacity_auto_tick() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_capacity_auto_tick() TO service_role;

SELECT cron.schedule('platform-capacity-auto-tick', '* * * * *', $$SELECT public.platform_capacity_auto_tick();$$)
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'platform-capacity-auto-tick');
