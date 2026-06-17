
-- Allow the complete_self_profile RPC to bypass the self-edit guard trigger via a session flag.
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
  v_bypass text;
BEGIN
  IF auth.uid() IS NULL OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Allow trusted SECURITY DEFINER routines (e.g. complete_self_profile) to bypass.
  BEGIN
    v_bypass := current_setting('app.bypass_employee_guard', true);
  EXCEPTION WHEN OTHERS THEN
    v_bypass := NULL;
  END;
  IF v_bypass = 'on' THEN
    RETURN NEW;
  END IF;

  v_is_self := (OLD.auth_user_id = auth.uid());
  v_can_edit_profile := public.has_permission(auth.uid(), 'employees.edit_profile');
  v_can_edit_employment := public.has_permission(auth.uid(), 'employees.edit_employment');
  v_can_assign_role := public.has_permission(auth.uid(), 'employees.assign_role');
  v_can_approve := public.has_permission(auth.uid(), 'employees.approve');

  IF NEW.role_id IS DISTINCT FROM OLD.role_id AND NOT v_can_assign_role THEN
    RAISE EXCEPTION 'You do not have permission to change role';
  END IF;

  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status AND NOT v_can_approve THEN
    RAISE EXCEPTION 'You do not have permission to change approval status';
  END IF;

  IF (NEW.employment_status IS DISTINCT FROM OLD.employment_status
      OR NEW.auth_user_id  IS DISTINCT FROM OLD.auth_user_id
      OR NEW.manager_id    IS DISTINCT FROM OLD.manager_id
      OR NEW.team_leader_id IS DISTINCT FROM OLD.team_leader_id
      OR NEW.department_id IS DISTINCT FROM OLD.department_id
      OR NEW.centre_id     IS DISTINCT FROM OLD.centre_id
      OR NEW.shift_id      IS DISTINCT FROM OLD.shift_id
      OR NEW.joining_date  IS DISTINCT FROM OLD.joining_date)
     AND NOT v_can_edit_employment THEN
    RAISE EXCEPTION 'You do not have permission to change employment / org assignment fields';
  END IF;

  IF (NEW.employee_code IS DISTINCT FROM OLD.employee_code
      OR NEW.email IS DISTINCT FROM OLD.email
      OR NEW.full_name IS DISTINCT FROM OLD.full_name)
     AND NOT (v_can_edit_profile OR v_can_edit_employment) THEN
    RAISE EXCEPTION 'You do not have permission to change employee code, email, or name';
  END IF;

  RETURN NEW;
END;
$function$;

-- Update the RPC to set the bypass flag for its own update statement only.
CREATE OR REPLACE FUNCTION public.complete_self_profile(
  _mobile text,
  _department_id uuid,
  _centre_id uuid,
  _shift_id uuid,
  _team_leader_id uuid,
  _manager_id uuid,
  _joining_date date
)
RETURNS public.employees
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.employees;
  _me  public.employees;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _me FROM public.employees WHERE auth_user_id = auth.uid() LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no employee record for current user' USING ERRCODE = 'P0002';
  END IF;

  IF _me.profile_completed THEN
    RAISE EXCEPTION 'profile already completed' USING ERRCODE = '42501';
  END IF;

  IF _mobile IS NULL OR length(btrim(_mobile)) < 6 OR length(_mobile) > 20 THEN
    RAISE EXCEPTION 'mobile is required' USING ERRCODE = '22023';
  END IF;
  IF _department_id IS NULL OR _centre_id IS NULL OR _shift_id IS NULL OR _joining_date IS NULL THEN
    RAISE EXCEPTION 'department, centre, shift and joining date are required' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.bypass_employee_guard', 'on', true);

  UPDATE public.employees
     SET mobile           = btrim(_mobile),
         department_id    = _department_id,
         centre_id        = _centre_id,
         shift_id         = _shift_id,
         team_leader_id   = _team_leader_id,
         manager_id       = _manager_id,
         joining_date     = _joining_date,
         profile_completed= true,
         updated_at       = now()
   WHERE id = _me.id
  RETURNING * INTO _row;

  PERFORM set_config('app.bypass_employee_guard', 'off', true);

  RETURN _row;
END;
$$;
