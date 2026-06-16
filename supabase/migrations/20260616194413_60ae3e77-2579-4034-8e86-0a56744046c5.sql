
-- 1. Gate document creation by the granular 'documents.upload' permission.
DROP POLICY IF EXISTS "Admins and managers can create documents" ON public.documents;
DROP POLICY IF EXISTS "Authenticated can create documents" ON public.documents;
CREATE POLICY "Upload requires documents.upload permission"
ON public.documents FOR INSERT TO authenticated
WITH CHECK (
  (public.is_admin(auth.uid()) OR public.has_permission(auth.uid(), 'documents.upload'))
  AND (uploaded_by = public.current_employee_id() OR public.is_admin(auth.uid()))
);

-- Versions: same gate (admins + uploaders of the document)
DROP POLICY IF EXISTS "Admins and managers can add versions" ON public.document_versions;
CREATE POLICY "Add version requires documents.upload permission"
ON public.document_versions FOR INSERT TO authenticated
WITH CHECK (
  (public.is_admin(auth.uid()) OR public.has_permission(auth.uid(), 'documents.upload'))
  AND public.can_manage_document(document_id)
);

-- 2. Clean up notifications when a user is removed from a channel,
--    so they don't keep seeing stale 'New message in #channel' alerts.
CREATE OR REPLACE FUNCTION public.cleanup_channel_notifications_on_leave()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT auth_user_id INTO v_user_id FROM public.employees WHERE id = OLD.employee_id;
  IF v_user_id IS NOT NULL THEN
    DELETE FROM public.notifications
    WHERE employee_id = OLD.employee_id
      AND type IN ('channel_message','channel_mention')
      AND (link = '/channels/' || OLD.channel_id::text);
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_cleanup_channel_notifs ON public.channel_members;
CREATE TRIGGER trg_cleanup_channel_notifs
AFTER DELETE ON public.channel_members
FOR EACH ROW EXECUTE FUNCTION public.cleanup_channel_notifications_on_leave();

-- One-time cleanup: remove channel notifications for employees who are no longer members.
DELETE FROM public.notifications n
WHERE n.type IN ('channel_message','channel_mention')
  AND n.link LIKE '/channels/%'
  AND NOT EXISTS (
    SELECT 1 FROM public.channel_members cm
    WHERE cm.employee_id = n.employee_id
      AND cm.channel_id::text = replace(n.link, '/channels/', '')
  );
