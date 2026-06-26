-- Allow admins to manage objects in campaign-images bucket; reads happen via server proxy using service role.
CREATE POLICY "admins upload campaign images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'campaign-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins update campaign images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'campaign-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins delete campaign images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'campaign-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins read campaign images"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'campaign-images' AND public.has_role(auth.uid(), 'admin'));