-- Prevent regular employees from modifying pending channel join request details.
-- They can still cancel by deleting their own request via the existing delete rule.
DROP POLICY IF EXISTS cjr_update ON public.channel_join_requests;
CREATE POLICY cjr_update ON public.channel_join_requests
FOR UPDATE TO authenticated
USING (
  public.is_channel_moderator(channel_id)
  OR public.is_admin(auth.uid())
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
)
WITH CHECK (
  public.is_channel_moderator(channel_id)
  OR public.is_admin(auth.uid())
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
);

-- Allow owners/admins to manage draft or active documents, but not archived ones.
-- This unblocks the intended create-draft -> upload file -> create version -> publish flow
-- without reopening the archived-document modification bypass.
CREATE OR REPLACE FUNCTION public.can_manage_document(_document_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.documents
    WHERE id = _document_id
      AND status IN ('draft'::public.document_status, 'active'::public.document_status)
  )
  AND (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.documents d
      WHERE d.id = _document_id
        AND d.uploaded_by = public.current_employee_id()
    )
  )
$$;