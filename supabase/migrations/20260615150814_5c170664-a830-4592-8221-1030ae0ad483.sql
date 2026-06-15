
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending'
  CHECK (approval_status IN ('pending','approved','rejected'));

UPDATE public.employees e SET approval_status = 'approved'
WHERE approval_status = 'pending'
  AND (
    e.employment_status = 'active'
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = e.auth_user_id AND ur.role IN ('super_admin','admin'))
  );

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_is_first boolean; v_role public.app_role; v_role_id uuid; v_full_name text; v_approval text;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO v_is_first;
  v_role := CASE WHEN v_is_first THEN 'super_admin'::public.app_role ELSE 'employee'::public.app_role END;
  v_approval := CASE WHEN v_is_first THEN 'approved' ELSE 'pending' END;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_role) ON CONFLICT DO NOTHING;
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1));
  SELECT id INTO v_role_id FROM public.roles WHERE key = v_role;
  INSERT INTO public.employees (auth_user_id, full_name, email, role_id, employment_status, approval_status)
  VALUES (NEW.id, v_full_name, NEW.email, v_role_id, 'active', v_approval)
  ON CONFLICT (email) DO UPDATE SET auth_user_id = EXCLUDED.auth_user_id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_employee(_employee_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  UPDATE public.employees SET approval_status='approved', updated_at=now() WHERE id=_employee_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_employee(_employee_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  UPDATE public.employees SET approval_status='rejected', updated_at=now() WHERE id=_employee_id;
END;
$$;

DROP POLICY IF EXISTS "Users can read own approval" ON public.employees;
CREATE POLICY "Users can read own approval"
ON public.employees FOR SELECT TO authenticated
USING (auth_user_id = auth.uid());

GRANT EXECUTE ON FUNCTION public.approve_employee(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_employee(uuid) TO authenticated;
