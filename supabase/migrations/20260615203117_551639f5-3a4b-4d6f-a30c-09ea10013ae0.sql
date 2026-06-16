REVOKE EXECUTE ON FUNCTION public.mark_conversation_read(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_conversation_read(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.mark_channel_read(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_channel_read(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_channel_read(uuid) TO authenticated;