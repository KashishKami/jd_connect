
-- =====================================================
-- ENUMS
-- =====================================================
CREATE TYPE public.app_role AS ENUM ('super_admin','admin','manager','team_leader','employee');
CREATE TYPE public.employment_status AS ENUM ('active','suspended','resigned','terminated');
CREATE TYPE public.note_category AS ENUM ('coaching','warning','appreciation','promotion_recommendation','performance_review','general');

-- =====================================================
-- updated_at helper
-- =====================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- =====================================================
-- CENTRES
-- =====================================================
CREATE TABLE public.centres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.centres TO authenticated;
GRANT ALL ON public.centres TO service_role;
ALTER TABLE public.centres ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_centres_updated BEFORE UPDATE ON public.centres FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================
-- DEPARTMENTS
-- =====================================================
CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_depts_updated BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================
-- SHIFTS
-- =====================================================
CREATE TABLE public.shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  grace_minutes int NOT NULL DEFAULT 15,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shifts TO authenticated;
GRANT ALL ON public.shifts TO service_role;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_shifts_updated BEFORE UPDATE ON public.shifts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================
-- ROLES
-- =====================================================
CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key public.app_role UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roles TO authenticated;
GRANT ALL ON public.roles TO service_role;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- PERMISSIONS + ROLE_PERMISSIONS
-- =====================================================
CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.permissions TO authenticated;
GRANT ALL ON public.permissions TO service_role;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.role_permissions (
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- USER_ROLES (separate table for security - never store on profiles)
-- =====================================================
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role security-definer
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('super_admin','admin'))
$$;

-- =====================================================
-- EMPLOYEES (auto JD#### code)
-- =====================================================
CREATE SEQUENCE public.employee_code_seq START 1;

CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  employee_code text UNIQUE NOT NULL DEFAULT ('JD' || lpad(nextval('public.employee_code_seq')::text, 4, '0')),
  full_name text NOT NULL,
  email text UNIQUE NOT NULL,
  mobile text,
  department_id uuid REFERENCES public.departments(id),
  role_id uuid REFERENCES public.roles(id),
  team_leader_id uuid REFERENCES public.employees(id),
  manager_id uuid REFERENCES public.employees(id),
  centre_id uuid REFERENCES public.centres(id),
  shift_id uuid REFERENCES public.shifts(id),
  designation text,
  joining_date date,
  employment_status public.employment_status NOT NULL DEFAULT 'active',
  profile_photo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_emp_updated BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- current_employee helper
CREATE OR REPLACE FUNCTION public.current_employee_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.employees WHERE auth_user_id = auth.uid() LIMIT 1
$$;

-- =====================================================
-- EMPLOYEE NOTES
-- =====================================================
CREATE TABLE public.employee_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  category public.note_category NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_notes TO authenticated;
GRANT ALL ON public.employee_notes TO service_role;
ALTER TABLE public.employee_notes ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_notes_updated BEFORE UPDATE ON public.employee_notes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.employee_note_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES public.employee_notes(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes int,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_note_attachments TO authenticated;
GRANT ALL ON public.employee_note_attachments TO service_role;
ALTER TABLE public.employee_note_attachments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.employee_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  review_period text NOT NULL,
  rating int CHECK (rating BETWEEN 1 AND 5),
  summary text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_reviews TO authenticated;
GRANT ALL ON public.employee_reviews TO service_role;
ALTER TABLE public.employee_reviews ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.employee_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  from_designation text,
  to_designation text NOT NULL,
  effective_date date NOT NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_promotions TO authenticated;
GRANT ALL ON public.employee_promotions TO service_role;
ALTER TABLE public.employee_promotions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.employee_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_sessions TO authenticated;
GRANT ALL ON public.employee_sessions TO service_role;
ALTER TABLE public.employee_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- Centres: read all authenticated; write admin
CREATE POLICY "centres_select" ON public.centres FOR SELECT TO authenticated USING (true);
CREATE POLICY "centres_admin_write" ON public.centres FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Departments
CREATE POLICY "depts_select" ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "depts_admin_write" ON public.departments FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Shifts
CREATE POLICY "shifts_select" ON public.shifts FOR SELECT TO authenticated USING (true);
CREATE POLICY "shifts_admin_write" ON public.shifts FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Roles
CREATE POLICY "roles_select" ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "roles_admin_write" ON public.roles FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Permissions
CREATE POLICY "perms_select" ON public.permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "perms_admin_write" ON public.permissions FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Role-permissions
CREATE POLICY "rp_select" ON public.role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "rp_admin_write" ON public.role_permissions FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- User roles: user can read own; admin manages
CREATE POLICY "ur_select_own_or_admin" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "ur_admin_write" ON public.user_roles FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Employees: read all authenticated (directory); update by admin or self (limited fields enforced in app)
CREATE POLICY "emp_select" ON public.employees FOR SELECT TO authenticated USING (true);
CREATE POLICY "emp_admin_insert" ON public.employees FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "emp_admin_update" ON public.employees FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) OR auth_user_id = auth.uid())
  WITH CHECK (public.is_admin(auth.uid()) OR auth_user_id = auth.uid());
