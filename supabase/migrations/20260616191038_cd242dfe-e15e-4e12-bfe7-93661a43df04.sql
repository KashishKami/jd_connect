CREATE OR REPLACE FUNCTION public.search_employee_directory(_q text DEFAULT NULL::text, _department_id uuid DEFAULT NULL::uuid, _centre_id uuid DEFAULT NULL::uuid, _role_id uuid DEFAULT NULL::uuid, _status employment_status DEFAULT NULL::employment_status, _limit integer DEFAULT 500)
 RETURNS TABLE(id uuid, employee_code text, full_name text, designation text, employment_status employment_status, profile_photo_url text, department_id uuid, department_name text, centre_id uuid, centre_code text, role_id uuid, role_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT (public.is_admin(auth.uid()) OR public.has_permission(auth.uid(), 'employees.view')) THEN
    RAISE EXCEPTION 'forbidden: missing employees.view permission' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT e.id, e.employee_code, COALESCE(NULLIF(e.alias_name,''), e.full_name), e.designation, e.employment_status,
    e.profile_photo_url, e.department_id, d.name, e.centre_id, c.code, e.role_id, r.name
  FROM public.employees e
  LEFT JOIN public.departments d ON d.id = e.department_id
  LEFT JOIN public.centres c ON c.id = e.centre_id
  LEFT JOIN public.roles r ON r.id = e.role_id
  WHERE (_department_id IS NULL OR e.department_id = _department_id)
    AND (_centre_id IS NULL OR e.centre_id = _centre_id)
    AND (_role_id IS NULL OR e.role_id = _role_id)
    AND (_status IS NULL OR e.employment_status = _status)
    AND (_q IS NULL OR _q = '' OR e.full_name ILIKE '%'||_q||'%' OR COALESCE(e.alias_name,'') ILIKE '%'||_q||'%' OR e.employee_code ILIKE '%'||_q||'%' OR COALESCE(e.designation,'') ILIKE '%'||_q||'%')
  ORDER BY e.employee_code
  LIMIT GREATEST(1, LEAST(_limit, 1000));
END
$function$;