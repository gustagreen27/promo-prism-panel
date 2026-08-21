DROP INDEX IF EXISTS public.contacts_phone_client_idx;
CREATE UNIQUE INDEX contacts_phone_client_idx ON public.contacts USING btree (
  COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid),
  phone,
  COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid)
);