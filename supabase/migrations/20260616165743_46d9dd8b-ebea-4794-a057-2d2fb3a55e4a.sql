
-- Restrict client SELECT on sensitive columns and provide guarded RPCs

-- 1) employees: revoke email/mobile from authenticated; keep INSERT/UPDATE grants
REVOKE SELECT (email, mobile) ON public.employees FROM authenticated;

CREATE OR REPLACE FUNCTION public.get_my_contact()
RETURNS TABLE(email text, mobile text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT email, mobile FROM public.employees WHERE auth_user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.get_employee_contact(_id uuid)
RETURNS TABLE(email text, mobile text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.email, e.mobile
  FROM public.employees e
  WHERE e.id = _id
    AND (public.is_admin(auth.uid()) OR e.auth_user_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.admin_list_employee_contacts()
RETURNS TABLE(id uuid, email text, mobile text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, email, mobile FROM public.employees
  WHERE public.is_admin(auth.uid())
$$;

GRANT EXECUTE ON FUNCTION public.get_my_contact() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_employee_contact(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_employee_contacts() TO authenticated;

-- 2) employee_sessions: revoke session_token column from authenticated; add verification RPC
REVOKE SELECT (session_token) ON public.employee_sessions FROM authenticated;

CREATE OR REPLACE FUNCTION public.is_current_session(_token text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT session_token = _token
    FROM public.employee_sessions
    WHERE user_id = auth.uid() AND is_active = true
    ORDER BY created_at DESC
    LIMIT 1
  ), false)
$$;

GRANT EXECUTE ON FUNCTION public.is_current_session(text) TO authenticated;
