
-- Tighten employee-notes storage policies to mirror table-level ownership checks.
-- Path layout: {employee_id}/{note_id}/{filename}

DROP POLICY IF EXISTS note_files_write ON storage.objects;
DROP POLICY IF EXISTS note_files_delete ON storage.objects;
DROP POLICY IF EXISTS employee_notes_update ON storage.objects;

-- INSERT: only the note's author (or admin) can upload files into that note's folder
CREATE POLICY note_files_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'employee-notes'
    AND can_view_employee_notes(((storage.foldername(name))[1])::uuid)
    AND (
      public.is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.employee_notes n
        WHERE n.id = ((storage.foldername(name))[2])::uuid
          AND n.created_by = public.current_employee_id()
      )
    )
  );

-- UPDATE: uploader (storage.objects.owner), note author, or admin
CREATE POLICY employee_notes_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'employee-notes'
    AND (
      public.is_admin(auth.uid())
      OR owner = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.employee_notes n
        WHERE n.id = ((storage.foldername(name))[2])::uuid
          AND n.created_by = public.current_employee_id()
      )
    )
  )
  WITH CHECK (
    bucket_id = 'employee-notes'
    AND (
      public.is_admin(auth.uid())
      OR owner = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.employee_notes n
        WHERE n.id = ((storage.foldername(name))[2])::uuid
          AND n.created_by = public.current_employee_id()
      )
    )
  );

-- DELETE: uploader, note author, or admin
CREATE POLICY note_files_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'employee-notes'
    AND (
      public.is_admin(auth.uid())
      OR owner = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.employee_notes n
        WHERE n.id = ((storage.foldername(name))[2])::uuid
          AND n.created_by = public.current_employee_id()
      )
    )
  );
