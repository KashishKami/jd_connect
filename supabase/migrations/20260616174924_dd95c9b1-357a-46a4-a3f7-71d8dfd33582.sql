
-- Seed roles row for HR
INSERT INTO public.roles (key, name, description)
VALUES ('hr'::public.app_role, 'HR', 'Human Resources — full access to attendance and break data')
ON CONFLICT (key) DO NOTHING;

-- Helper
CREATE OR REPLACE FUNCTION public.is_hr(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'hr'::public.app_role)
$$;

REVOKE ALL ON FUNCTION public.is_hr(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_hr(uuid) TO authenticated, service_role;

-- attendance_records
DROP POLICY IF EXISTS att_select ON public.attendance_records;
CREATE POLICY att_select ON public.attendance_records
FOR SELECT TO authenticated
USING (employee_id = current_employee_id() OR can_manage_employee(employee_id) OR is_hr(auth.uid()));

DROP POLICY IF EXISTS att_update_self ON public.attendance_records;
CREATE POLICY att_update_self ON public.attendance_records
FOR UPDATE TO authenticated
USING (employee_id = current_employee_id() OR is_admin(auth.uid()) OR is_hr(auth.uid()))
WITH CHECK (employee_id = current_employee_id() OR is_admin(auth.uid()) OR is_hr(auth.uid()));

DROP POLICY IF EXISTS att_insert_self ON public.attendance_records;
CREATE POLICY att_insert_self ON public.attendance_records
FOR INSERT TO authenticated
WITH CHECK (employee_id = current_employee_id() OR is_admin(auth.uid()) OR is_hr(auth.uid()));

-- attendance_corrections
DROP POLICY IF EXISTS corr_select ON public.attendance_corrections;
CREATE POLICY corr_select ON public.attendance_corrections
FOR SELECT TO authenticated
USING (employee_id = current_employee_id() OR requested_by = current_employee_id() OR can_manage_employee(employee_id) OR is_hr(auth.uid()));

DROP POLICY IF EXISTS corr_review ON public.attendance_corrections;
CREATE POLICY corr_review ON public.attendance_corrections
FOR UPDATE TO authenticated
USING (is_admin(auth.uid()) OR is_hr(auth.uid()) OR (has_role(auth.uid(),'manager'::app_role) AND can_manage_employee(employee_id)))
WITH CHECK (is_admin(auth.uid()) OR is_hr(auth.uid()) OR (has_role(auth.uid(),'manager'::app_role) AND can_manage_employee(employee_id)));

-- attendance_audit_logs
DROP POLICY IF EXISTS att_audit_select ON public.attendance_audit_logs;
CREATE POLICY att_audit_select ON public.attendance_audit_logs
FOR SELECT TO authenticated
USING (is_admin(auth.uid()) OR is_hr(auth.uid()) OR can_manage_employee(employee_id) OR employee_id = current_employee_id());

-- break_records
DROP POLICY IF EXISTS "break_records self read" ON public.break_records;
CREATE POLICY "break_records self read" ON public.break_records
FOR SELECT TO authenticated
USING (employee_id = current_employee_id() OR can_manage_employee(employee_id) OR is_hr(auth.uid()));

DROP POLICY IF EXISTS "break_records self insert" ON public.break_records;
CREATE POLICY "break_records self insert" ON public.break_records
FOR INSERT TO authenticated
WITH CHECK (employee_id = current_employee_id() OR can_manage_employee(employee_id) OR is_hr(auth.uid()));

DROP POLICY IF EXISTS "break_records self update" ON public.break_records;
CREATE POLICY "break_records self update" ON public.break_records
FOR UPDATE TO authenticated
USING (employee_id = current_employee_id() OR can_manage_employee(employee_id) OR is_hr(auth.uid()))
WITH CHECK (employee_id = current_employee_id() OR can_manage_employee(employee_id) OR is_hr(auth.uid()));

-- break_requests
DROP POLICY IF EXISTS "break_requests read" ON public.break_requests;
CREATE POLICY "break_requests read" ON public.break_requests
FOR SELECT TO authenticated
USING (employee_id = current_employee_id() OR can_manage_employee(employee_id) OR is_hr(auth.uid()));

DROP POLICY IF EXISTS "break_requests reviewer update" ON public.break_requests;
CREATE POLICY "break_requests reviewer update" ON public.break_requests
FOR UPDATE TO authenticated
USING (can_manage_employee(employee_id) OR employee_id = current_employee_id() OR is_hr(auth.uid()))
WITH CHECK (can_manage_employee(employee_id) OR employee_id = current_employee_id() OR is_hr(auth.uid()));

-- break_audit_logs
DROP POLICY IF EXISTS "break_audit_logs read" ON public.break_audit_logs;
CREATE POLICY "break_audit_logs read" ON public.break_audit_logs
FOR SELECT TO authenticated
USING (is_admin(auth.uid()) OR is_hr(auth.uid()) OR can_manage_employee(employee_id) OR employee_id = current_employee_id());
