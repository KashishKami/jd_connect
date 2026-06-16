-- ============================================================
-- Fix: Sync employees.role_id -> user_roles
--
-- ROOT CAUSE
-- ----------
-- When an admin edits an employee's "Role" dropdown in the UI,
-- the save mutation writes directly to employees.role_id (a FK
-- to roles.id). But my_permissions() reads from user_roles,
-- which was never updated. So permission changes had no effect
-- until the user got a brand-new user_roles row (i.e. they signed
-- up again or an admin used the assign_role_to_user() RPC directly).
--
-- FIX
-- ---
-- 1. A BEFORE UPDATE trigger on employees syncs role_id changes
--    into user_roles so my_permissions() immediately reflects the
--    new role.
-- 2. A one-off backfill aligns user_roles with the current state
--    of employees.role_id for all existing rows.
-- ============================================================

-- ── 1. Trigger function ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_employee_role_to_user_roles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _user_id  uuid;
  _old_role uuid := OLD.role_id;
  _new_role uuid := NEW.role_id;
  _role_key text;
BEGIN
  -- Nothing changed — skip.
  IF _old_role IS NOT DISTINCT FROM _new_role THEN
    RETURN NEW;
  END IF;

  -- Resolve the auth user attached to this employee row.
  _user_id := NEW.auth_user_id;
  IF _user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Remove the old role assignment (if any).
  IF _old_role IS NOT NULL THEN
    DELETE FROM public.user_roles
    WHERE user_id = _user_id AND role_id = _old_role;
  END IF;

  -- Insert the new role assignment (if any).
  IF _new_role IS NOT NULL THEN
    -- For system roles we must also keep the legacy enum column correct
    -- so that has_role() / is_admin() keep working.
    SELECT key::text INTO _role_key
    FROM public.roles
    WHERE id = _new_role AND key IS NOT NULL;

    IF _role_key IS NOT NULL THEN
      -- System role: upsert with the real enum value.
      INSERT INTO public.user_roles (user_id, role, role_id)
      VALUES (_user_id, _role_key::app_role, _new_role)
      ON CONFLICT DO NOTHING;
    ELSE
      -- Custom role: placeholder enum keeps NOT-NULL satisfied.
      INSERT INTO public.user_roles (user_id, role, role_id)
      VALUES (_user_id, 'employee'::app_role, _new_role)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ── 2. Attach the trigger ────────────────────────────────────
DROP TRIGGER IF EXISTS trg_sync_employee_role ON public.employees;

CREATE TRIGGER trg_sync_employee_role
AFTER UPDATE OF role_id ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.sync_employee_role_to_user_roles();

-- ── 3. Backfill: align user_roles with current employees.role_id ──
-- For every employee who has auth_user_id set and a role_id,
-- ensure user_roles contains the matching row.
-- We also clean up stale rows where the employee's role_id has
-- already drifted away from what user_roles says.

-- Remove stale user_roles rows that no longer match the employee's role_id
DELETE FROM public.user_roles ur
WHERE EXISTS (
  SELECT 1
  FROM public.employees e
  WHERE e.auth_user_id = ur.user_id
    AND ur.role_id IS NOT NULL
    AND ur.role_id <> e.role_id   -- mismatch
);

-- Insert missing rows for employees whose role_id is not yet in user_roles
INSERT INTO public.user_roles (user_id, role, role_id)
SELECT
  e.auth_user_id,
  COALESCE(r.key::text, 'employee')::app_role,
  e.role_id
FROM public.employees e
JOIN public.roles r ON r.id = e.role_id
WHERE e.auth_user_id IS NOT NULL
  AND e.role_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur2
    WHERE ur2.user_id = e.auth_user_id
      AND ur2.role_id = e.role_id
  )
ON CONFLICT DO NOTHING;
