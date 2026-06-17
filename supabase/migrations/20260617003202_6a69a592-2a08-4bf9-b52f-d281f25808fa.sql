DROP FUNCTION IF EXISTS public.update_self_profile(text, text);
DROP FUNCTION IF EXISTS public.update_self_profile(text, text, text, uuid, uuid, uuid, uuid, uuid, date);

CREATE OR REPLACE FUNCTION public.update_self_profile(
  _profile_photo_url text DEFAULT NULL,
  _mobile text DEFAULT NULL,
  _alias_name text DEFAULT NULL,
  _department_id uuid DEFAULT NULL,
  _centre_id uuid DEFAULT NULL,
  _shift_id uuid DEFAULT NULL,
  _team_leader_id uuid DEFAULT NULL,
  _manager_id uuid DEFAULT NULL,
  _joining_date date DEFAULT NULL,
  _designation text DEFAULT NULL
)
RETURNS public.employees
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.employees;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  UPDATE public.employees
     SET profile_photo_url = COALESCE(_profile_photo_url, profile_photo_url),
         mobile            = COALESCE(_mobile, mobile),
         alias_name        = COALESCE(_alias_name, alias_name),
         department_id     = COALESCE(_department_id, department_id),
         centre_id         = COALESCE(_centre_id, centre_id),
         shift_id          = COALESCE(_shift_id, shift_id),
         team_leader_id    = COALESCE(_team_leader_id, team_leader_id),
         manager_id        = COALESCE(_manager_id, manager_id),
         joining_date      = COALESCE(_joining_date, joining_date),
         designation       = COALESCE(NULLIF(btrim(_designation), ''), designation),
         updated_at        = now()
   WHERE auth_user_id = auth.uid()
  RETURNING * INTO _row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no employee record for current user' USING ERRCODE = 'P0002';
  END IF;
  RETURN _row;
END;
$$;