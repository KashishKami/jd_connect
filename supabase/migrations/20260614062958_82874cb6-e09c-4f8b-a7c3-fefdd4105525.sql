CREATE POLICY "documents_update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'documents' AND public.can_manage_document(((string_to_array(name, '/'))[1])::uuid))
WITH CHECK (bucket_id = 'documents' AND public.can_manage_document(((string_to_array(name, '/'))[1])::uuid));

CREATE POLICY "employee_notes_update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'employee-notes' AND public.can_view_employee_notes(((storage.foldername(name))[1])::uuid))
WITH CHECK (bucket_id = 'employee-notes' AND public.can_view_employee_notes(((storage.foldername(name))[1])::uuid));