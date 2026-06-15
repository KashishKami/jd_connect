
-- employee_notes: split write into INSERT/UPDATE/DELETE with authorship check
DROP POLICY IF EXISTS notes_write ON public.employee_notes;

CREATE POLICY notes_insert ON public.employee_notes
  FOR INSERT TO authenticated
  WITH CHECK (can_view_employee_notes(employee_id) AND created_by = current_employee_id());

CREATE POLICY notes_update ON public.employee_notes
  FOR UPDATE TO authenticated
  USING (created_by = current_employee_id() OR is_admin(auth.uid()))
  WITH CHECK (created_by = current_employee_id() OR is_admin(auth.uid()));

CREATE POLICY notes_delete ON public.employee_notes
  FOR DELETE TO authenticated
  USING (created_by = current_employee_id() OR is_admin(auth.uid()));

-- employee_note_attachments: split similarly, gate UPDATE/DELETE by uploader/note-author/admin
DROP POLICY IF EXISTS note_att_write ON public.employee_note_attachments;

CREATE POLICY note_att_insert ON public.employee_note_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employee_notes n
      WHERE n.id = note_id
        AND can_view_employee_notes(n.employee_id)
        AND (n.created_by = current_employee_id() OR is_admin(auth.uid()))
    )
    AND uploaded_by = current_employee_id()
  );

CREATE POLICY note_att_update ON public.employee_note_attachments
  FOR UPDATE TO authenticated
  USING (
    uploaded_by = current_employee_id()
    OR is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.employee_notes n
      WHERE n.id = note_id AND n.created_by = current_employee_id()
    )
  )
  WITH CHECK (
    uploaded_by = current_employee_id()
    OR is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.employee_notes n
      WHERE n.id = note_id AND n.created_by = current_employee_id()
    )
  );

CREATE POLICY note_att_delete ON public.employee_note_attachments
  FOR DELETE TO authenticated
  USING (
    uploaded_by = current_employee_id()
    OR is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.employee_notes n
      WHERE n.id = note_id AND n.created_by = current_employee_id()
    )
  );
