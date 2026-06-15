
-- Profile photos: allow each employee to upload/update files inside their own folder.
DROP POLICY IF EXISTS profile_photos_write ON storage.objects;
CREATE POLICY profile_photos_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'profile-photos'
    AND (
      public.is_admin(auth.uid())
      OR (storage.foldername(name))[1] = public.current_employee_id()::text
    )
  );

DROP POLICY IF EXISTS profile_photos_update ON storage.objects;
CREATE POLICY profile_photos_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'profile-photos'
    AND (
      public.is_admin(auth.uid())
      OR (storage.foldername(name))[1] = public.current_employee_id()::text
    )
  )
  WITH CHECK (
    bucket_id = 'profile-photos'
    AND (
      public.is_admin(auth.uid())
      OR (storage.foldername(name))[1] = public.current_employee_id()::text
    )
  );

DROP POLICY IF EXISTS profile_photos_delete ON storage.objects;
CREATE POLICY profile_photos_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'profile-photos'
    AND (
      public.is_admin(auth.uid())
      OR (storage.foldername(name))[1] = public.current_employee_id()::text
    )
  );

-- Realtime: extend topic policy to also cover chat channel topics ("chan-<uuid>").
DROP POLICY IF EXISTS "jd_realtime_topic_select" ON realtime.messages;
CREATE POLICY "jd_realtime_topic_select" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    realtime.topic() = 'notif-' || public.current_employee_id()::text
    OR realtime.topic() = 'conv-list-' || public.current_employee_id()::text
    OR (
      realtime.topic() LIKE 'conv-%'
      AND length(realtime.topic()) = 41
      AND public.is_conversation_participant(
        NULLIF(substring(realtime.topic() from 6), '')::uuid
      )
    )
    OR (
      realtime.topic() LIKE 'chan-%'
      AND length(realtime.topic()) = 41
      AND public.is_channel_member(
        NULLIF(substring(realtime.topic() from 6), '')::uuid
      )
    )
    OR public.is_admin(auth.uid())
  );
