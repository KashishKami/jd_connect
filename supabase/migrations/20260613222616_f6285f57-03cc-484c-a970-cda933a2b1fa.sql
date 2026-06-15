
-- profile-photos: all authenticated read, admin write
CREATE POLICY "profile_photos_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'profile-photos');
CREATE POLICY "profile_photos_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'profile-photos' AND public.is_admin(auth.uid()));
CREATE POLICY "profile_photos_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'profile-photos' AND public.is_admin(auth.uid()));
CREATE POLICY "profile_photos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'profile-photos' AND public.is_admin(auth.uid()));

-- employee-notes: gated by note visibility. Path convention: <employee_id>/<note_id>/<filename>
CREATE POLICY "note_files_read" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'employee-notes'
    AND public.can_view_employee_notes(((storage.foldername(name))[1])::uuid)
  );
CREATE POLICY "note_files_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'employee-notes'
    AND public.can_view_employee_notes(((storage.foldername(name))[1])::uuid)
  );
CREATE POLICY "note_files_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'employee-notes'
    AND public.can_view_employee_notes(((storage.foldername(name))[1])::uuid)
  );
