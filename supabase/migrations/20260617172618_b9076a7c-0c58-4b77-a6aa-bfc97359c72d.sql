-- Clean orphan channel_members and conversation_participants and add FKs
DELETE FROM public.channel_members cm WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = cm.employee_id);
DELETE FROM public.conversation_participants cp WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = cp.employee_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='channel_members_employee_id_fkey' AND conrelid='public.channel_members'::regclass) THEN
    ALTER TABLE public.channel_members ADD CONSTRAINT channel_members_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='conversation_participants_employee_id_fkey' AND conrelid='public.conversation_participants'::regclass) THEN
    ALTER TABLE public.conversation_participants ADD CONSTRAINT conversation_participants_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Make handle_new_message resilient: skip recipients with no employee row
CREATE OR REPLACE FUNCTION public.handle_new_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sender_name text;
  v_channel_name text;
  v_recipient uuid;
BEGIN
  SELECT full_name INTO v_sender_name FROM public.employees WHERE id = NEW.sender_id;

  IF NEW.conversation_id IS NOT NULL THEN
    UPDATE public.conversations SET last_message_at = NEW.created_at, updated_at = now() WHERE id = NEW.conversation_id;
    FOR v_recipient IN
      SELECT cp.employee_id FROM public.conversation_participants cp
      JOIN public.employees e ON e.id = cp.employee_id
      WHERE cp.conversation_id = NEW.conversation_id AND cp.employee_id <> NEW.sender_id
    LOOP
      INSERT INTO public.notifications(employee_id,type,title,body,link,ref_id)
      VALUES (v_recipient,'direct_message','New message from '||COALESCE(v_sender_name,'employee'),
              LEFT(NEW.body,140),'/chat/'||NEW.conversation_id::text,NEW.id);
    END LOOP;
  ELSIF NEW.channel_id IS NOT NULL THEN
    SELECT name INTO v_channel_name FROM public.channels WHERE id = NEW.channel_id;
    UPDATE public.channels SET last_message_at = NEW.created_at, updated_at = now() WHERE id = NEW.channel_id;
    FOR v_recipient IN
      SELECT cm.employee_id FROM public.channel_members cm
      JOIN public.employees e ON e.id = cm.employee_id
      WHERE cm.channel_id = NEW.channel_id AND cm.employee_id <> NEW.sender_id
    LOOP
      INSERT INTO public.notifications(employee_id,type,title,body,link,ref_id)
      VALUES (v_recipient,'channel_message','New message in #'||COALESCE(v_channel_name,'channel'),
              LEFT(NEW.body,140),'/channels/'||NEW.channel_id::text,NEW.id);
    END LOOP;
  END IF;
  RETURN NEW;
END $function$;