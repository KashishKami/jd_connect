CREATE OR REPLACE FUNCTION public.mark_conversation_read(_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id uuid;
BEGIN
  v_employee_id := public.current_employee_id();

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants
    WHERE conversation_id = _conversation_id
      AND employee_id = v_employee_id
  ) THEN
    RAISE EXCEPTION 'Not a participant';
  END IF;

  UPDATE public.conversation_participants
  SET last_read_at = now()
  WHERE conversation_id = _conversation_id
    AND employee_id = v_employee_id;

  UPDATE public.messages
  SET status = 'read', read_at = COALESCE(read_at, now())
  WHERE conversation_id = _conversation_id
    AND sender_id <> v_employee_id
    AND status <> 'read';

  UPDATE public.notifications
  SET is_read = true
  WHERE employee_id = v_employee_id
    AND is_read = false
    AND type = 'direct_message'
    AND (
      link = '/chat/' || _conversation_id::text
      OR ref_id IN (
        SELECT id
        FROM public.messages
        WHERE conversation_id = _conversation_id
      )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_channel_read(_channel_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id uuid;
BEGIN
  v_employee_id := public.current_employee_id();

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.channel_members
    WHERE channel_id = _channel_id
      AND employee_id = v_employee_id
  ) THEN
    RAISE EXCEPTION 'Not a channel member';
  END IF;

  UPDATE public.channel_members
  SET last_read_at = now()
  WHERE channel_id = _channel_id
    AND employee_id = v_employee_id;

  UPDATE public.notifications
  SET is_read = true
  WHERE employee_id = v_employee_id
    AND is_read = false
    AND type IN ('channel_message', 'channel_mention')
    AND (
      link = '/channels/' || _channel_id::text
      OR ref_id IN (
        SELECT id
        FROM public.messages
        WHERE channel_id = _channel_id
      )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_channel_read(uuid) TO authenticated;