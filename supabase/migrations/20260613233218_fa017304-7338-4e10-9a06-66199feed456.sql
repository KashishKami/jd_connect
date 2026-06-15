
-- =========================
-- ENUMS
-- =========================
CREATE TYPE public.break_status AS ENUM ('active','completed','exceeded','cancelled');
CREATE TYPE public.break_request_status AS ENUM ('pending','approved','rejected','cancelled');

-- =========================
-- break_types
-- =========================
CREATE TABLE public.break_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  default_limit_minutes integer,           -- NULL = no limit
  tl_alert_minutes integer,                -- when to notify TL
  manager_alert_minutes integer,           -- when to escalate to Manager
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.break_types TO authenticated;
GRANT ALL ON public.break_types TO service_role;
ALTER TABLE public.break_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "break_types readable by authenticated"
  ON public.break_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "break_types admin manage"
  ON public.break_types FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_break_types_updated_at
  BEFORE UPDATE ON public.break_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed defaults
INSERT INTO public.break_types (key, name, default_limit_minutes, tl_alert_minutes, manager_alert_minutes) VALUES
  ('tea',     'Tea Break',     15, 15, 25),
  ('dinner',  'Dinner Break',  30, 30, 45),
  ('bio',     'Bio Break',     10, 10, 20),
  ('smoke',   'Smoke Break',   10, 10, 20),
  ('meeting', 'Meeting Break', NULL, NULL, NULL);

-- =========================
-- break_policies (per centre / department override)
-- =========================
CREATE TABLE public.break_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  break_type_id uuid NOT NULL REFERENCES public.break_types(id) ON DELETE CASCADE,
  centre_id uuid REFERENCES public.centres(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE,
  limit_minutes integer,
  tl_alert_minutes integer,
  manager_alert_minutes integer,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (break_type_id, centre_id, department_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.break_policies TO authenticated;
GRANT ALL ON public.break_policies TO service_role;
ALTER TABLE public.break_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "break_policies readable by authenticated"
  ON public.break_policies FOR SELECT TO authenticated USING (true);
CREATE POLICY "break_policies managers+admins manage"
  ON public.break_policies FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'manager'));

CREATE TRIGGER trg_break_policies_updated_at
  BEFORE UPDATE ON public.break_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- break_records
-- =========================
CREATE TABLE public.break_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  break_type_id uuid NOT NULL REFERENCES public.break_types(id),
  department_id uuid REFERENCES public.departments(id),
  centre_id uuid REFERENCES public.centres(id),
  start_at timestamptz NOT NULL DEFAULT now(),
  end_at timestamptz,
  duration_minutes numeric(8,2),
  status public.break_status NOT NULL DEFAULT 'active',
  limit_minutes integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_break_records_employee ON public.break_records(employee_id, start_at DESC);
CREATE INDEX idx_break_records_active ON public.break_records(status) WHERE status = 'active';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.break_records TO authenticated;
GRANT ALL ON public.break_records TO service_role;
ALTER TABLE public.break_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "break_records self read"
  ON public.break_records FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id() OR public.can_manage_employee(employee_id));
CREATE POLICY "break_records self insert"
  ON public.break_records FOR INSERT TO authenticated
  WITH CHECK (employee_id = public.current_employee_id() OR public.can_manage_employee(employee_id));
CREATE POLICY "break_records self update"
  ON public.break_records FOR UPDATE TO authenticated
  USING (employee_id = public.current_employee_id() OR public.can_manage_employee(employee_id))
  WITH CHECK (employee_id = public.current_employee_id() OR public.can_manage_employee(employee_id));
CREATE POLICY "break_records admin delete"
  ON public.break_records FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER trg_break_records_updated_at
  BEFORE UPDATE ON public.break_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-compute duration & status when ended
CREATE OR REPLACE FUNCTION public.compute_break_duration()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_minutes numeric;
BEGIN
  IF NEW.end_at IS NOT NULL AND NEW.start_at IS NOT NULL THEN
    v_minutes := ROUND(EXTRACT(EPOCH FROM (NEW.end_at - NEW.start_at))/60.0, 2);
    NEW.duration_minutes := v_minutes;
    IF NEW.status = 'active' THEN
      IF NEW.limit_minutes IS NOT NULL AND v_minutes > NEW.limit_minutes THEN
        NEW.status := 'exceeded';
      ELSE
        NEW.status := 'completed';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_break_records_compute
  BEFORE INSERT OR UPDATE ON public.break_records
  FOR EACH ROW EXECUTE FUNCTION public.compute_break_duration();

