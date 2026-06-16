
DROP POLICY IF EXISTS "chat_attach_read" ON storage.objects;
DROP POLICY IF EXISTS "chat_attach_insert" ON storage.objects;
DROP POLICY IF EXISTS "chat_attach_delete" ON storage.objects;

-- SELECT: only members/participants of the channel/conversation encoded in the path
CREATE POLICY "chat_attach_read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND (
    (
      (storage.foldername(name))[1] = 'channel'
      AND public.is_channel_member(((storage.foldername(name))[2])::uuid)
    )
    OR (
      (storage.foldername(name))[1] = 'conv'
      AND public.is_conversation_participant(((storage.foldername(name))[2])::uuid)
    )
  )
);

-- INSERT: must be a member/participant AND must place file in own uid subfolder
CREATE POLICY "chat_attach_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND (storage.foldername(name))[3] = auth.uid()::text
  AND (
    (
      (storage.foldername(name))[1] = 'channel'
      AND public.is_channel_member(((storage.foldername(name))[2])::uuid)
    )
    OR (
      (storage.foldername(name))[1] = 'conv'
      AND public.is_conversation_participant(((storage.foldername(name))[2])::uuid)
    )
  )
);

-- DELETE: uploader (owns the uid subfolder) can delete their own attachments
CREATE POLICY "chat_attach_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND (storage.foldername(name))[3] = auth.uid()::text
);
