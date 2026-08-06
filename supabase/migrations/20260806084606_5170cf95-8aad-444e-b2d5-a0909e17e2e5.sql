CREATE POLICY "template_media_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'template-media');
CREATE POLICY "template_media_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'template-media');
CREATE POLICY "template_media_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'template-media');
CREATE POLICY "template_media_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'template-media');