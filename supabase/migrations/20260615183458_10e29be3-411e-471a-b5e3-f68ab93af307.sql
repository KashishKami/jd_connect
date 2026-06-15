
-- Harden access-helper functions: require the caller to be an approved, active employee
-- before management hierarchy grants any read/write access to other employees' data.

CREATE OR REPLACE FUNCTION public.can_view_employee_notes(_employee_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.employees e, public.employees me
      WHERE e.id = _employee_id
        AND me.auth_user_id = auth.uid()
        AND me.approval_status = 'approved'
        AND me.employment_status = 'active'
        AND (
          (public.has_role(auth.uid(),'manager') AND e.manager_id = me.id)
          OR (public.has_role(auth.uid(),'team_leader') AND e.team_leader_id = me.id)
        )
    )
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_employee(_employee_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.employees e, public.employees me
    WHERE e.id = _employee_id
      AND me.auth_user_id = auth.uid()
      AND me.approval_status = 'approved'
      AND me.employment_status = 'active'
      AND (
        (public.has_role(auth.uid(),'manager') AND e.manager_id = me.id)
        OR (public.has_role(auth.uid(),'team_leader') AND e.team_leader_id = me.id)
      )
  )
$function$;

CREATE OR REPLACE FUNCTION public.can_view_sales_for(_employee_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _employee_id = public.current_employee_id()
    OR public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.employees e, public.employees me
      WHERE e.id = _employee_id
        AND me.auth_user_id = auth.uid()
        AND me.approval_status = 'approved'
        AND me.employment_status = 'active'
        AND (
          (public.has_role(auth.uid(),'manager') AND e.manager_id = me.id)
          OR (public.has_role(auth.uid(),'team_leader') AND e.team_leader_id = me.id)
        )
    )
$function$;

CREATE OR REPLACE FUNCTION public.can_enter_sales_for(_employee_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.employees e, public.employees me
      WHERE e.id = _employee_id
        AND me.auth_user_id = auth.uid()
        AND me.approval_status = 'approved'
        AND me.employment_status = 'active'
        AND (
          (public.has_role(auth.uid(),'manager') AND e.manager_id = me.id)
          OR (public.has_role(auth.uid(),'team_leader') AND e.team_leader_id = me.id)
        )
    )
$function$;
