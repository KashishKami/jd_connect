CREATE OR REPLACE FUNCTION public.enforce_employee_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Service-role / server-side admin context has no auth.uid(); allow.
  IF auth.uid() IS NULL OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.role_id IS DISTINCT FROM OLD.role_id
     OR NEW.department_id IS DISTINCT FROM OLD.department_id
     OR NEW.centre_id IS DISTINCT FROM OLD.centre_id
     OR NEW.shift_id IS DISTINCT FROM OLD.shift_id
     OR NEW.manager_id IS DISTINCT FROM OLD.manager_id
     OR NEW.team_leader_id IS DISTINCT FROM OLD.team_leader_id
     OR NEW.employment_status IS DISTINCT FROM OLD.employment_status
     OR NEW.employee_code IS DISTINCT FROM OLD.employee_code
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.full_name IS DISTINCT FROM OLD.full_name
     OR NEW.designation IS DISTINCT FROM OLD.designation
     OR NEW.joining_date IS DISTINCT FROM OLD.joining_date
     OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
  THEN
    RAISE EXCEPTION 'You may only update your profile photo and mobile number';
  END IF;
  RETURN NEW;
END;
$$;