CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS parent_message_id uuid REFERENCES public.messages(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_messages_parent ON public.messages(parent_message_id) WHERE parent_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_pinned ON public.messages(channel_id) WHERE is_pinned = true;
CREATE INDEX IF NOT EXISTS idx_messages_body_trgm ON public.messages USING gin (body gin_trgm_ops);

CREATE TABLE IF NOT EXISTS public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, employee_id, emoji)
);

GRANT SELECT, INSERT, DELETE ON public.message_reactions TO authenticated;
GRANT ALL ON public.message_reactions TO service_role;

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "react_select" ON public.message_reactions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_reactions.message_id
      AND (
        (m.channel_id IS NOT NULL AND public.is_channel_member(m.channel_id))
        OR (m.conversation_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.conversation_participants cp
          WHERE cp.conversation_id = m.conversation_id
            AND cp.employee_id = (SELECT id FROM public.employees WHERE auth_user_id = auth.uid())
        ))
        OR public.is_admin(auth.uid())
      )
  )
);

CREATE POLICY "react_insert_own" ON public.message_reactions FOR INSERT TO authenticated
WITH CHECK (
  employee_id = (SELECT id FROM public.employees WHERE auth_user_id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_reactions.message_id
      AND (
        (m.channel_id IS NOT NULL AND public.is_channel_member(m.channel_id))
        OR (m.conversation_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.conversation_participants cp
          WHERE cp.conversation_id = m.conversation_id
            AND cp.employee_id = (SELECT id FROM public.employees WHERE auth_user_id = auth.uid())
        ))
      )
  )
);

CREATE POLICY "react_delete_own" ON public.message_reactions FOR DELETE TO authenticated
USING (employee_id = (SELECT id FROM public.employees WHERE auth_user_id = auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;