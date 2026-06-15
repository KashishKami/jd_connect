
-- ENUMS
CREATE TYPE public.conversation_type AS ENUM ('direct','group');
CREATE TYPE public.channel_type AS ENUM ('department','team','custom','announcement');
CREATE TYPE public.message_status AS ENUM ('sent','delivered','read');
CREATE TYPE public.announcement_priority AS ENUM ('normal','important','critical');
CREATE TYPE public.notification_type AS ENUM ('direct_message','channel_mention','channel_message','announcement','critical_announcement','channel_invitation');
CREATE TYPE public.presence_status AS ENUM ('online','offline','on_break','away');

-- CONVERSATIONS (direct messages + ad-hoc groups)
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.conversation_type NOT NULL DEFAULT 'direct',
  title text,
  created_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.conversation_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz,
  UNIQUE(conversation_id, employee_id)
);
CREATE INDEX idx_cp_conv ON public.conversation_participants(conversation_id);
CREATE INDEX idx_cp_emp ON public.conversation_participants(employee_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_participants TO authenticated;
GRANT ALL ON public.conversation_participants TO service_role;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

-- CHANNELS
CREATE TABLE public.channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  channel_type public.channel_type NOT NULL DEFAULT 'custom',
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  centre_id uuid REFERENCES public.centres(id) ON DELETE SET NULL,
  is_archived boolean NOT NULL DEFAULT false,
  is_announcement boolean NOT NULL DEFAULT false,
  last_message_at timestamptz,
  created_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channels TO authenticated;
GRANT ALL ON public.channels TO service_role;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.channel_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  is_moderator boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz,
  UNIQUE(channel_id, employee_id)
);
CREATE INDEX idx_cm_channel ON public.channel_members(channel_id);
CREATE INDEX idx_cm_emp ON public.channel_members(employee_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_members TO authenticated;
GRANT ALL ON public.channel_members TO service_role;
ALTER TABLE public.channel_members ENABLE ROW LEVEL SECURITY;

-- MESSAGES (used for both conversations and channels)
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES public.channels(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  body text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  edited_at timestamptz,
  status public.message_status NOT NULL DEFAULT 'sent',
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((conversation_id IS NOT NULL) <> (channel_id IS NOT NULL))
);
CREATE INDEX idx_msg_conv ON public.messages(conversation_id, created_at DESC);
CREATE INDEX idx_msg_channel ON public.messages(channel_id, created_at DESC);
CREATE INDEX idx_msg_sender ON public.messages(sender_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- ANNOUNCEMENTS
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  priority public.announcement_priority NOT NULL DEFAULT 'normal',
  centre_id uuid REFERENCES public.centres(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  requires_ack boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.announcement_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(announcement_id, employee_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcement_acknowledgements TO authenticated;
GRANT ALL ON public.announcement_acknowledgements TO service_role;
ALTER TABLE public.announcement_acknowledgements ENABLE ROW LEVEL SECURITY;

-- NOTIFICATIONS
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  type public.notification_type NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  ref_id uuid,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_emp ON public.notifications(employee_id, is_read, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- PRESENCE
CREATE TABLE public.employee_presence (
  employee_id uuid PRIMARY KEY REFERENCES public.employees(id) ON DELETE CASCADE,
  status public.presence_status NOT NULL DEFAULT 'offline',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_presence TO authenticated;
GRANT ALL ON public.employee_presence TO service_role;
ALTER TABLE public.employee_presence ENABLE ROW LEVEL SECURITY;

-- HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION public.is_conversation_participant(_conversation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id=_conversation_id AND employee_id=public.current_employee_id()
  )
$$;

CREATE OR REPLACE FUNCTION public.is_channel_member(_channel_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.channel_members
    WHERE channel_id=_channel_id AND employee_id=public.current_employee_id()
  )
$$;

CREATE OR REPLACE FUNCTION public.is_channel_moderator(_channel_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_admin(auth.uid())
    OR public.has_role(auth.uid(),'manager')
    OR EXISTS (
      SELECT 1 FROM public.channel_members
      WHERE channel_id=_channel_id
        AND employee_id=public.current_employee_id()
        AND is_moderator=true
    )
$$;

CREATE OR REPLACE FUNCTION public.can_create_channel()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'manager')
$$;

CREATE OR REPLACE FUNCTION public.can_post_announcement()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'manager')
$$;

-- RLS POLICIES

-- conversations: participants can read; any employee can create; creator/admin can update
CREATE POLICY "conv_select" ON public.conversations FOR SELECT TO authenticated
USING (public.is_conversation_participant(id) OR public.is_admin(auth.uid()));
CREATE POLICY "conv_insert" ON public.conversations FOR INSERT TO authenticated
WITH CHECK (created_by = public.current_employee_id() OR public.is_admin(auth.uid()));
CREATE POLICY "conv_update" ON public.conversations FOR UPDATE TO authenticated
USING (public.is_conversation_participant(id) OR public.is_admin(auth.uid()));

-- conversation_participants
CREATE POLICY "cp_select" ON public.conversation_participants FOR SELECT TO authenticated
USING (employee_id=public.current_employee_id() OR public.is_conversation_participant(conversation_id) OR public.is_admin(auth.uid()));
CREATE POLICY "cp_insert" ON public.conversation_participants FOR INSERT TO authenticated
WITH CHECK (true); -- creators add themselves + others; conversation insert already checked
CREATE POLICY "cp_update" ON public.conversation_participants FOR UPDATE TO authenticated
USING (employee_id=public.current_employee_id() OR public.is_admin(auth.uid()));
CREATE POLICY "cp_delete" ON public.conversation_participants FOR DELETE TO authenticated
USING (employee_id=public.current_employee_id() OR public.is_admin(auth.uid()));

-- channels
CREATE POLICY "chan_select" ON public.channels FOR SELECT TO authenticated
USING (public.is_channel_member(id) OR public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "chan_insert" ON public.channels FOR INSERT TO authenticated
WITH CHECK (public.can_create_channel());
CREATE POLICY "chan_update" ON public.channels FOR UPDATE TO authenticated
USING (public.can_create_channel() OR public.is_channel_moderator(id));
CREATE POLICY "chan_delete" ON public.channels FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

-- channel_members
CREATE POLICY "cmem_select" ON public.channel_members FOR SELECT TO authenticated
USING (employee_id=public.current_employee_id() OR public.is_channel_member(channel_id) OR public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "cmem_insert" ON public.channel_members FOR INSERT TO authenticated
WITH CHECK (public.can_create_channel() OR public.is_channel_moderator(channel_id) OR employee_id=public.current_employee_id());
CREATE POLICY "cmem_update" ON public.channel_members FOR UPDATE TO authenticated
USING (employee_id=public.current_employee_id() OR public.is_channel_moderator(channel_id) OR public.is_admin(auth.uid()));
CREATE POLICY "cmem_delete" ON public.channel_members FOR DELETE TO authenticated
USING (employee_id=public.current_employee_id() OR public.is_channel_moderator(channel_id) OR public.is_admin(auth.uid()));

-- messages
CREATE POLICY "msg_select" ON public.messages FOR SELECT TO authenticated
USING (
  (conversation_id IS NOT NULL AND public.is_conversation_participant(conversation_id))
  OR (channel_id IS NOT NULL AND public.is_channel_member(channel_id))
  OR public.is_admin(auth.uid())
);
CREATE POLICY "msg_insert" ON public.messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id = public.current_employee_id()
  AND (
    (conversation_id IS NOT NULL AND public.is_conversation_participant(conversation_id))
    OR (channel_id IS NOT NULL AND public.is_channel_member(channel_id))
  )
);
CREATE POLICY "msg_update" ON public.messages FOR UPDATE TO authenticated
USING (sender_id=public.current_employee_id() OR public.is_admin(auth.uid())
  OR (channel_id IS NOT NULL AND public.is_channel_moderator(channel_id)));
CREATE POLICY "msg_delete" ON public.messages FOR DELETE TO authenticated
USING (sender_id=public.current_employee_id() OR public.is_admin(auth.uid())
  OR (channel_id IS NOT NULL AND public.is_channel_moderator(channel_id)));

-- announcements
CREATE POLICY "ann_select" ON public.announcements FOR SELECT TO authenticated USING (true);
CREATE POLICY "ann_insert" ON public.announcements FOR INSERT TO authenticated
WITH CHECK (public.can_post_announcement());
CREATE POLICY "ann_update" ON public.announcements FOR UPDATE TO authenticated
USING (public.can_post_announcement());
CREATE POLICY "ann_delete" ON public.announcements FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

-- ack
CREATE POLICY "ack_select" ON public.announcement_acknowledgements FOR SELECT TO authenticated
USING (employee_id=public.current_employee_id() OR public.can_post_announcement());
CREATE POLICY "ack_insert" ON public.announcement_acknowledgements FOR INSERT TO authenticated
WITH CHECK (employee_id=public.current_employee_id());

-- notifications
CREATE POLICY "notif_select" ON public.notifications FOR SELECT TO authenticated
USING (employee_id=public.current_employee_id() OR public.is_admin(auth.uid()));
CREATE POLICY "notif_insert" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "notif_update" ON public.notifications FOR UPDATE TO authenticated
USING (employee_id=public.current_employee_id() OR public.is_admin(auth.uid()));
CREATE POLICY "notif_delete" ON public.notifications FOR DELETE TO authenticated
USING (employee_id=public.current_employee_id() OR public.is_admin(auth.uid()));

-- presence
CREATE POLICY "pres_select" ON public.employee_presence FOR SELECT TO authenticated USING (true);
CREATE POLICY "pres_upsert" ON public.employee_presence FOR INSERT TO authenticated
WITH CHECK (employee_id=public.current_employee_id());
CREATE POLICY "pres_update" ON public.employee_presence FOR UPDATE TO authenticated
USING (employee_id=public.current_employee_id());

-- TRIGGERS
CREATE TRIGGER trg_conv_updated BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_chan_updated BEFORE UPDATE ON public.channels FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_ann_updated BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_pres_updated BEFORE UPDATE ON public.employee_presence FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Bump last_message_at + create notifications
CREATE OR REPLACE FUNCTION public.handle_new_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_sender_name text;
  v_channel_name text;
  v_recipient uuid;
BEGIN
  SELECT full_name INTO v_sender_name FROM public.employees WHERE id = NEW.sender_id;

  IF NEW.conversation_id IS NOT NULL THEN
    UPDATE public.conversations SET last_message_at = NEW.created_at, updated_at = now() WHERE id = NEW.conversation_id;
    FOR v_recipient IN
      SELECT employee_id FROM public.conversation_participants
      WHERE conversation_id = NEW.conversation_id AND employee_id <> NEW.sender_id
    LOOP
      INSERT INTO public.notifications(employee_id,type,title,body,link,ref_id)
      VALUES (v_recipient,'direct_message','New message from '||COALESCE(v_sender_name,'employee'),
              LEFT(NEW.body,140),'/chat/'||NEW.conversation_id::text,NEW.id);
    END LOOP;
  ELSIF NEW.channel_id IS NOT NULL THEN
    SELECT name INTO v_channel_name FROM public.channels WHERE id = NEW.channel_id;
    UPDATE public.channels SET last_message_at = NEW.created_at, updated_at = now() WHERE id = NEW.channel_id;
    FOR v_recipient IN
      SELECT employee_id FROM public.channel_members
      WHERE channel_id = NEW.channel_id AND employee_id <> NEW.sender_id
    LOOP
      INSERT INTO public.notifications(employee_id,type,title,body,link,ref_id)
      VALUES (v_recipient,'channel_message','New message in #'||COALESCE(v_channel_name,'channel'),
              LEFT(NEW.body,140),'/channels/'||NEW.channel_id::text,NEW.id);
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_new_message AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.handle_new_message();

-- Announcement notifications
CREATE OR REPLACE FUNCTION public.handle_new_announcement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_emp uuid;
BEGIN
  FOR v_emp IN
    SELECT id FROM public.employees
    WHERE employment_status='active'
      AND (NEW.centre_id IS NULL OR centre_id = NEW.centre_id)
      AND (NEW.department_id IS NULL OR department_id = NEW.department_id)
  LOOP
    INSERT INTO public.notifications(employee_id,type,title,body,link,ref_id)
    VALUES (v_emp,
      CASE WHEN NEW.priority='critical' THEN 'critical_announcement'::public.notification_type ELSE 'announcement'::public.notification_type END,
      NEW.title, LEFT(NEW.body,140), '/announcements', NEW.id);
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_new_announcement AFTER INSERT ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.handle_new_announcement();

-- Auto-join department channels when employee dept changes
CREATE OR REPLACE FUNCTION public.sync_employee_department_channel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_chan uuid;
BEGIN
  IF NEW.department_id IS NOT NULL AND NEW.department_id IS DISTINCT FROM COALESCE(OLD.department_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    SELECT id INTO v_chan FROM public.channels WHERE channel_type='department' AND department_id=NEW.department_id LIMIT 1;
    IF v_chan IS NOT NULL THEN
      INSERT INTO public.channel_members(channel_id, employee_id) VALUES (v_chan, NEW.id) ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_emp_dept_channel AFTER INSERT OR UPDATE OF department_id ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.sync_employee_department_channel();

-- Retention cleanup
CREATE OR REPLACE FUNCTION public.purge_old_messages()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  DELETE FROM public.messages WHERE created_at < now() - interval '6 months';
$$;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.channels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.employee_presence;

-- Seed department channels for existing departments
INSERT INTO public.channels(name, description, channel_type, department_id)
SELECT 'dept-'||lower(replace(d.name,' ','-')), d.name||' Department', 'department', d.id
FROM public.departments d
WHERE NOT EXISTS (SELECT 1 FROM public.channels c WHERE c.channel_type='department' AND c.department_id=d.id);

-- Auto-add existing employees to their department channels
INSERT INTO public.channel_members(channel_id, employee_id)
SELECT c.id, e.id
FROM public.channels c
JOIN public.employees e ON e.department_id = c.department_id
WHERE c.channel_type='department'
ON CONFLICT DO NOTHING;

-- Seed an Announcements channel
INSERT INTO public.channels(name, description, channel_type, is_announcement)
SELECT 'announcements','Company-wide announcements','announcement',true
WHERE NOT EXISTS (SELECT 1 FROM public.channels WHERE channel_type='announcement');
