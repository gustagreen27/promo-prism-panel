ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS meta_business_id text,
  ADD COLUMN IF NOT EXISTS meta_business_name text,
  ADD COLUMN IF NOT EXISTS default_connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workspaces_meta_business_id ON public.workspaces(meta_business_id) WHERE meta_business_id IS NOT NULL;