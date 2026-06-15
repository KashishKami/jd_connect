
-- =========================================================
-- SALES SOURCES
-- =========================================================
CREATE TABLE public.sales_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sales_sources TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.sales_sources TO authenticated;
GRANT ALL ON public.sales_sources TO service_role;
ALTER TABLE public.sales_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sources viewable by all auth" ON public.sales_sources FOR SELECT TO authenticated USING (true);
CREATE POLICY "Sources manageable by admins" ON public.sales_sources FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER trg_sales_sources_updated BEFORE UPDATE ON public.sales_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- HELPER: can_enter_sales_for(_employee_id)
-- =========================================================
CREATE OR REPLACE FUNCTION public.can_enter_sales_for(_employee_id uuid)
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

CREATE OR REPLACE FUNCTION public.can_view_sales_for(_employee_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _employee_id = public.current_employee_id()
    OR public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = _employee_id
        AND (
          (public.has_role(auth.uid(),'manager') AND e.manager_id = public.current_employee_id())
          OR (public.has_role(auth.uid(),'team_leader') AND e.team_leader_id = public.current_employee_id())
        )
    )
$$;

-- =========================================================
-- SALES ENTRIES
-- =========================================================
CREATE TABLE public.sales_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_date date NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  sales_count integer NOT NULL DEFAULT 0 CHECK (sales_count >= 0),
  sales_amount_usd numeric(14,2) NOT NULL DEFAULT 0 CHECK (sales_amount_usd >= 0),
  source_id uuid REFERENCES public.sales_sources(id) ON DELETE SET NULL,
  notes text,
  entered_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sales_entries_emp_date ON public.sales_entries(employee_id, sale_date);
