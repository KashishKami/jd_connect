
-- Replace admin-only employees policies with policies that also honor granular permissions.
DROP POLICY IF EXISTS emp_admin_insert ON public.employees;
DROP POLICY IF EXISTS emp_admin_update ON public.employees;
DROP POLICY IF EXISTS emp_admin_delete ON public.employees;

CREATE POLICY emp_admin_insert ON public.employees
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'employees.create')
  );

CREATE POLICY emp_admin_update ON public.employees
  FOR UPDATE TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'employees.edit_profile')
    OR public.has_permission(auth.uid(), 'employees.edit_employment')
    OR public.has_permission(auth.uid(), 'employees.approve')
    OR public.has_permission(auth.uid(), 'employees.assign_role')
    OR auth_user_id = auth.uid()
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'employees.edit_profile')
    OR public.has_permission(auth.uid(), 'employees.edit_employment')
    OR public.has_permission(auth.uid(), 'employees.approve')
    OR public.has_permission(auth.uid(), 'employees.assign_role')
    OR auth_user_id = auth.uid()
  );

CREATE POLICY emp_admin_delete ON public.employees
  FOR DELETE TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'employees.delete')
  );

-- Broaden SELECT so anyone with employees.view (HR etc.) can read employee rows.
DROP POLICY IF EXISTS emp_select ON public.employees;
CREATE POLICY emp_select ON public.employees
  FOR SELECT TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'employees.view')
    OR public.can_view_employee_notes(id)
  );

-- Update self-edit guard so permission holders can change identity/employment fields.
CREATE OR REPLACE FUNCTION public.enforce_employee_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_can_edit_profile boolean;
  v_can_edit_employment boolean;
  v_can_assign_role boolean;
BEGIN
  IF auth.uid() IS NULL OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  v_can_edit_profile := public.has_permission(auth.uid(), 'employees.edit_profile');
  v_can_edit_employment := public.has_permission(auth.uid(), 'employees.edit_employment');
  v_can_assign_role := public.has_permission(auth.uid(), 'employees.assign_role');

  -- Role changes require assign_role permission.
  IF NEW.role_id IS DISTINCT FROM OLD.role_id AND NOT v_can_assign_role THEN
    RAISE EXCEPTION 'You do not have permission to change role';
  END IF;

  -- Employment status / auth identity require edit_employment.
  IF (NEW.employment_status IS DISTINCT FROM OLD.employment_status
      OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id)
     AND NOT v_can_edit_employment THEN
    RAISE EXCEPTION 'You do not have permission to change employment status or identity';
  END IF;

  -- Employee code / email / full_name require edit_profile (or edit_employment).
  IF (NEW.employee_code IS DISTINCT FROM OLD.employee_code
      OR NEW.email IS DISTINCT FROM OLD.email
      OR NEW.full_name IS DISTINCT FROM OLD.full_name)
     AND NOT (v_can_edit_profile OR v_can_edit_employment) THEN
    RAISE EXCEPTION 'You do not have permission to change employee code, email, or name';
  END IF;

  RETURN NEW;
END;
$function$;