CREATE POLICY "emp_admin_delete" ON public.employees FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- Notes visibility: helper
CREATE OR REPLACE FUNCTION public.can_view_employee_notes(_employee_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = _employee_id
        AND (
          (public.has_role(auth.uid(),'manager') AND e.manager_id = public.current_employee_id())
          OR (public.has_role(auth.uid(),'team_leader') AND e.team_leader_id = public.current_employee_id())
        )
    )
$$;

CREATE POLICY "notes_select" ON public.employee_notes FOR SELECT TO authenticated
  USING (public.can_view_employee_notes(employee_id));
CREATE POLICY "notes_write" ON public.employee_notes FOR ALL TO authenticated
  USING (public.can_view_employee_notes(employee_id))
  WITH CHECK (public.can_view_employee_notes(employee_id));

CREATE POLICY "note_att_select" ON public.employee_note_attachments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.employee_notes n WHERE n.id = note_id AND public.can_view_employee_notes(n.employee_id)));
CREATE POLICY "note_att_write" ON public.employee_note_attachments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.employee_notes n WHERE n.id = note_id AND public.can_view_employee_notes(n.employee_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.employee_notes n WHERE n.id = note_id AND public.can_view_employee_notes(n.employee_id)));

CREATE POLICY "reviews_select" ON public.employee_reviews FOR SELECT TO authenticated
  USING (public.can_view_employee_notes(employee_id));
CREATE POLICY "reviews_write" ON public.employee_reviews FOR ALL TO authenticated
  USING (public.can_view_employee_notes(employee_id))
  WITH CHECK (public.can_view_employee_notes(employee_id));

CREATE POLICY "promo_select" ON public.employee_promotions FOR SELECT TO authenticated
  USING (public.can_view_employee_notes(employee_id));
CREATE POLICY "promo_write" ON public.employee_promotions FOR ALL TO authenticated
  USING (public.can_view_employee_notes(employee_id))
  WITH CHECK (public.can_view_employee_notes(employee_id));

-- Sessions: users see their own, admin sees all
CREATE POLICY "sess_select_own_or_admin" ON public.employee_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "sess_write_own" ON public.employee_sessions FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- Audit logs: admin read; anyone insert (for own actions)
CREATE POLICY "audit_admin_select" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE POLICY "audit_insert" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (actor_user_id = auth.uid());

-- =====================================================
-- SIGN-UP TRIGGER: create employee + assign role
-- First user = super_admin, rest = employee
-- =====================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_first boolean;
  v_role public.app_role;
  v_role_id uuid;
  v_full_name text;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO v_is_first;
  v_role := CASE WHEN v_is_first THEN 'super_admin'::public.app_role ELSE 'employee'::public.app_role END;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_role)
  ON CONFLICT DO NOTHING;

  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1));
  SELECT id INTO v_role_id FROM public.roles WHERE key = v_role;

  INSERT INTO public.employees (auth_user_id, full_name, email, role_id, employment_status)
  VALUES (NEW.id, v_full_name, NEW.email, v_role_id, 'active')
  ON CONFLICT (email) DO UPDATE SET auth_user_id = EXCLUDED.auth_user_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- RPC: look up email by employee code (for Employee-ID login)
-- =====================================================
CREATE OR REPLACE FUNCTION public.email_for_employee_code(_code text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT email FROM public.employees
  WHERE employee_code = upper(_code) AND employment_status = 'active'
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.email_for_employee_code(text) TO anon, authenticated;

-- =====================================================
-- SEED DATA
-- =====================================================
INSERT INTO public.centres (code, name) VALUES
  ('DBP','Doon Business Park'),
  ('ITP','IT Park');

INSERT INTO public.departments (name) VALUES
  ('Sales'),('Backend'),('HR'),('Training'),('Management'),('Marketing'),('Logistics');

INSERT INTO public.shifts (name, start_time, end_time, grace_minutes) VALUES
  ('Night Shift','19:30','04:30',15);

INSERT INTO public.roles (key, name, description) VALUES
  ('super_admin','Super Admin','Full system access'),
  ('admin','Admin','Administrative access'),
  ('manager','Manager','Manage reporting structure'),
  ('team_leader','Team Leader','Lead assigned team'),
  ('employee','Employee','Standard employee access');

INSERT INTO public.permissions (key, description) VALUES
  ('employees.view','View employee directory'),
  ('employees.manage','Create/edit/delete employees'),
  ('departments.manage','Manage departments'),
  ('centres.manage','Manage centres'),
  ('shifts.manage','Manage shifts'),
  ('roles.manage','Manage roles and permissions'),
  ('notes.view','View employee notes (scoped)'),
  ('notes.manage','Create/edit employee notes'),
  ('admin.panel','Access admin panel');

-- Default role-permission mapping
WITH r AS (SELECT id, key FROM public.roles), p AS (SELECT id, key FROM public.permissions)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM r, p WHERE
  (r.key IN ('super_admin','admin')) OR
  (r.key = 'manager' AND p.key IN ('employees.view','notes.view','notes.manage')) OR
  (r.key = 'team_leader' AND p.key IN ('employees.view','notes.view','notes.manage')) OR
  (r.key = 'employee' AND p.key IN ('employees.view'));
