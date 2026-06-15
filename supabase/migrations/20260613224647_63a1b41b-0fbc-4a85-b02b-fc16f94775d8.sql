
-- 1. Fix set_updated_at search_path
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- 2. Restrict employees SELECT policy (no more "true")
DROP POLICY IF EXISTS emp_select ON public.employees;
CREATE POLICY emp_select ON public.employees
  FOR SELECT TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.can_view_employee_notes(id)
  );

-- 3. Split employees UPDATE: admins full update; self-update only safe fields enforced by trigger
DROP POLICY IF EXISTS emp_admin_update ON public.employees;
CREATE POLICY emp_admin_update ON public.employees
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY emp_self_update ON public.employees
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- Trigger to restrict columns that a non-admin self-update can change
CREATE OR REPLACE FUNCTION public.enforce_employee_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  -- Non-admin: only profile_photo_url and mobile may change
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

DROP TRIGGER IF EXISTS trg_enforce_employee_self_update ON public.employees;
CREATE TRIGGER trg_enforce_employee_self_update
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.enforce_employee_self_update();

-- 4. Safe directory RPC — exposes only non-PII fields to all authenticated users
CREATE OR REPLACE FUNCTION public.search_employee_directory(
  _q text DEFAULT NULL,
  _department_id uuid DEFAULT NULL,
  _centre_id uuid DEFAULT NULL,
  _role_id uuid DEFAULT NULL,
  _status public.employment_status DEFAULT NULL,
  _limit int DEFAULT 500
)
RETURNS TABLE (
  id uuid,
  employee_code text,
  full_name text,
  designation text,
  employment_status public.employment_status,
  profile_photo_url text,
  department_id uuid,
  department_name text,
  centre_id uuid,
  centre_code text,
  role_id uuid,
  role_name text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    e.id, e.employee_code, e.full_name, e.designation, e.employment_status,
    e.profile_photo_url,
    e.department_id, d.name AS department_name,
    e.centre_id, c.code AS centre_code,
    e.role_id, r.name AS role_name
  FROM public.employees e
  LEFT JOIN public.departments d ON d.id = e.department_id
  LEFT JOIN public.centres c ON c.id = e.centre_id
  LEFT JOIN public.roles r ON r.id = e.role_id
  WHERE (_department_id IS NULL OR e.department_id = _department_id)
    AND (_centre_id IS NULL OR e.centre_id = _centre_id)
    AND (_role_id IS NULL OR e.role_id = _role_id)
    AND (_status IS NULL OR e.employment_status = _status)
    AND (
      _q IS NULL OR _q = '' OR
      e.full_name ILIKE '%'||_q||'%' OR
      e.employee_code ILIKE '%'||_q||'%' OR
      COALESCE(e.designation,'') ILIKE '%'||_q||'%'
    )
  ORDER BY e.employee_code
  LIMIT GREATEST(1, LEAST(_limit, 1000));
$$;

-- 5. Lock down SECURITY DEFINER helper EXECUTE privileges
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_employee_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_view_employee_notes(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_employee_self_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- email_for_employee_code is intentionally callable pre-auth for login
REVOKE ALL ON FUNCTION public.email_for_employee_code(text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.email_for_employee_code(text) TO anon;

-- Directory RPC is callable by signed-in users only
GRANT EXECUTE ON FUNCTION public.search_employee_directory(text, uuid, uuid, uuid, public.employment_status, int) TO authenticated;
