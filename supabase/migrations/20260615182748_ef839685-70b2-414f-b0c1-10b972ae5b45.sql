DROP POLICY IF EXISTS "jd_realtime_topic_select" ON realtime.messages;

CREATE POLICY "jd_realtime_topic_select" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    -- notification bell for the signed-in employee
    realtime.topic() = 'notif-header-' || public.current_employee_id()::text
    OR realtime.topic() = 'notif-' || public.current_employee_id()::text

    -- direct-message list and direct-message popups for the signed-in employee
    OR realtime.topic() = 'conv-list-' || public.current_employee_id()::text
    OR realtime.topic() = 'global-messages-' || public.current_employee_id()::text
    OR realtime.topic() = 'my-conv-membership-' || public.current_employee_id()::text
    OR realtime.topic() = 'my-channel-membership-' || public.current_employee_id()::text

    -- open direct conversation thread: user must be a participant
    OR (
      realtime.topic() LIKE 'conv-%'
      AND length(realtime.topic()) = 41
      AND public.is_conversation_participant(NULLIF(substring(realtime.topic() from 6), '')::uuid)
    )

    -- open channel thread: user must be a channel member
    OR (
      realtime.topic() LIKE 'chan-%'
      AND length(realtime.topic()) = 41
      AND public.is_channel_member(NULLIF(substring(realtime.topic() from 6), '')::uuid)
    )

    -- admins can subscribe to support/debug topics
    OR public.is_admin(auth.uid())
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'channel_members'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_members';
  END IF;
END$$;

ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.channels REPLICA IDENTITY FULL;
ALTER TABLE public.channel_members REPLICA IDENTITY FULL;