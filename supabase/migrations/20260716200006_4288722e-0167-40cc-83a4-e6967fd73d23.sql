DROP POLICY IF EXISTS "workspace members read whatsapp_connections" ON public.whatsapp_connections;
CREATE POLICY "workspace members read whatsapp_connections"
ON public.whatsapp_connections
FOR SELECT
TO authenticated
USING (
  workspace_id IS NOT NULL
  AND has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role])
);

DROP POLICY IF EXISTS "workspace members write whatsapp_connections" ON public.whatsapp_connections;
CREATE POLICY "workspace members write whatsapp_connections"
ON public.whatsapp_connections
FOR ALL
TO authenticated
USING (
  workspace_id IS NOT NULL
  AND has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role])
)
WITH CHECK (
  workspace_id IS NOT NULL
  AND has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role])
);

DROP POLICY IF EXISTS "workspace members read whatsapp_wabas" ON public.whatsapp_wabas;
CREATE POLICY "workspace members read whatsapp_wabas"
ON public.whatsapp_wabas
FOR SELECT
TO authenticated
USING (
  workspace_id IS NOT NULL
  AND has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role])
);

DROP POLICY IF EXISTS "workspace members write whatsapp_wabas" ON public.whatsapp_wabas;
CREATE POLICY "workspace members write whatsapp_wabas"
ON public.whatsapp_wabas
FOR ALL
TO authenticated
USING (
  workspace_id IS NOT NULL
  AND has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role])
)
WITH CHECK (
  workspace_id IS NOT NULL
  AND has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role])
);