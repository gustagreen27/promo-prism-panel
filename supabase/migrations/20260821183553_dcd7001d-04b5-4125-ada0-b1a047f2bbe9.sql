
CREATE POLICY "members upload campaign images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'campaign-images'
  AND public.is_workspace_member((storage.foldername(name))[1]::uuid, auth.uid())
);

CREATE POLICY "members read campaign images"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'campaign-images'
  AND public.is_workspace_member((storage.foldername(name))[1]::uuid, auth.uid())
);

CREATE POLICY "members delete campaign images"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'campaign-images'
  AND public.is_workspace_member((storage.foldername(name))[1]::uuid, auth.uid())
);
