CREATE OR REPLACE FUNCTION public.enforce_employee_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  -- Employees may freely update their own basic profile info (mobile, photo,
  -- department, centre, shift, team leader, manager, joining date, designation).
  -- Identity / security fields remain locked to admins.
  IF NEW.role_id IS DISTINCT FROM OLD.role_id
     OR NEW.employment_status IS DISTINCT FROM OLD.employment_status
     OR NEW.employee_code IS DISTINCT FROM OLD.employee_code
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.full_name IS DISTINCT FROM OLD.full_name
     OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
  THEN
    RAISE EXCEPTION 'You cannot change role, status, employee code, email, name, or auth identity';
  END IF;
  RETURN NEW;
END;
$function$;