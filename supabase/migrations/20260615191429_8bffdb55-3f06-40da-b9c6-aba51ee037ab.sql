
-- 1) Expand update_self_profile to allow more fields
CREATE OR REPLACE FUNCTION public.update_self_profile(
  _profile_photo_url text DEFAULT NULL,
  _mobile text DEFAULT NULL,
  _alias_name text DEFAULT NULL,
  _department_id uuid DEFAULT NULL,
  _centre_id uuid DEFAULT NULL,
  _shift_id uuid DEFAULT NULL,
  _team_leader_id uuid DEFAULT NULL,
  _manager_id uuid DEFAULT NULL,
  _joining_date date DEFAULT NULL
)
RETURNS public.employees
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.employees;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  UPDATE public.employees
     SET profile_photo_url = COALESCE(_profile_photo_url, profile_photo_url),
         mobile            = COALESCE(NULLIF(btrim(_mobile), ''), mobile),
         alias_name        = COALESCE(NULLIF(btrim(_alias_name), ''), alias_name),
         department_id     = COALESCE(_department_id, department_id),
         centre_id         = COALESCE(_centre_id, centre_id),
         shift_id          = COALESCE(_shift_id, shift_id),
         team_leader_id    = COALESCE(_team_leader_id, team_leader_id),
         manager_id        = COALESCE(_manager_id, manager_id),
         joining_date      = COALESCE(_joining_date, joining_date),
         updated_at        = now()
   WHERE auth_user_id = auth.uid()
  RETURNING * INTO _row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no employee record for current user' USING ERRCODE = 'P0002';
  END IF;
  RETURN _row;
END;
$function$;

-- 2) Public directory profile RPC: safe fields any approved+active employee can view
CREATE OR REPLACE FUNCTION public.get_employee_public_profile(_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  alias_name text,
  employee_code text,
  designation text,
  profile_photo_url text,
  employment_status text,
  joining_date date,
  department_name text,
  centre_name text,
  role_name text,
  shift_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT e.id,
         e.full_name,
         e.alias_name,
         e.employee_code,
         e.designation,
         e.profile_photo_url,
         e.employment_status::text,
         e.joining_date,
         d.name,
         c.name,
         r.name,
         s.name
    FROM public.employees e
    LEFT JOIN public.departments d ON d.id = e.department_id
    LEFT JOIN public.centres     c ON c.id = e.centre_id
    LEFT JOIN public.roles       r ON r.id = e.role_id
    LEFT JOIN public.shifts      s ON s.id = e.shift_id
   WHERE e.id = _id
     AND e.approval_status = 'approved'
     AND EXISTS (
       SELECT 1 FROM public.employees me
        WHERE me.auth_user_id = auth.uid()
          AND me.approval_status = 'approved'
          AND me.employment_status = 'active'
     );
$function$;

GRANT EXECUTE ON FUNCTION public.get_employee_public_profile(uuid) TO authenticated;
