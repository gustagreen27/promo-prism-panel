CREATE TABLE public.wa_template_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_template_references TO authenticated;
GRANT ALL ON public.wa_template_references TO service_role;

ALTER TABLE public.wa_template_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_template_refs" ON public.wa_template_references
  FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()) OR created_by = auth.uid());

CREATE POLICY "staff_write_template_refs" ON public.wa_template_references
  FOR INSERT TO authenticated
  WITH CHECK (public.is_internal_staff(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "staff_update_template_refs" ON public.wa_template_references
  FOR UPDATE TO authenticated
  USING (public.is_internal_staff(auth.uid()))
  WITH CHECK (public.is_internal_staff(auth.uid()));

CREATE POLICY "staff_delete_template_refs" ON public.wa_template_references
  FOR DELETE TO authenticated
  USING (public.is_internal_staff(auth.uid()));

CREATE TRIGGER wa_template_references_updated_at
  BEFORE UPDATE ON public.wa_template_references
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();