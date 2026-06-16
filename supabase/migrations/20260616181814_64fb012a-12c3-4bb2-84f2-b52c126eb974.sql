
-- ============================================
-- Granular permissions + custom roles
-- ============================================

-- 1) Expand permissions table with module/action/label metadata
ALTER TABLE public.permissions
  ADD COLUMN IF NOT EXISTS module text,
  ADD COLUMN IF NOT EXISTS action text,
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS is_dangerous boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0;

-- 2) Expand roles table: is_system flag + nullable enum key (custom roles have no enum)
ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS key_text text;

-- Backfill key_text from existing enum key
UPDATE public.roles SET key_text = key::text WHERE key_text IS NULL;
UPDATE public.roles SET is_system = true WHERE key::text IN ('super_admin','admin','manager','team_leader','employee','hr');

ALTER TABLE public.roles ALTER COLUMN key DROP NOT NULL;
DO $$ BEGIN
  ALTER TABLE public.roles ADD CONSTRAINT roles_key_text_unique UNIQUE (key_text);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- 3) Allow custom roles to be assigned to users via role_id (alongside legacy enum role)
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES public.roles(id) ON DELETE CASCADE;

-- Backfill role_id from existing role enum
UPDATE public.user_roles ur
  SET role_id = r.id
  FROM public.roles r
  WHERE ur.role_id IS NULL AND r.key::text = ur.role::text;

CREATE INDEX IF NOT EXISTS user_roles_role_id_idx ON public.user_roles(role_id);

-- 4) Wipe & reseed permissions with the granular set
DELETE FROM public.role_permissions;
DELETE FROM public.permissions;

