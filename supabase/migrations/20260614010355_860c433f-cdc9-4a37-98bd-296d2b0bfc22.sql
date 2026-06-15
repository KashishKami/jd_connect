-- 1) audit_logs: restrict direct INSERTs to admins
DROP POLICY IF EXISTS "audit_insert_self" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_admin_insert"
  ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

-- 2) attendance_corrections: harden review UPDATE policy
DROP POLICY IF EXISTS "corr_review" ON public.attendance_corrections;
CREATE POLICY "corr_review"
  ON public.attendance_corrections FOR UPDATE TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR (public.has_role(auth.uid(),'manager') AND public.can_manage_employee(employee_id))
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR (
      public.has_role(auth.uid(),'manager')
      AND public.can_manage_employee(employee_id)
    )
  );

-- 3) employee_notes: enforce author = current employee
DROP POLICY IF EXISTS "notes_write" ON public.employee_notes;
CREATE POLICY "notes_write"
  ON public.employee_notes FOR ALL TO authenticated
  USING (public.can_view_employee_notes(employee_id))
  WITH CHECK (
    public.can_view_employee_notes(employee_id)
    AND created_by = public.current_employee_id()
  );
