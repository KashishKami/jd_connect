-- Tighten channels visibility: members + admins/managers only.
DROP POLICY IF EXISTS chan_select ON public.channels;
CREATE POLICY chan_select ON public.channels
FOR SELECT TO authenticated
USING (
  public.is_channel_member(id)
  OR public.is_admin(auth.uid())
  OR public.has_role(auth.uid(), 'manager'::app_role)
);

-- Lock down channel_join_requests inserts to admins/managers/moderators only.
DROP POLICY IF EXISTS cjr_insert ON public.channel_join_requests;
DROP POLICY IF EXISTS "Users insert own join requests" ON public.channel_join_requests;
DROP POLICY IF EXISTS cjr_insert_self ON public.channel_join_requests;
CREATE POLICY cjr_insert_admin ON public.channel_join_requests
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.is_channel_moderator(channel_id)
);