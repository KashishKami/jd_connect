-- 1) Explicit deny-all INSERT on audit_logs (matches attendance/break/sales audit tables)
DROP POLICY IF EXISTS audit_logs_block_client_insert ON public.audit_logs;
CREATE POLICY audit_logs_block_client_insert
  ON public.audit_logs
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (false);

-- 2) Require caller to be approved + active before document access is granted.
CREATE OR REPLACE FUNCTION public.can_access_document(_document_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH d AS (SELECT * FROM public.documents WHERE id = _document_id),
       me AS (
         SELECT id, department_id, centre_id, role_id, approval_status, employment_status
         FROM public.employees WHERE auth_user_id = auth.uid()
       )
  SELECT EXISTS (SELECT 1 FROM d)
    AND (
      public.is_admin(auth.uid())
      OR (
        EXISTS (SELECT 1 FROM me WHERE approval_status = 'approved' AND employment_status = 'active')
        AND (
          (SELECT uploaded_by FROM d) = (SELECT id FROM me)
          OR (
            (SELECT status FROM d) = 'active'
            AND (
              (SELECT visibility FROM d) = 'all'
              OR EXISTS (
                SELECT 1 FROM public.document_permissions p, me
                WHERE p.document_id = _document_id
                  AND (
                    (p.department_id IS NOT NULL AND p.department_id = me.department_id)
                    OR (p.centre_id IS NOT NULL AND p.centre_id = me.centre_id)
                    OR (p.role IS NOT NULL AND public.has_role(auth.uid(), p.role))
                    OR (p.employee_id IS NOT NULL AND p.employee_id = me.id)
                  )
              )
            )
          )
        )
      )
    )
$function$;