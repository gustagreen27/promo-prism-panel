CREATE TABLE IF NOT EXISTS public.attendance_number_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, phone_number_id)
);

GRANT SELECT ON public.attendance_number_grants TO authenticated;
GRANT ALL ON public.attendance_number_grants TO service_role;

ALTER TABLE public.attendance_number_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own grants readable" ON public.attendance_number_grants
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins manage grants" ON public.attendance_number_grants
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.user_roles (user_id, role)
VALUES ('8fb4859c-1441-47a9-b5d9-3f9205067bc1', 'support')
ON CONFLICT DO NOTHING;

INSERT INTO public.attendance_number_grants (user_id, phone_number_id)
VALUES ('8fb4859c-1441-47a9-b5d9-3f9205067bc1', '1294636743726288')
ON CONFLICT DO NOTHING;

INSERT INTO public.workspace_members (workspace_id, user_id, role)
VALUES ('7c9a2f1e-1111-4a2b-9f00-0000a1a1a101', '8fb4859c-1441-47a9-b5d9-3f9205067bc1', 'operator')
ON CONFLICT DO NOTHING;