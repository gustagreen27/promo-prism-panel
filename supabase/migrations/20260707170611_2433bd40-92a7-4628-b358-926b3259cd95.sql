
CREATE TABLE IF NOT EXISTS public.wa_queue_tick_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  duration_ms integer NOT NULL DEFAULT 0,
  promoted_count integer NOT NULL DEFAULT 0,
  processed_campaigns integer NOT NULL DEFAULT 0,
  total_sent integer NOT NULL DEFAULT 0,
  total_failed integer NOT NULL DEFAULT 0,
  last_error text,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_queue_tick_logs_ran_at ON public.wa_queue_tick_logs (ran_at DESC);

GRANT SELECT ON public.wa_queue_tick_logs TO authenticated;
GRANT ALL ON public.wa_queue_tick_logs TO service_role;

ALTER TABLE public.wa_queue_tick_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view queue tick logs"
  ON public.wa_queue_tick_logs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
