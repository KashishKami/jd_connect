
-- =========================
-- ENUMS
-- =========================
CREATE TYPE public.attendance_status AS ENUM ('present','half_day','absent','late','leave','weekly_off','holiday');
CREATE TYPE public.attendance_source AS ENUM ('auto','manual','correction');
CREATE TYPE public.leave_type AS ENUM ('casual','sick','earned','unpaid','comp_off','other');
CREATE TYPE public.request_status AS ENUM ('pending','approved','rejected','cancelled');

-- =========================
-- HOLIDAYS
-- =========================
CREATE TABLE public.holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date date NOT NULL,
  name text NOT NULL,
  centre_id uuid REFERENCES public.centres(id) ON DELETE CASCADE,
  is_recurring boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (holiday_date, centre_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holidays TO authenticated;
GRANT ALL ON public.holidays TO service_role;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY hol_select ON public.holidays FOR SELECT TO authenticated USING (true);
CREATE POLICY hol_admin_write ON public.holidays FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER trg_hol_updated BEFORE UPDATE ON public.holidays FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- LEAVE REQUESTS
-- =========================
CREATE TABLE public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type public.leave_type NOT NULL DEFAULT 'casual',
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text NOT NULL,
  status public.request_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES public.employees(id),
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX leave_requests_emp_idx ON public.leave_requests(employee_id, start_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_requests TO authenticated;
GRANT ALL ON public.leave_requests TO service_role;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_manage_employee(_employee_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = _employee_id
      AND (
        (public.has_role(auth.uid(),'manager') AND e.manager_id = public.current_employee_id())
        OR (public.has_role(auth.uid(),'team_leader') AND e.team_leader_id = public.current_employee_id())
      )
  )
$$;
GRANT EXECUTE ON FUNCTION public.can_manage_employee(uuid) TO authenticated;

CREATE POLICY leave_select ON public.leave_requests FOR SELECT TO authenticated USING (
  employee_id = public.current_employee_id() OR public.can_manage_employee(employee_id)
);
CREATE POLICY leave_insert_self ON public.leave_requests FOR INSERT TO authenticated WITH CHECK (
  employee_id = public.current_employee_id()
);
CREATE POLICY leave_update_self_pending ON public.leave_requests FOR UPDATE TO authenticated USING (
  employee_id = public.current_employee_id() AND status = 'pending'
) WITH CHECK (employee_id = public.current_employee_id());
CREATE POLICY leave_review ON public.leave_requests FOR UPDATE TO authenticated USING (
  public.can_manage_employee(employee_id) AND NOT (employee_id = public.current_employee_id())
) WITH CHECK (public.can_manage_employee(employee_id));
CREATE TRIGGER trg_leave_updated BEFORE UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- ATTENDANCE RECORDS
-- =========================
CREATE TABLE public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  login_at timestamptz,
  logout_at timestamptz,
  hours_worked numeric(5,2),
  status public.attendance_status NOT NULL DEFAULT 'absent',
  is_late boolean NOT NULL DEFAULT false,
  source public.attendance_source NOT NULL DEFAULT 'auto',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, work_date)
);
CREATE INDEX attendance_emp_date_idx ON public.attendance_records(employee_id, work_date DESC);
CREATE INDEX attendance_date_idx ON public.attendance_records(work_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_records TO authenticated;
GRANT ALL ON public.attendance_records TO service_role;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY att_select ON public.attendance_records FOR SELECT TO authenticated USING (
  employee_id = public.current_employee_id() OR public.can_manage_employee(employee_id)
);
CREATE POLICY att_insert_self ON public.attendance_records FOR INSERT TO authenticated WITH CHECK (
  employee_id = public.current_employee_id() OR public.is_admin(auth.uid())
);
CREATE POLICY att_update_self ON public.attendance_records FOR UPDATE TO authenticated USING (
  employee_id = public.current_employee_id() OR public.is_admin(auth.uid())
) WITH CHECK (
  employee_id = public.current_employee_id() OR public.is_admin(auth.uid())
);
CREATE POLICY att_admin_delete ON public.attendance_records FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE TRIGGER trg_att_updated BEFORE UPDATE ON public.attendance_records FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Compute hours_worked and status on insert/update
CREATE OR REPLACE FUNCTION public.compute_attendance_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_hours numeric;
BEGIN
  IF NEW.login_at IS NOT NULL AND NEW.logout_at IS NOT NULL THEN
    v_hours := ROUND(EXTRACT(EPOCH FROM (NEW.logout_at - NEW.login_at))/3600.0, 2);
    NEW.hours_worked := v_hours;
    IF NEW.status NOT IN ('leave','weekly_off','holiday') THEN
      IF v_hours >= 9 THEN NEW.status := 'present';
      ELSIF v_hours >= 5 THEN NEW.status := 'half_day';
      ELSE NEW.status := 'absent';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_att_compute BEFORE INSERT OR UPDATE ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION public.compute_attendance_status();

-- =========================
-- ATTENDANCE CORRECTIONS
-- =========================
CREATE TABLE public.attendance_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id uuid REFERENCES public.attendance_records(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  requested_login_at timestamptz,
  requested_logout_at timestamptz,
  requested_status public.attendance_status,
  reason text NOT NULL,
  status public.request_status NOT NULL DEFAULT 'pending',
  requested_by uuid NOT NULL REFERENCES public.employees(id),
  reviewed_by uuid REFERENCES public.employees(id),
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX corr_emp_idx ON public.attendance_corrections(employee_id, work_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_corrections TO authenticated;
GRANT ALL ON public.attendance_corrections TO service_role;
ALTER TABLE public.attendance_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY corr_select ON public.attendance_corrections FOR SELECT TO authenticated USING (
  employee_id = public.current_employee_id()
  OR requested_by = public.current_employee_id()
  OR public.can_manage_employee(employee_id)
);
CREATE POLICY corr_insert ON public.attendance_corrections FOR INSERT TO authenticated WITH CHECK (
  requested_by = public.current_employee_id()
  AND (public.can_manage_employee(employee_id) OR public.is_admin(auth.uid()))
);
CREATE POLICY corr_review ON public.attendance_corrections FOR UPDATE TO authenticated USING (
  public.is_admin(auth.uid())
  OR (public.has_role(auth.uid(),'manager') AND public.can_manage_employee(employee_id))
) WITH CHECK (
  public.is_admin(auth.uid())
  OR (public.has_role(auth.uid(),'manager') AND public.can_manage_employee(employee_id))
);
CREATE TRIGGER trg_corr_updated BEFORE UPDATE ON public.attendance_corrections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- ATTENDANCE AUDIT LOG
-- =========================
CREATE TABLE public.attendance_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id uuid REFERENCES public.attendance_records(id) ON DELETE SET NULL,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX att_audit_emp_idx ON public.attendance_audit_logs(employee_id, created_at DESC);
GRANT SELECT ON public.attendance_audit_logs TO authenticated;
GRANT ALL ON public.attendance_audit_logs TO service_role;
ALTER TABLE public.attendance_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY att_audit_select ON public.attendance_audit_logs FOR SELECT TO authenticated USING (
  public.is_admin(auth.uid()) OR public.can_manage_employee(employee_id) OR employee_id = public.current_employee_id()
);

CREATE OR REPLACE FUNCTION public.log_attendance_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.attendance_audit_logs (attendance_id, employee_id, actor_user_id, action, before_data, after_data)
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
CREATE TRIGGER trg_att_audit AFTER INSERT OR UPDATE OR DELETE ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION public.log_attendance_change();
