CREATE TABLE IF NOT EXISTS public.wa_attendance_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  phone_number_id text NOT NULL,
  connection_id uuid,
  campaign_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_attendance_grants_ws_pni
  ON public.wa_attendance_grants (workspace_id, phone_number_id);
CREATE INDEX IF NOT EXISTS idx_wa_attendance_grants_campaign
  ON public.wa_attendance_grants (campaign_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_attendance_grants TO authenticated;
GRANT ALL ON public.wa_attendance_grants TO service_role;

ALTER TABLE public.wa_attendance_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read attendance grants"
  ON public.wa_attendance_grants FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()) OR public.is_internal_staff(auth.uid()));

CREATE POLICY "staff manage attendance grants"
  ON public.wa_attendance_grants FOR ALL TO authenticated
  USING (public.is_internal_staff(auth.uid()))
  WITH CHECK (public.is_internal_staff(auth.uid()));