-- =============== Helper: Check if an employee is an admin/super_admin ===============
CREATE OR REPLACE FUNCTION public.is_employee_admin(_employee_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.user_roles ur ON ur.user_id = e.auth_user_id
    WHERE e.id = _employee_id AND ur.role IN ('super_admin', 'admin')
  )
$$;

-- =============== Update RLS Delete Policy for channel_members ===============
DROP POLICY IF EXISTS "cmem_delete" ON public.channel_members;
CREATE POLICY "cmem_delete" ON public.channel_members FOR DELETE TO authenticated
USING (
  -- 1. Anyone can remove themselves from any channel
  employee_id = public.current_employee_id()
  OR
  -- 2. Channel moderators and admins can remove other members, but ONLY if the target member is NOT an admin
  (
    (public.is_admin(auth.uid()) OR public.is_channel_moderator(channel_id))
    AND NOT public.is_employee_admin(employee_id)
  )
);

-- =============== Trigger 1: Auto-add all active admins to newly created channels ===============
CREATE OR REPLACE FUNCTION public.auto_add_admins_to_channel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.channel_members (channel_id, employee_id, is_moderator)
  SELECT NEW.id, e.id, true
  FROM public.employees e
  JOIN public.user_roles ur ON ur.user_id = e.auth_user_id
  WHERE ur.role IN ('super_admin', 'admin') AND e.employment_status = 'active'
  ON CONFLICT (channel_id, employee_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_add_admins_to_channel ON public.channels;
CREATE TRIGGER trg_auto_add_admins_to_channel
  AFTER INSERT ON public.channels
  FOR EACH ROW EXECUTE FUNCTION public.auto_add_admins_to_channel();

-- =============== Trigger 2: Auto-add employee to all channels when promoted to admin ===============
CREATE OR REPLACE FUNCTION public.auto_add_new_admin_to_all_channels()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_employee_id uuid;
BEGIN
  IF NEW.role IN ('super_admin', 'admin') THEN
    SELECT id INTO v_employee_id FROM public.employees WHERE auth_user_id = NEW.user_id;
    
    IF v_employee_id IS NOT NULL THEN
      INSERT INTO public.channel_members (channel_id, employee_id, is_moderator)
      SELECT c.id, v_employee_id, true
      FROM public.channels c
      ON CONFLICT (channel_id, employee_id) DO NOTHING;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_add_new_admin_to_all_channels ON public.user_roles;
CREATE TRIGGER trg_auto_add_new_admin_to_all_channels
  AFTER INSERT OR UPDATE OF role ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.auto_add_new_admin_to_all_channels();

-- =============== One-time Backfill: Add all existing admins to all existing channels ===============
INSERT INTO public.channel_members (channel_id, employee_id, is_moderator)
SELECT c.id, e.id, true
FROM public.channels c
CROSS JOIN public.employees e
JOIN public.user_roles ur ON ur.user_id = e.auth_user_id
WHERE ur.role IN ('super_admin', 'admin') AND e.employment_status = 'active'
ON CONFLICT (channel_id, employee_id) DO NOTHING;
