CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_is_first boolean; v_role public.app_role; v_role_id uuid; v_full_name text; v_alias_name text; v_approval text;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO v_is_first;
  v_role := CASE WHEN v_is_first THEN 'super_admin'::public.app_role ELSE 'employee'::public.app_role END;
  v_approval := CASE WHEN v_is_first THEN 'approved' ELSE 'pending' END;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_role) ON CONFLICT DO NOTHING;
  v_full_name := COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''), split_part(NEW.email,'@',1));
  v_alias_name := NULLIF(trim(NEW.raw_user_meta_data->>'alias_name'), '');
  SELECT id INTO v_role_id FROM public.roles WHERE key = v_role;
  INSERT INTO public.employees (auth_user_id, full_name, alias_name, email, role_id, employment_status, approval_status)
  VALUES (NEW.id, v_full_name, v_alias_name, NEW.email, v_role_id, 'active', v_approval)
  ON CONFLICT (email) DO UPDATE SET
    auth_user_id = EXCLUDED.auth_user_id,
    alias_name = COALESCE(public.employees.alias_name, EXCLUDED.alias_name);
  RETURN NEW;
END;
$function$;