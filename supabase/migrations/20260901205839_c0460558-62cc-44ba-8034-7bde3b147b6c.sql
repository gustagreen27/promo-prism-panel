CREATE TABLE public.platform_capacity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE CHECK (singleton),
  daily_capacity bigint NOT NULL DEFAULT 0 CHECK (daily_capacity >= 0),
  daily_completed bigint NOT NULL DEFAULT 0 CHECK (daily_completed >= 0),
  daily_available bigint NOT NULL DEFAULT 0 CHECK (daily_available >= 0),
  internal_note text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_capacity TO authenticated;
GRANT ALL ON public.platform_capacity TO service_role;
ALTER TABLE public.platform_capacity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "capacity_read_all_authenticated" ON public.platform_capacity
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "capacity_admin_write" ON public.platform_capacity
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_platform_capacity_updated BEFORE UPDATE ON public.platform_capacity
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.platform_capacity_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  previous jsonb,
  next jsonb NOT NULL,
  internal_note text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_capacity_audit TO authenticated;
GRANT ALL ON public.platform_capacity_audit TO service_role;
ALTER TABLE public.platform_capacity_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "capacity_audit_admin_read" ON public.platform_capacity_audit
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX idx_platform_capacity_audit_created ON public.platform_capacity_audit (created_at DESC);

INSERT INTO public.platform_capacity (daily_capacity, daily_completed, daily_available)
VALUES (1000000, 0, 1000000);