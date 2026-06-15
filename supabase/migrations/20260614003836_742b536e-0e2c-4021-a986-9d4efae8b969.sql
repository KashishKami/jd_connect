
-- 1) Notifications: only admins may insert directly. Triggers run SECURITY DEFINER as table owner (BYPASSRLS) so fan-out still works.
DROP POLICY IF EXISTS notif_insert ON public.notifications;
CREATE POLICY notif_insert ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

-- 2) Break audit logs: only admins may insert directly. Trigger log_break_change is SECURITY DEFINER.
DROP POLICY IF EXISTS "break_audit_logs insert (system)" ON public.break_audit_logs;
CREATE POLICY break_audit_logs_insert_admin ON public.break_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

-- 3) Conversation participants: tighten insert. Allow self-add to a conversation you already belong to,
--    the conversation creator may add others, or admins.
DROP POLICY IF EXISTS cp_insert ON public.conversation_participants;
CREATE POLICY cp_insert ON public.conversation_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id AND c.created_by = public.current_employee_id()
    )
    OR (
      employee_id = public.current_employee_id()
      AND public.is_conversation_participant(conversation_id)
    )
  );

-- 4) Realtime authorization: restrict topic subscriptions.
DROP POLICY IF EXISTS "jd_realtime_topic_select" ON realtime.messages;
CREATE POLICY "jd_realtime_topic_select" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    -- self notifications channel
    realtime.topic() = 'notif-' || public.current_employee_id()::text
    -- self conversation list channel
    OR realtime.topic() = 'conv-list-' || public.current_employee_id()::text
    -- per-conversation channel: must be participant
    OR (
      realtime.topic() LIKE 'conv-%'
      AND length(realtime.topic()) = 41 -- 'conv-' + 36-char uuid
      AND public.is_conversation_participant(
        NULLIF(substring(realtime.topic() from 6), '')::uuid
      )
    )
    -- admins can subscribe to anything
    OR public.is_admin(auth.uid())
  );
