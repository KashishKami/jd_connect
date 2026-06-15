-- Add profile_completed flag and a secure RPC to let employees complete their own profile once.
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS profile_completed boolean NOT NULL DEFAULT false;

-- Existing approved employees with key fields filled are considered complete (avoid re-prompting).
UPDATE public.employees
  SET profile_completed = true
  WHERE profile_completed = false
    AND department_id IS NOT NULL
    AND centre_id IS NOT NULL
    AND shift_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.complete_self_profile(
  _mobile text,
  _department_id uuid,
  _centre_id uuid,
  _shift_id uuid,
  _team_leader_id uuid,
  _manager_id uuid,
  _joining_date date
)
RETURNS public.employees
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.employees;
  _me  public.employees;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _me FROM public.employees WHERE auth_user_id = auth.uid() LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no employee record for current user' USING ERRCODE = 'P0002';
  END IF;

  IF _me.profile_completed THEN
    RAISE EXCEPTION 'profile already completed' USING ERRCODE = '42501';
  END IF;

  -- Basic validation
  IF _mobile IS NULL OR length(btrim(_mobile)) < 6 OR length(_mobile) > 20 THEN
    RAISE EXCEPTION 'mobile is required' USING ERRCODE = '22023';
  END IF;
  IF _department_id IS NULL OR _centre_id IS NULL OR _shift_id IS NULL OR _joining_date IS NULL THEN
    RAISE EXCEPTION 'department, centre, shift and joining date are required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.employees
     SET mobile           = btrim(_mobile),
         department_id    = _department_id,
         centre_id        = _centre_id,
         shift_id         = _shift_id,
         team_leader_id   = _team_leader_id,
         manager_id       = _manager_id,
         joining_date     = _joining_date,
         profile_completed= true,
         updated_at       = now()
   WHERE id = _me.id
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_self_profile(text, uuid, uuid, uuid, uuid, uuid, date) TO authenticated;

-- Allow employees to read the lookup lists they need to fill their profile.
-- Departments, centres, shifts, and roles already permit authenticated SELECT in their existing policies;
-- ensure a minimal SELECT exists on employees so the picker can list TLs/Managers by name+code.
-- (Existing employees SELECT policy already covers this; no change needed.)
