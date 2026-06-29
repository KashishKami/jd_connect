-- Full fix: implement 'unverified' status so employees only appear
-- in the admin approval queue AFTER they have clicked their verification email.
--
-- Flow:
--   1. User signs up → handle_new_user creates employee with approval_status='unverified'
--   2. User clicks "Verify Email" magic link → Supabase confirms email_confirmed_at
--   3. App calls confirm_my_email_and_request_approval() → flips to 'pending'
--   4. Admin sees 'pending' user (email already verified) → approves
--   5. User logs in ✅
--   Never again can an admin approve someone whose email bounced.

-- 1. Extend the check constraint to allow 'unverified'
ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_approval_status_check;

ALTER TABLE public.employees
  ADD CONSTRAINT employees_approval_status_check
  CHECK (approval_status IN ('unverified', 'pending', 'approved', 'rejected'));

-- 2. Update handle_new_user: new sign-ups start as 'unverified', not 'pending'
--    (existing admins/first-user stay 'approved' as before)
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_is_first boolean;
  v_role     public.app_role;
  v_role_id  uuid;
  v_full_name text;
  v_approval text;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO v_is_first;
  v_role     := CASE WHEN v_is_first THEN 'super_admin'::public.app_role ELSE 'employee'::public.app_role END;
  -- First user is auto-approved; all others start as 'unverified' until they click the email link
  v_approval := CASE WHEN v_is_first THEN 'approved' ELSE 'unverified' END;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_role) ON CONFLICT DO NOTHING;

  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1));
  SELECT id INTO v_role_id FROM public.roles WHERE key = v_role;

  INSERT INTO public.employees (auth_user_id, full_name, email, role_id, employment_status, approval_status)
  VALUES (NEW.id, v_full_name, NEW.email, v_role_id, 'active', v_approval)
  ON CONFLICT (email) DO UPDATE SET auth_user_id = EXCLUDED.auth_user_id;

  RETURN NEW;
END;
$function$;

-- 3. New function: called by the app when the user lands back after clicking the email link.
--    It checks that auth.users.email_confirmed_at IS NOT NULL (Supabase confirmed it),
--    then flips the employee's status from 'unverified' → 'pending' so the admin can see them.
CREATE OR REPLACE FUNCTION public.confirm_my_email_and_request_approval()
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid           uuid := auth.uid();
  v_confirmed_at  timestamptz;
  v_current_status text;
BEGIN
  -- Check that Supabase has confirmed the email
  SELECT email_confirmed_at INTO v_confirmed_at
  FROM auth.users
  WHERE id = v_uid;

  IF v_confirmed_at IS NULL THEN
    RETURN 'unverified'; -- email not yet clicked, nothing to do
  END IF;

  -- Get current employee approval status
  SELECT approval_status INTO v_current_status
  FROM public.employees
  WHERE auth_user_id = v_uid;

  IF v_current_status IS NULL THEN
    RETURN 'no_employee'; -- edge case: employee record missing
  END IF;

  -- Flip unverified → pending so admin can see this user in the queue
  IF v_current_status = 'unverified' THEN
    UPDATE public.employees
    SET approval_status = 'pending', updated_at = now()
    WHERE auth_user_id = v_uid;
    RETURN 'pending';
  END IF;

  -- Already pending/approved/rejected — just return current status
  RETURN v_current_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_my_email_and_request_approval() TO authenticated;

-- 4. Update approve_employee to also confirm email in auth.users (safety net)
--    so the Abby situation can never happen even via edge cases.
CREATE OR REPLACE FUNCTION public.approve_employee(_employee_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_auth_user_id uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  UPDATE public.employees
  SET approval_status = 'approved', updated_at = now()
  WHERE id = _employee_id
  RETURNING auth_user_id INTO v_auth_user_id;

  -- Safety net: also confirm email in auth so login can never fail
  IF v_auth_user_id IS NOT NULL THEN
    UPDATE auth.users
    SET
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      updated_at = now()
    WHERE id = v_auth_user_id
      AND email_confirmed_at IS NULL;
  END IF;
END;
$$;

-- 5. Update the route guard: 'unverified' accounts redirect to pending-approval
--    (the pending-approval.tsx page will call confirm_my_email_and_request_approval
--     and handle transitioning from unverified → pending)
--    No SQL change needed — route.tsx already redirects any non-'approved' to /pending-approval.