INSERT INTO public.permissions (key, module, action, label, description, is_dangerous, sort_order) VALUES
  -- Employees
  ('employees.view','employees','view','View directory','See the employee directory and basic profiles',false,10),
  ('employees.view_contact','employees','view_contact','View contact info','See employee email and phone numbers',false,11),
  ('employees.create','employees','create','Create employees','Add new employees to the system',false,12),
  ('employees.edit_profile','employees','edit_profile','Edit profile','Update name, photo, designation, basic profile fields',false,13),
  ('employees.edit_employment','employees','edit_employment','Edit employment details','Change department, centre, shift, manager, team leader',false,14),
  ('employees.delete','employees','delete','Delete employees','Permanently remove employees',true,15),
  ('employees.approve','employees','approve','Approve signups','Approve or reject pending employee accounts',false,16),
  ('employees.assign_role','employees','assign_role','Assign roles','Grant or revoke roles from employees',true,17),
  ('employees.notes_view','employees','notes_view','View notes','Read internal notes about employees',false,18),
  ('employees.notes_manage','employees','notes_manage','Manage notes','Create, edit and delete employee notes',false,19),
  -- Attendance
  ('attendance.view_own','attendance','view_own','View own','View own attendance records',false,20),
  ('attendance.view_team','attendance','view_team','View team','View attendance for direct reports',false,21),
  ('attendance.view_all','attendance','view_all','View all','View attendance company-wide',false,22),
  ('attendance.edit','attendance','edit','Edit records','Edit attendance records',true,23),
  ('attendance.correction_request','attendance','correction_request','Request correction','Submit attendance correction requests',false,24),
  ('attendance.correction_approve','attendance','correction_approve','Approve correction','Approve or reject correction requests',false,25),
  -- Breaks
  ('breaks.start_own','breaks','start_own','Start own break','Start and end personal breaks',false,30),
  ('breaks.view_team','breaks','view_team','View team breaks','See team break activity',false,31),
  ('breaks.view_all','breaks','view_all','View all breaks','See company-wide break activity',false,32),
  ('breaks.policies_manage','breaks','policies_manage','Manage policies','Configure break policies',false,33),
  ('breaks.types_manage','breaks','types_manage','Manage types','Add or edit break types',false,34),
  -- Sales
  ('sales.enter_own','sales','enter_own','Enter own sales','Log own sales entries',false,40),
  ('sales.enter_team','sales','enter_team','Enter team sales','Log sales on behalf of team members',false,41),
  ('sales.view_own','sales','view_own','View own sales','See own sales numbers',false,42),
  ('sales.view_team','sales','view_team','View team sales','See team sales numbers',false,43),
  ('sales.view_all','sales','view_all','View all sales','See company-wide sales',false,44),
  ('sales.sources_manage','sales','sources_manage','Manage sources','Configure sales sources',false,45),
  ('sales.refunds_manage','sales','refunds_manage','Manage refunds','Create and manage refund entries',false,46),
  ('sales.chargebacks_manage','sales','chargebacks_manage','Manage chargebacks','Create and manage chargeback entries',false,47),
  -- Documents
  ('documents.view','documents','view','View documents','Open and read documents',false,50),
  ('documents.upload','documents','upload','Upload','Upload new documents',false,51),
  ('documents.edit','documents','edit','Edit','Edit document metadata and versions',false,52),
  ('documents.archive','documents','archive','Archive','Archive or restore documents',false,53),
  ('documents.delete','documents','delete','Delete','Permanently delete documents',true,54),
  ('documents.permissions_manage','documents','permissions_manage','Manage access','Configure document visibility and access',false,55),
  ('documents.categories_manage','documents','categories_manage','Manage categories','Add or edit document categories',false,56),
  -- Channels / chat
  ('channels.view','channels','view','View channels','See and read channels',false,60),
  ('channels.create','channels','create','Create channels','Create new channels',false,61),
  ('channels.post','channels','post','Post messages','Send messages in channels',false,62),
  ('channels.moderate','channels','moderate','Moderate','Pin, delete messages, approve join requests',false,63),
  ('channels.members_manage','channels','members_manage','Manage members','Add or remove channel members',false,64),
  -- Announcements
  ('announcements.view','announcements','view','View announcements','See announcements',false,70),
  ('announcements.post','announcements','post','Post','Publish announcements',false,71),
  ('announcements.post_critical','announcements','post_critical','Post critical','Publish critical-priority announcements',true,72),
  -- Reports
  ('reports.dashboards','reports','dashboards','View dashboards','See analytics dashboards',false,80),
  ('reports.leaderboard','reports','leaderboard','View leaderboard','See sales leaderboard',false,81),
  ('reports.ai_analytics','reports','ai_analytics','AI analytics','Use AI-powered analytics features',false,82),
  ('reports.export','reports','export','Export data','Export reports to CSV/Excel',false,83),
  -- Admin
  ('admin.panel','admin','panel','Access admin panel','Open the admin section',false,90),
  ('admin.departments','admin','departments','Manage departments','Add/edit/delete departments',false,91),
  ('admin.centres','admin','centres','Manage centres','Add/edit/delete centres',false,92),
  ('admin.shifts','admin','shifts','Manage shifts','Add/edit/delete shifts',false,93),
  ('admin.holidays','admin','holidays','Manage holidays','Configure holiday calendar',false,94),
  ('admin.sales_sources','admin','sales_sources','Manage sales sources','Configure sales sources catalog',false,95),
  ('admin.knowledge','admin','knowledge','Manage knowledge base','Configure knowledge / AI ingestion',false,96),
  ('admin.settings','admin','settings','System settings','Change system-wide settings',true,97),
  ('admin.roles','admin','roles','Manage roles & permissions','Edit roles and permission matrix',true,98);

