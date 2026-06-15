-- 1) Make audit-log write boundary explicit. SECURITY DEFINER triggers
--    bypass RLS, so a WITH CHECK (false) INSERT policy blocks any direct
--    client/role insert while leaving trigger writes untouched.

DROP POLICY IF EXISTS att_audit_no_direct_insert ON public.attendance_audit_logs;
CREATE POLICY att_audit_no_direct_insert
  ON public.attendance_audit_logs
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (false);

DROP POLICY IF EXISTS sales_audit_no_direct_insert ON public.sales_audit_logs;
CREATE POLICY sales_audit_no_direct_insert
  ON public.sales_audit_logs
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (false);

DROP POLICY IF EXISTS break_audit_no_direct_insert ON public.break_audit_logs;
CREATE POLICY break_audit_no_direct_insert
  ON public.break_audit_logs
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (false);

-- 2) Tighten announcements SELECT so department/centre-scoped announcements
--    are not broadcast to all authenticated users (incl. via Realtime).

DROP POLICY IF EXISTS ann_select ON public.announcements;
CREATE POLICY ann_select
  ON public.announcements
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR (centre_id IS NULL AND department_id IS NULL)
    OR (
      centre_id IS NOT NULL
      AND centre_id = (
        SELECT e.centre_id FROM public.employees e WHERE e.auth_user_id = auth.uid()
      )
    )
    OR (
      department_id IS NOT NULL
      AND department_id = (
        SELECT e.department_id FROM public.employees e WHERE e.auth_user_id = auth.uid()
      )
    )
  );