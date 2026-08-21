ALTER TABLE public.contact_lists ADD COLUMN IF NOT EXISTS created_by uuid;
CREATE INDEX IF NOT EXISTS idx_contact_lists_created_by ON public.contact_lists(workspace_id, created_by);