-- 5) Default role -> permission mapping
WITH r AS (SELECT id, key::text k FROM public.roles WHERE is_system),
     p AS (SELECT id, key, module FROM public.permissions)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM r, p WHERE
  -- super_admin & admin get everything
  (r.k IN ('super_admin','admin'))
  -- HR: full attendance + breaks + employees view/contact/notes + reports
  OR (r.k = 'hr' AND (
    p.module IN ('attendance','breaks')
    OR p.key IN ('employees.view','employees.view_contact','employees.notes_view','employees.notes_manage','employees.approve',
                 'reports.dashboards','reports.leaderboard','reports.export','announcements.view','channels.view','channels.post',
                 'documents.view','admin.panel')
  ))
  -- manager: team-scoped management
  OR (r.k = 'manager' AND p.key IN (
    'employees.view','employees.view_contact','employees.edit_profile','employees.notes_view','employees.notes_manage','employees.approve',
    'attendance.view_own','attendance.view_team','attendance.correction_request','attendance.correction_approve',
    'breaks.start_own','breaks.view_team',
    'sales.enter_own','sales.enter_team','sales.view_own','sales.view_team',
    'documents.view','documents.upload',
    'channels.view','channels.create','channels.post','channels.moderate','channels.members_manage',
    'announcements.view','announcements.post',
    'reports.dashboards','reports.leaderboard','reports.export','reports.ai_analytics'
  ))
  -- team leader
  OR (r.k = 'team_leader' AND p.key IN (
    'employees.view','employees.notes_view','employees.notes_manage',
    'attendance.view_own','attendance.view_team','attendance.correction_request',
    'breaks.start_own','breaks.view_team',
    'sales.enter_own','sales.enter_team','sales.view_own','sales.view_team',
    'documents.view','channels.view','channels.post','announcements.view',
    'reports.dashboards','reports.leaderboard'
  ))
  -- regular employee
  OR (r.k = 'employee' AND p.key IN (
    'employees.view',
    'attendance.view_own','attendance.correction_request',
    'breaks.start_own',
    'sales.enter_own','sales.view_own',
    'documents.view','channels.view','channels.post','announcements.view'
  ));

-- 6) has_permission(user, perm_key) — checks BOTH legacy user_roles.role and user_roles.role_id
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _perm text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON (r.id = ur.role_id OR r.key::text = ur.role::text)
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = _user_id AND p.key = _perm
  )
$$;

-- 7) Helper: list current user's effective permission keys
CREATE OR REPLACE FUNCTION public.my_permissions()
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT p.key
  FROM public.user_roles ur
  JOIN public.roles r ON (r.id = ur.role_id OR r.key::text = ur.role::text)
  JOIN public.role_permissions rp ON rp.role_id = r.id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE ur.user_id = auth.uid()
$$;

-- 8) Update existing access helpers to OR-in granular permission checks
CREATE OR REPLACE FUNCTION public.can_manage_employee(_employee_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'employees.edit_employment')
    OR public.has_permission(auth.uid(), 'employees.delete')
    OR EXISTS (
      SELECT 1 FROM public.employees e, public.employees me
      WHERE e.id = _employee_id
        AND me.auth_user_id = auth.uid()
        AND me.approval_status = 'approved'
        AND me.employment_status = 'active'
        AND (
          (public.has_role(auth.uid(),'manager') AND e.manager_id = me.id)
          OR (public.has_role(auth.uid(),'team_leader') AND e.team_leader_id = me.id)
        )
    )
$$;

CREATE OR REPLACE FUNCTION public.can_view_employee_notes(_employee_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'employees.notes_view')
    OR public.has_permission(auth.uid(), 'employees.notes_manage')
    OR EXISTS (
      SELECT 1 FROM public.employees e, public.employees me
      WHERE e.id = _employee_id
        AND me.auth_user_id = auth.uid()
        AND me.approval_status = 'approved'
        AND me.employment_status = 'active'
        AND (
          (public.has_role(auth.uid(),'manager') AND e.manager_id = me.id)
          OR (public.has_role(auth.uid(),'team_leader') AND e.team_leader_id = me.id)
        )
    )
$$;

