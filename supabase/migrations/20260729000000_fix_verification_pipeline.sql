-- Migration: Simplify Auth Pipeline (Remove Email Verification Requirement)
-- All new signups immediately enter 'pending' status for Super Admin approval.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_is_first boolean;
  v_role     public.app_role;
  v_role_id  uuid;
  v_full_name text;
  v_approval text;
  v_emp_id   uuid;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO v_is_first;
  v_role     := CASE WHEN v_is_first THEN 'super_admin'::public.app_role ELSE 'employee'::public.app_role END;
  -- First user is auto-approved; all others start directly as 'pending' for admin approval
  v_approval := CASE WHEN v_is_first THEN 'approved' ELSE 'pending' END;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_role) ON CONFLICT DO NOTHING;

  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1));
  SELECT id INTO v_role_id FROM public.roles WHERE key = v_role;

  -- Check if an employee record already exists with matching email (case-insensitive)
  SELECT id INTO v_emp_id FROM public.employees WHERE LOWER(email) = LOWER(NEW.email) LIMIT 1;

  IF v_emp_id IS NOT NULL THEN
    UPDATE public.employees
    SET auth_user_id = NEW.id,
        role_id = COALESCE(role_id, v_role_id),
        approval_status = CASE WHEN v_is_first THEN 'approved' ELSE 'pending' END,
        employment_status = 'active',
        updated_at = now()
    WHERE id = v_emp_id;
  ELSE
    INSERT INTO public.employees (auth_user_id, full_name, email, role_id, employment_status, approval_status)
    VALUES (NEW.id, v_full_name, LOWER(NEW.email), v_role_id, 'active', v_approval);
  END IF;

  RETURN NEW;
END;
$function$;

-- Transition any unverified employees to pending so admins see them immediately
UPDATE public.employees SET approval_status = 'pending' WHERE approval_status = 'unverified';