-- =========================
-- break_requests
-- =========================
CREATE TABLE public.break_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  break_type_id uuid REFERENCES public.break_types(id),
  requested_minutes integer NOT NULL,
  reason text NOT NULL,
  status public.break_request_status NOT NULL DEFAULT 'pending',
  reviewer_id uuid REFERENCES public.employees(id),
  reviewed_at timestamptz,
  review_notes text,
  break_record_id uuid REFERENCES public.break_records(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.break_requests TO authenticated;
GRANT ALL ON public.break_requests TO service_role;
ALTER TABLE public.break_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "break_requests read"
  ON public.break_requests FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id() OR public.can_manage_employee(employee_id));
CREATE POLICY "break_requests self insert"
  ON public.break_requests FOR INSERT TO authenticated
  WITH CHECK (employee_id = public.current_employee_id());
CREATE POLICY "break_requests reviewer update"
  ON public.break_requests FOR UPDATE TO authenticated
  USING (public.can_manage_employee(employee_id) OR employee_id = public.current_employee_id())
  WITH CHECK (public.can_manage_employee(employee_id) OR employee_id = public.current_employee_id());

CREATE TRIGGER trg_break_requests_updated_at
  BEFORE UPDATE ON public.break_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- break_audit_logs
-- =========================
CREATE TABLE public.break_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  break_record_id uuid REFERENCES public.break_records(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id),
  actor_user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.break_audit_logs TO authenticated;
GRANT ALL ON public.break_audit_logs TO service_role;
ALTER TABLE public.break_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "break_audit_logs read"
  ON public.break_audit_logs FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.can_manage_employee(employee_id) OR employee_id = public.current_employee_id());
CREATE POLICY "break_audit_logs insert (system)"
  ON public.break_audit_logs FOR INSERT TO authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.log_break_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.break_audit_logs (break_record_id, employee_id, actor_user_id, action, before_data, after_data)
  VALUES (
    COALESCE(NEW.id, OLD.id),
    COALESCE(NEW.employee_id, OLD.employee_id),
    auth.uid(),
    TG_OP,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_break_records_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.break_records
  FOR EACH ROW EXECUTE FUNCTION public.log_break_change();

-- =========================
-- Helper: effective break limit (policy override -> default)
-- =========================
CREATE OR REPLACE FUNCTION public.effective_break_limit(_break_type_id uuid, _centre_id uuid, _department_id uuid)
RETURNS TABLE(limit_minutes integer, tl_alert_minutes integer, manager_alert_minutes integer)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    COALESCE(p.limit_minutes, bt.default_limit_minutes),
    COALESCE(p.tl_alert_minutes, bt.tl_alert_minutes),
    COALESCE(p.manager_alert_minutes, bt.manager_alert_minutes)
  FROM public.break_types bt
  LEFT JOIN LATERAL (
    SELECT * FROM public.break_policies bp
    WHERE bp.break_type_id = bt.id AND bp.is_active
      AND (bp.centre_id = _centre_id OR bp.centre_id IS NULL)
      AND (bp.department_id = _department_id OR bp.department_id IS NULL)
    ORDER BY (bp.centre_id IS NOT NULL)::int + (bp.department_id IS NOT NULL)::int DESC
    LIMIT 1
  ) p ON true
  WHERE bt.id = _break_type_id;
$$;

GRANT EXECUTE ON FUNCTION public.effective_break_limit(uuid,uuid,uuid) TO authenticated;

-- =========================
-- Workforce monitor view (counts)
-- =========================
CREATE OR REPLACE FUNCTION public.workforce_monitor()
RETURNS TABLE(logged_in bigint, on_break bigint, available bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH today_attendance AS (
    SELECT DISTINCT employee_id FROM public.attendance_records
    WHERE work_date = CURRENT_DATE AND login_at IS NOT NULL AND logout_at IS NULL
  ),
  on_break AS (
    SELECT DISTINCT employee_id FROM public.break_records WHERE status = 'active'
  )
  SELECT
    (SELECT count(*) FROM today_attendance)::bigint AS logged_in,
    (SELECT count(*) FROM on_break)::bigint AS on_break,
    GREATEST((SELECT count(*) FROM today_attendance) - (SELECT count(*) FROM on_break), 0)::bigint AS available;
$$;

GRANT EXECUTE ON FUNCTION public.workforce_monitor() TO authenticated;
