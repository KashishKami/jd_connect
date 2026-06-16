
-- Channel members: remove self-join loophole
DROP POLICY IF EXISTS "cmem_insert" ON public.channel_members;
CREATE POLICY "cmem_insert" ON public.channel_members FOR INSERT TO authenticated
WITH CHECK (
  public.can_create_channel()
  OR public.is_channel_moderator(channel_id)
);

-- Tighten can_manage_document: do not allow modifications on archived/deleted documents
CREATE OR REPLACE FUNCTION public.can_manage_document(_document_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.documents
    WHERE id = _document_id
      AND status = 'active'
  )
  AND (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = _document_id
        AND d.uploaded_by = public.current_employee_id()
    )
  )
$$;
