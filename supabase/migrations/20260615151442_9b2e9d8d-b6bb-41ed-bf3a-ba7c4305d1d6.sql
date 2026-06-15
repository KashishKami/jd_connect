
DROP POLICY IF EXISTS "break_policies readable by authenticated" ON public.break_policies;
CREATE POLICY "break_policies readable by managers and admins"
ON public.break_policies FOR SELECT TO authenticated
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'manager'::app_role));

DROP POLICY IF EXISTS "Authenticated can create documents" ON public.documents;
CREATE POLICY "Admins and managers can create documents"
ON public.documents FOR INSERT TO authenticated
WITH CHECK (
  (is_admin(auth.uid()) OR has_role(auth.uid(), 'manager'::app_role))
  AND (uploaded_by = current_employee_id() OR is_admin(auth.uid()))
);

DROP POLICY IF EXISTS "Manage versions" ON public.document_versions;
CREATE POLICY "Admins and managers can add versions"
ON public.document_versions FOR INSERT TO authenticated
WITH CHECK (
  (is_admin(auth.uid()) OR has_role(auth.uid(), 'manager'::app_role))
  AND can_manage_document(document_id)
);
