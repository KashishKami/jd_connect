-- ============================================================
-- Fix: Allow thread-<parentMessageId> Realtime subscriptions
--
-- ROOT CAUSE
-- ----------
-- The ThreadPanel subscribes to a Realtime channel named
-- `thread-${parentId}` (43 chars, starts with "thread-").
-- The existing RLS policy only permits channel topics matching
-- `chan-<uuid>` (exactly 41 chars) or `conv-<uuid>` (41 chars).
-- Since `thread-<uuid>` is 43 chars and starts with "thread-",
-- it was silently blocked — real-time reply updates never fired.
--
-- FIX
-- ---
-- Extend the policy to also permit `thread-<uuid>` topics,
-- gating access on the user being a member of the channel
-- that the parent message belongs to.
-- ============================================================

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

    -- open channel feed: user must be a channel member
    OR (
      realtime.topic() LIKE 'chan-%'
      AND length(realtime.topic()) = 41
      AND public.is_channel_member(NULLIF(substring(realtime.topic() from 6), '')::uuid)
    )

    -- open message thread panel: topic = thread-<parentMessageId>
    -- user must be a member of the channel the parent message belongs to
    OR (
      realtime.topic() LIKE 'thread-%'
      AND length(realtime.topic()) = 43
      AND EXISTS (
        SELECT 1
        FROM public.messages m
        WHERE m.id = NULLIF(substring(realtime.topic() from 8), '')::uuid
          AND m.channel_id IS NOT NULL
          AND public.is_channel_member(m.channel_id)
      )
    )

    -- admins can subscribe to support/debug topics
    OR public.is_admin(auth.uid())
  );