CREATE OR REPLACE FUNCTION public.can_view_sales_for(_employee_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _employee_id = public.current_employee_id()
    OR public.is_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'sales.view_all')
    OR (public.has_permission(auth.uid(), 'sales.view_team') AND EXISTS (
      SELECT 1 FROM public.employees e, public.employees me
      WHERE e.id = _employee_id AND me.auth_user_id = auth.uid()
        AND (e.manager_id = me.id OR e.team_leader_id = me.id)
    ))
    OR EXISTS (
      SELECT 1 FROM public.employees e, public.employees me
      WHERE e.id = _employee_id
        AND me.auth_user_id = auth.uid()
        AND me.approval_status = 'approved'
        AND me.employment_status = 'active'
        AND (
          (public.has_role(auth.uid(),'manager') AND e.manager_id = me.id)
          OR (public.has_role(auth.uid(),'team_leader') AND e.team_leader_id = me.id)
        )
    )
$$;

CREATE OR REPLACE FUNCTION public.can_enter_sales_for(_employee_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin(auth.uid())
    OR (public.has_permission(auth.uid(), 'sales.enter_team') AND EXISTS (
      SELECT 1 FROM public.employees e, public.employees me
      WHERE e.id = _employee_id AND me.auth_user_id = auth.uid()
        AND (e.manager_id = me.id OR e.team_leader_id = me.id)
    ))
    OR EXISTS (
      SELECT 1 FROM public.employees e, public.employees me
      WHERE e.id = _employee_id
        AND me.auth_user_id = auth.uid()
        AND me.approval_status = 'approved'
        AND me.employment_status = 'active'
        AND (
          (public.has_role(auth.uid(),'manager') AND e.manager_id = me.id)
          OR (public.has_role(auth.uid(),'team_leader') AND e.team_leader_id = me.id)
        )
    )
$$;

CREATE OR REPLACE FUNCTION public.is_channel_moderator(_channel_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin(auth.uid())
    OR public.has_role(auth.uid(),'manager')
    OR public.has_permission(auth.uid(), 'channels.moderate')
    OR EXISTS (
      SELECT 1 FROM public.channel_members
      WHERE channel_id=_channel_id
        AND employee_id=public.current_employee_id()
        AND is_moderator=true
    )
$$;

CREATE OR REPLACE FUNCTION public.can_create_channel()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin(auth.uid())
    OR public.has_role(auth.uid(),'manager')
    OR public.has_permission(auth.uid(), 'channels.create')
$$;

CREATE OR REPLACE FUNCTION public.can_post_announcement()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin(auth.uid())
    OR public.has_role(auth.uid(),'manager')
    OR public.has_permission(auth.uid(), 'announcements.post')
$$;

-- 9) Admin RPCs to manage custom roles
CREATE OR REPLACE FUNCTION public.create_custom_role(_key_text text, _name text, _description text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF _key_text IS NULL OR length(btrim(_key_text)) < 2 THEN RAISE EXCEPTION 'key required'; END IF;
  INSERT INTO public.roles (key_text, name, description, is_system)
  VALUES (lower(regexp_replace(_key_text,'[^a-zA-Z0-9_]+','_','g')), _name, _description, false)
  RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.rename_custom_role(_role_id uuid, _name text, _description text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  UPDATE public.roles SET name = COALESCE(_name, name), description = COALESCE(_description, description)
   WHERE id = _role_id AND is_system = false;
  IF NOT FOUND THEN RAISE EXCEPTION 'role not found or is a system role'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.delete_custom_role(_role_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  DELETE FROM public.roles WHERE id = _role_id AND is_system = false;
  IF NOT FOUND THEN RAISE EXCEPTION 'role not found or is a system role'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.assign_role_to_user(_user_id uuid, _role_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _k text;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT key::text INTO _k FROM public.roles WHERE id = _role_id;
  -- For system roles, ensure the enum-backed assignment also lands so legacy has_role() keeps working.
  IF _k IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role, role_id) VALUES (_user_id, _k::app_role, _role_id)
    ON CONFLICT DO NOTHING;
  ELSE
    -- Custom role: use 'employee' as placeholder enum to satisfy NOT NULL.
    INSERT INTO public.user_roles (user_id, role, role_id) VALUES (_user_id, 'employee'::app_role, _role_id)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.revoke_role_from_user(_user_id uuid, _role_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id AND role_id = _role_id;
END $$;
