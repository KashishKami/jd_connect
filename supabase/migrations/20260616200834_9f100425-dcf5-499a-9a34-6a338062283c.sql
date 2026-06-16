
-- 1) Lock down self-edit of sensitive employee fields.
CREATE OR REPLACE FUNCTION public.enforce_employee_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_self boolean;
  v_can_edit_profile boolean;
  v_can_edit_employment boolean;
  v_can_assign_role boolean;
  v_can_approve boolean;
BEGIN
  IF auth.uid() IS NULL OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  v_is_self := (OLD.auth_user_id = auth.uid());
  v_can_edit_profile := public.has_permission(auth.uid(), 'employees.edit_profile');
  v_can_edit_employment := public.has_permission(auth.uid(), 'employees.edit_employment');
  v_can_assign_role := public.has_permission(auth.uid(), 'employees.assign_role');
  v_can_approve := public.has_permission(auth.uid(), 'employees.approve');

  -- Role changes require assign_role permission.
  IF NEW.role_id IS DISTINCT FROM OLD.role_id AND NOT v_can_assign_role THEN
    RAISE EXCEPTION 'You do not have permission to change role';
  END IF;

  -- Approval status requires the approve permission.
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status AND NOT v_can_approve THEN
    RAISE EXCEPTION 'You do not have permission to change approval status';
  END IF;

  -- Employment status / auth identity / org placement require edit_employment.
  IF (NEW.employment_status IS DISTINCT FROM OLD.employment_status
      OR NEW.auth_user_id  IS DISTINCT FROM OLD.auth_user_id
      OR NEW.manager_id    IS DISTINCT FROM OLD.manager_id
      OR NEW.team_leader_id IS DISTINCT FROM OLD.team_leader_id
      OR NEW.department_id IS DISTINCT FROM OLD.department_id
      OR NEW.centre_id     IS DISTINCT FROM OLD.centre_id
      OR NEW.shift_id      IS DISTINCT FROM OLD.shift_id
      OR NEW.joining_date  IS DISTINCT FROM OLD.joining_date)
     AND NOT v_can_edit_employment THEN
    -- Allow employees to complete their profile once via complete_self_profile().
    -- That function bypasses this trigger by virtue of running as SECURITY DEFINER
    -- when invoked, so direct UPDATEs are still blocked here.
    RAISE EXCEPTION 'You do not have permission to change employment / org assignment fields';
  END IF;

  -- Identity fields require edit_profile or edit_employment.
  IF (NEW.employee_code IS DISTINCT FROM OLD.employee_code
      OR NEW.email IS DISTINCT FROM OLD.email
      OR NEW.full_name IS DISTINCT FROM OLD.full_name)
     AND NOT (v_can_edit_profile OR v_can_edit_employment) THEN
    RAISE EXCEPTION 'You do not have permission to change employee code, email, or name';
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) Prevent spoofed channel join requests.
DROP POLICY IF EXISTS cjr_insert_admin ON public.channel_join_requests;
CREATE POLICY cjr_insert_admin ON public.channel_join_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin(auth.uid())
    OR employee_id = public.current_employee_id()
  );
