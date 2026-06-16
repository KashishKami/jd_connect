
-- channel_join_requests: restrict policies to authenticated role
DROP POLICY IF EXISTS cjr_select ON public.channel_join_requests;
DROP POLICY IF EXISTS cjr_insert ON public.channel_join_requests;
DROP POLICY IF EXISTS cjr_update ON public.channel_join_requests;
DROP POLICY IF EXISTS cjr_delete ON public.channel_join_requests;

CREATE POLICY cjr_select ON public.channel_join_requests
  FOR SELECT TO authenticated
  USING (
    employee_id = public.current_employee_id()
    OR public.is_channel_moderator(channel_id)
    OR public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
  );

CREATE POLICY cjr_insert ON public.channel_join_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    employee_id = public.current_employee_id()
    AND status = 'pending'::public.channel_join_status
  );

CREATE POLICY cjr_update ON public.channel_join_requests
  FOR UPDATE TO authenticated
  USING (
    public.is_channel_moderator(channel_id)
    OR public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
    OR (employee_id = public.current_employee_id() AND status = 'pending'::public.channel_join_status)
  );

CREATE POLICY cjr_delete ON public.channel_join_requests
  FOR DELETE TO authenticated
  USING (
    employee_id = public.current_employee_id()
    OR public.is_channel_moderator(channel_id)
    OR public.is_admin(auth.uid())
  );

-- channels: scope SELECT to authenticated
DROP POLICY IF EXISTS chan_select ON public.channels;
CREATE POLICY chan_select ON public.channels
  FOR SELECT TO authenticated
  USING (
    public.is_channel_member(id)
    OR public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
    OR (is_archived = false)
  );

-- can_manage_document: require document to exist
CREATE OR REPLACE FUNCTION public.can_manage_document(_document_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.documents WHERE id = _document_id)
    AND (
      public.is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.documents d
        WHERE d.id = _document_id AND d.uploaded_by = public.current_employee_id()
      )
    )
$$;