CREATE INDEX idx_sales_entries_date ON public.sales_entries(sale_date);
CREATE INDEX idx_sales_entries_source ON public.sales_entries(source_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_entries TO authenticated;
GRANT ALL ON public.sales_entries TO service_role;
ALTER TABLE public.sales_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sales view by scope" ON public.sales_entries FOR SELECT TO authenticated
  USING (public.can_view_sales_for(employee_id));
CREATE POLICY "Sales insert by managers" ON public.sales_entries FOR INSERT TO authenticated
  WITH CHECK (public.can_enter_sales_for(employee_id));
CREATE POLICY "Sales update by managers" ON public.sales_entries FOR UPDATE TO authenticated
  USING (public.can_enter_sales_for(employee_id)) WITH CHECK (public.can_enter_sales_for(employee_id));
CREATE POLICY "Sales delete by admins" ON public.sales_entries FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE TRIGGER trg_sales_entries_updated BEFORE UPDATE ON public.sales_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- REFUND ENTRIES
-- =========================================================
CREATE TABLE public.refund_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_date date NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  amount_usd numeric(14,2) NOT NULL CHECK (amount_usd >= 0),
  reason text,
  entered_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_refunds_emp_date ON public.refund_entries(employee_id, refund_date);
CREATE INDEX idx_refunds_date ON public.refund_entries(refund_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.refund_entries TO authenticated;
GRANT ALL ON public.refund_entries TO service_role;
ALTER TABLE public.refund_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Refund view by scope" ON public.refund_entries FOR SELECT TO authenticated
  USING (public.can_view_sales_for(employee_id));
CREATE POLICY "Refund insert by managers" ON public.refund_entries FOR INSERT TO authenticated
  WITH CHECK (public.can_enter_sales_for(employee_id));
CREATE POLICY "Refund update by managers" ON public.refund_entries FOR UPDATE TO authenticated
  USING (public.can_enter_sales_for(employee_id)) WITH CHECK (public.can_enter_sales_for(employee_id));
CREATE POLICY "Refund delete by admins" ON public.refund_entries FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE TRIGGER trg_refunds_updated BEFORE UPDATE ON public.refund_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- CHARGEBACK ENTRIES
-- =========================================================
CREATE TABLE public.chargeback_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chargeback_date date NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  amount_usd numeric(14,2) NOT NULL CHECK (amount_usd >= 0),
  reason text,
  entered_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_chargebacks_emp_date ON public.chargeback_entries(employee_id, chargeback_date);
CREATE INDEX idx_chargebacks_date ON public.chargeback_entries(chargeback_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chargeback_entries TO authenticated;
GRANT ALL ON public.chargeback_entries TO service_role;
ALTER TABLE public.chargeback_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CB view by scope" ON public.chargeback_entries FOR SELECT TO authenticated
  USING (public.can_view_sales_for(employee_id));
CREATE POLICY "CB insert by managers" ON public.chargeback_entries FOR INSERT TO authenticated
  WITH CHECK (public.can_enter_sales_for(employee_id));
CREATE POLICY "CB update by managers" ON public.chargeback_entries FOR UPDATE TO authenticated
  USING (public.can_enter_sales_for(employee_id)) WITH CHECK (public.can_enter_sales_for(employee_id));
CREATE POLICY "CB delete by admins" ON public.chargeback_entries FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE TRIGGER trg_chargebacks_updated BEFORE UPDATE ON public.chargeback_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- SALES AUDIT LOGS
-- =========================================================
CREATE TABLE public.sales_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity text NOT NULL,
  entity_id uuid NOT NULL,
  employee_id uuid,
  action text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sales_audit_entity ON public.sales_audit_logs(entity, entity_id);
GRANT SELECT ON public.sales_audit_logs TO authenticated;
GRANT ALL ON public.sales_audit_logs TO service_role;
ALTER TABLE public.sales_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Audit view by admins" ON public.sales_audit_logs FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.log_sales_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.sales_audit_logs (entity, entity_id, employee_id, action, before_data, after_data, actor_user_id)
  VALUES (
    TG_ARGV[0],
    COALESCE(NEW.id, OLD.id),
    COALESCE(NEW.employee_id, OLD.employee_id),
    TG_OP,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END,
    auth.uid()
  );
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_audit_sales AFTER INSERT OR UPDATE OR DELETE ON public.sales_entries
  FOR EACH ROW EXECUTE FUNCTION public.log_sales_change('sales_entry');
CREATE TRIGGER trg_audit_refunds AFTER INSERT OR UPDATE OR DELETE ON public.refund_entries
  FOR EACH ROW EXECUTE FUNCTION public.log_sales_change('refund_entry');
CREATE TRIGGER trg_audit_chargebacks AFTER INSERT OR UPDATE OR DELETE ON public.chargeback_entries
  FOR EACH ROW EXECUTE FUNCTION public.log_sales_change('chargeback_entry');

-- =========================================================
-- PERFORMANCE SNAPSHOTS (optional cache)
-- =========================================================
CREATE TABLE public.performance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period_type text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  sales_count integer NOT NULL DEFAULT 0,
  gross_revenue numeric(14,2) NOT NULL DEFAULT 0,
  refunds numeric(14,2) NOT NULL DEFAULT 0,
  chargebacks numeric(14,2) NOT NULL DEFAULT 0,
  net_revenue numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, period_type, period_start)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.performance_snapshots TO authenticated;
GRANT ALL ON public.performance_snapshots TO service_role;
ALTER TABLE public.performance_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Snapshots view by scope" ON public.performance_snapshots FOR SELECT TO authenticated
  USING (public.can_view_sales_for(employee_id));
CREATE POLICY "Snapshots manage by admins" ON public.performance_snapshots FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- =========================================================
-- ANALYTICS RPCs
-- =========================================================
CREATE OR REPLACE FUNCTION public.agent_performance(_employee_id uuid, _from date, _to date)
RETURNS TABLE(sales_count bigint, gross_revenue numeric, refunds numeric, chargebacks numeric, net_revenue numeric, avg_sale numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (
    SELECT COALESCE(SUM(sales_count),0)::bigint AS cnt, COALESCE(SUM(sales_amount_usd),0)::numeric AS gross
    FROM public.sales_entries WHERE employee_id=_employee_id AND sale_date BETWEEN _from AND _to
  ),
  r AS (SELECT COALESCE(SUM(amount_usd),0)::numeric AS amt FROM public.refund_entries WHERE employee_id=_employee_id AND refund_date BETWEEN _from AND _to),
  c AS (SELECT COALESCE(SUM(amount_usd),0)::numeric AS amt FROM public.chargeback_entries WHERE employee_id=_employee_id AND chargeback_date BETWEEN _from AND _to)
  SELECT s.cnt, s.gross, r.amt, c.amt, (s.gross - r.amt - c.amt),
         CASE WHEN s.cnt > 0 THEN ROUND(s.gross / s.cnt, 2) ELSE 0 END
  FROM s, r, c;
$$;

CREATE OR REPLACE FUNCTION public.leaderboard(_from date, _to date, _limit int DEFAULT 20)
RETURNS TABLE(employee_id uuid, full_name text, employee_code text, sales_count bigint, gross_revenue numeric, refunds numeric, chargebacks numeric, net_revenue numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (
    SELECT employee_id, SUM(sales_count) cnt, SUM(sales_amount_usd) gross
    FROM public.sales_entries WHERE sale_date BETWEEN _from AND _to GROUP BY employee_id
  ),
  r AS (SELECT employee_id, SUM(amount_usd) amt FROM public.refund_entries WHERE refund_date BETWEEN _from AND _to GROUP BY employee_id),
  c AS (SELECT employee_id, SUM(amount_usd) amt FROM public.chargeback_entries WHERE chargeback_date BETWEEN _from AND _to GROUP BY employee_id)
  SELECT e.id, e.full_name, e.employee_code,
         COALESCE(s.cnt,0)::bigint, COALESCE(s.gross,0)::numeric,
         COALESCE(r.amt,0)::numeric, COALESCE(c.amt,0)::numeric,
         (COALESCE(s.gross,0)-COALESCE(r.amt,0)-COALESCE(c.amt,0))::numeric AS net
  FROM public.employees e
  LEFT JOIN s ON s.employee_id=e.id
  LEFT JOIN r ON r.employee_id=e.id
  LEFT JOIN c ON c.employee_id=e.id
  WHERE COALESCE(s.cnt,0) > 0 OR COALESCE(r.amt,0) > 0 OR COALESCE(c.amt,0) > 0
  ORDER BY net DESC NULLS LAST
  LIMIT _limit;
$$;

CREATE OR REPLACE FUNCTION public.source_analytics(_from date, _to date)
RETURNS TABLE(source_id uuid, source_name text, sales_count bigint, gross_revenue numeric, refunds numeric, chargebacks numeric, net_revenue numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (
    SELECT source_id, SUM(sales_count) cnt, SUM(sales_amount_usd) gross
    FROM public.sales_entries WHERE sale_date BETWEEN _from AND _to GROUP BY source_id
  )
  SELECT ss.id, ss.name, COALESCE(s.cnt,0)::bigint, COALESCE(s.gross,0)::numeric,
         0::numeric, 0::numeric, COALESCE(s.gross,0)::numeric
  FROM public.sales_sources ss LEFT JOIN s ON s.source_id=ss.id
  ORDER BY COALESCE(s.gross,0) DESC;
$$;

CREATE OR REPLACE FUNCTION public.centre_comparison(_from date, _to date)
RETURNS TABLE(centre_id uuid, centre_code text, sales_count bigint, gross_revenue numeric, refunds numeric, chargebacks numeric, net_revenue numeric, present_days bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH emp AS (SELECT id, centre_id FROM public.employees),
  s AS (
    SELECT e.centre_id, SUM(se.sales_count) cnt, SUM(se.sales_amount_usd) gross
    FROM public.sales_entries se JOIN emp e ON e.id=se.employee_id
    WHERE se.sale_date BETWEEN _from AND _to GROUP BY e.centre_id
  ),
  r AS (SELECT e.centre_id, SUM(re.amount_usd) amt FROM public.refund_entries re JOIN emp e ON e.id=re.employee_id WHERE re.refund_date BETWEEN _from AND _to GROUP BY e.centre_id),
  c AS (SELECT e.centre_id, SUM(ce.amount_usd) amt FROM public.chargeback_entries ce JOIN emp e ON e.id=ce.employee_id WHERE ce.chargeback_date BETWEEN _from AND _to GROUP BY e.centre_id),
  a AS (SELECT e.centre_id, COUNT(*) days FROM public.attendance_records ar JOIN emp e ON e.id=ar.employee_id WHERE ar.work_date BETWEEN _from AND _to AND ar.status='present' GROUP BY e.centre_id)
  SELECT ce.id, ce.code, COALESCE(s.cnt,0)::bigint, COALESCE(s.gross,0)::numeric,
         COALESCE(r.amt,0)::numeric, COALESCE(c.amt,0)::numeric,
         (COALESCE(s.gross,0)-COALESCE(r.amt,0)-COALESCE(c.amt,0))::numeric,
         COALESCE(a.days,0)::bigint
  FROM public.centres ce
  LEFT JOIN s ON s.centre_id=ce.id
  LEFT JOIN r ON r.centre_id=ce.id
  LEFT JOIN c ON c.centre_id=ce.id
  LEFT JOIN a ON a.centre_id=ce.id
  ORDER BY ce.code;
$$;

CREATE OR REPLACE FUNCTION public.company_dashboard(_from date, _to date)
RETURNS TABLE(gross_revenue numeric, refunds numeric, chargebacks numeric, net_revenue numeric,
              logged_in bigint, on_break bigint, present_today bigint, absent_today bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH g AS (SELECT COALESCE(SUM(sales_amount_usd),0) gross FROM public.sales_entries WHERE sale_date BETWEEN _from AND _to),
  r AS (SELECT COALESCE(SUM(amount_usd),0) amt FROM public.refund_entries WHERE refund_date BETWEEN _from AND _to),
  c AS (SELECT COALESCE(SUM(amount_usd),0) amt FROM public.chargeback_entries WHERE chargeback_date BETWEEN _from AND _to),
  li AS (SELECT COUNT(DISTINCT employee_id) n FROM public.attendance_records WHERE work_date=CURRENT_DATE AND login_at IS NOT NULL AND logout_at IS NULL),
  ob AS (SELECT COUNT(DISTINCT employee_id) n FROM public.break_records WHERE status='active'),
  pt AS (SELECT COUNT(*) n FROM public.attendance_records WHERE work_date=CURRENT_DATE AND status='present'),
  ab AS (SELECT COUNT(*) n FROM public.attendance_records WHERE work_date=CURRENT_DATE AND status='absent')
  SELECT g.gross, r.amt, c.amt, (g.gross - r.amt - c.amt),
         li.n::bigint, ob.n::bigint, pt.n::bigint, ab.n::bigint
  FROM g, r, c, li, ob, pt, ab;
$$;

CREATE OR REPLACE FUNCTION public.team_performance(_team_leader_id uuid, _from date, _to date)
RETURNS TABLE(employee_id uuid, full_name text, employee_code text, sales_count bigint, gross_revenue numeric, refunds numeric, chargebacks numeric, net_revenue numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH team AS (SELECT id, full_name, employee_code FROM public.employees WHERE team_leader_id=_team_leader_id OR manager_id=_team_leader_id),
  s AS (SELECT employee_id, SUM(sales_count) cnt, SUM(sales_amount_usd) gross FROM public.sales_entries WHERE sale_date BETWEEN _from AND _to GROUP BY employee_id),
  r AS (SELECT employee_id, SUM(amount_usd) amt FROM public.refund_entries WHERE refund_date BETWEEN _from AND _to GROUP BY employee_id),
  c AS (SELECT employee_id, SUM(amount_usd) amt FROM public.chargeback_entries WHERE chargeback_date BETWEEN _from AND _to GROUP BY employee_id)
  SELECT t.id, t.full_name, t.employee_code,
         COALESCE(s.cnt,0)::bigint, COALESCE(s.gross,0)::numeric,
         COALESCE(r.amt,0)::numeric, COALESCE(c.amt,0)::numeric,
         (COALESCE(s.gross,0)-COALESCE(r.amt,0)-COALESCE(c.amt,0))::numeric
  FROM team t
  LEFT JOIN s ON s.employee_id=t.id
  LEFT JOIN r ON r.employee_id=t.id
  LEFT JOIN c ON c.employee_id=t.id
  ORDER BY (COALESCE(s.gross,0)-COALESCE(r.amt,0)-COALESCE(c.amt,0)) DESC;
$$;

-- =========================================================
-- SEED DEFAULT SOURCES
-- =========================================================
INSERT INTO public.sales_sources (name, slug) VALUES
  ('Tagore FB','tagore_fb'),('UPP FB','upp_fb'),('Tagore PPC','tagore_ppc'),
  ('JD FB','jd_fb'),('JD PPC','jd_ppc'),('AET FB','aet_fb'),
  ('Inhouse FB','inhouse_fb'),('Inhouse PPC','inhouse_ppc')
ON CONFLICT DO NOTHING;
