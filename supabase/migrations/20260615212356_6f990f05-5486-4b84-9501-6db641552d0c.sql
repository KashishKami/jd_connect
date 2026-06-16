CREATE POLICY "downloads_no_select" ON storage.objects
  FOR SELECT TO authenticated, anon
  USING (bucket_id = 'downloads' AND false);

CREATE POLICY "downloads_no_insert" ON storage.objects
  FOR INSERT TO authenticated, anon
  WITH CHECK (bucket_id = 'downloads' AND false);

CREATE POLICY "downloads_no_update" ON storage.objects
  FOR UPDATE TO authenticated, anon
  USING (bucket_id = 'downloads' AND false);

CREATE POLICY "downloads_no_delete" ON storage.objects
  FOR DELETE TO authenticated, anon
  USING (bucket_id = 'downloads' AND false);