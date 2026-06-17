
-- Sync function: keeps user_roles aligned with employees.role_id (single source of truth)
CREATE OR REPLACE FUNCTION public.sync_user_role_from_employee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _key text;
  _enum public.app_role;
BEGIN
  IF NEW.auth_user_id IS NULL OR NEW.role_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip if unchanged on UPDATE
  IF TG_OP = 'UPDATE'
     AND OLD.role_id IS NOT DISTINCT FROM NEW.role_id
     AND OLD.auth_user_id IS NOT DISTINCT FROM NEW.auth_user_id THEN
    RETURN NEW;
  END IF;

  SELECT key::text INTO _key FROM public.roles WHERE id = NEW.role_id;

  -- Map to enum if it's a system role key, else placeholder 'employee'
  BEGIN
    _enum := _key::public.app_role;
  EXCEPTION WHEN OTHERS THEN
    _enum := 'employee'::public.app_role;
  END;

  -- Remove any prior role assignments for this user, then insert the canonical one
  DELETE FROM public.user_roles WHERE user_id = NEW.auth_user_id;
  INSERT INTO public.user_roles (user_id, role, role_id)
  VALUES (NEW.auth_user_id, _enum, NEW.role_id)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_user_role_from_employee ON public.employees;
CREATE TRIGGER trg_sync_user_role_from_employee
AFTER INSERT OR UPDATE OF role_id, auth_user_id ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.sync_user_role_from_employee();

-- Backfill: align user_roles to current employees.role_id for all linked users
DO $$
DECLARE
  r RECORD;
  _enum public.app_role;
BEGIN
  FOR r IN
    SELECT e.auth_user_id, e.role_id, rl.key::text AS key
    FROM public.employees e
    JOIN public.roles rl ON rl.id = e.role_id
    WHERE e.auth_user_id IS NOT NULL
  LOOP
    BEGIN
      _enum := r.key::public.app_role;
    EXCEPTION WHEN OTHERS THEN
      _enum := 'employee'::public.app_role;
    END;

    DELETE FROM public.user_roles WHERE user_id = r.auth_user_id;
    INSERT INTO public.user_roles (user_id, role, role_id)
    VALUES (r.auth_user_id, _enum, r.role_id)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
