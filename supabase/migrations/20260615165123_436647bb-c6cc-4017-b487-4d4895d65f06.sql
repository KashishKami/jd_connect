
CREATE OR REPLACE FUNCTION public.start_direct_chat(_other uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _me uuid;
  _conv uuid;
BEGIN
  _me := public.current_employee_id();
  IF _me IS NULL THEN
    RAISE EXCEPTION 'No employee record linked to current user';
  END IF;
  IF _other IS NULL OR _other = _me THEN
    RAISE EXCEPTION 'Invalid other participant';
  END IF;

  -- Try to find existing direct conversation between the two
  SELECT c.id INTO _conv
  FROM public.conversations c
  JOIN public.conversation_participants p1 ON p1.conversation_id = c.id AND p1.employee_id = _me
  JOIN public.conversation_participants p2 ON p2.conversation_id = c.id AND p2.employee_id = _other
  WHERE c.type = 'direct'
  LIMIT 1;

  IF _conv IS NOT NULL THEN
    RETURN _conv;
  END IF;

  INSERT INTO public.conversations (type, created_by)
  VALUES ('direct', _me)
  RETURNING id INTO _conv;

  INSERT INTO public.conversation_participants (conversation_id, employee_id)
  VALUES (_conv, _me), (_conv, _other);

  RETURN _conv;
END;
$$;

REVOKE ALL ON FUNCTION public.start_direct_chat(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_direct_chat(uuid) TO authenticated;
