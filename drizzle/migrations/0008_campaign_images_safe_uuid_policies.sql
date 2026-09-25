CREATE OR REPLACE FUNCTION public.ci_folder_workspace(_name text)
RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN split_part(_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN split_part(_name, '/', 1)::uuid ELSE NULL END
$$;
DROP POLICY IF EXISTS "members delete campaign images" ON storage.objects;
DROP POLICY IF EXISTS "members read campaign images" ON storage.objects;
DROP POLICY IF EXISTS "members upload campaign images" ON storage.objects;
CREATE POLICY "members delete campaign images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'campaign-images' AND public.ci_folder_workspace(name) IS NOT NULL AND public.is_workspace_member(public.ci_folder_workspace(name), auth.uid()));
CREATE POLICY "members read campaign images" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'campaign-images' AND public.ci_folder_workspace(name) IS NOT NULL AND public.is_workspace_member(public.ci_folder_workspace(name), auth.uid()));
CREATE POLICY "members upload campaign images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'campaign-images' AND public.ci_folder_workspace(name) IS NOT NULL AND public.is_workspace_member(public.ci_folder_workspace(name), auth.uid()));