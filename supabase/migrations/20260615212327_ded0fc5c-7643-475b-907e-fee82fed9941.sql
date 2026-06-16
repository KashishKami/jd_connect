CREATE POLICY corr_insert_self ON public.attendance_corrections
  FOR INSERT TO authenticated
  WITH CHECK (
    employee_id = public.current_employee_id()
    AND requested_by = public.current_employee_id()
  );