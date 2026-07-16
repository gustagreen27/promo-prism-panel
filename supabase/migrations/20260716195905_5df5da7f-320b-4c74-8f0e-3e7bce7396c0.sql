DROP POLICY IF EXISTS "Workspace members read attempts" ON public.wa_campaign_attempts;
CREATE POLICY "Workspace members read attempts"
ON public.wa_campaign_attempts
FOR SELECT
TO authenticated
USING (
  workspace_id IS NOT NULL
  AND is_workspace_member(workspace_id, auth.uid())
);

DROP POLICY IF EXISTS "Staff read attempts" ON public.wa_campaign_attempts;
CREATE POLICY "Staff read attempts"
ON public.wa_campaign_attempts
FOR SELECT
TO authenticated
USING (is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS "Workspace members read routes" ON public.wa_campaign_routes;
CREATE POLICY "Workspace members read routes"
ON public.wa_campaign_routes
FOR SELECT
TO authenticated
USING (
  workspace_id IS NOT NULL
  AND is_workspace_member(workspace_id, auth.uid())
);

DROP POLICY IF EXISTS "Staff can manage routes" ON public.wa_campaign_routes;
CREATE POLICY "Staff can manage routes"
ON public.wa_campaign_routes
FOR ALL
TO authenticated
USING (is_internal_staff(auth.uid()))
WITH CHECK (is_internal_staff(auth.uid()));