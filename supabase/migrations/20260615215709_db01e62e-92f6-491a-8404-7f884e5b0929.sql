
DROP POLICY IF EXISTS chan_select ON public.channels;
CREATE POLICY chan_select ON public.channels
  FOR SELECT
  USING (
    is_channel_member(id)
    OR is_admin(auth.uid())
    OR has_role(auth.uid(), 'manager'::app_role)
    OR (auth.uid() IS NOT NULL AND is_archived = false)
  );

CREATE TYPE public.channel_join_status AS ENUM ('pending','approved','rejected');

CREATE TABLE public.channel_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  status public.channel_join_status NOT NULL DEFAULT 'pending',
  note text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX channel_join_requests_unique_pending
  ON public.channel_join_requests (channel_id, employee_id)
  WHERE status = 'pending';

CREATE INDEX channel_join_requests_channel_status_idx
  ON public.channel_join_requests (channel_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_join_requests TO authenticated;
GRANT ALL ON public.channel_join_requests TO service_role;

ALTER TABLE public.channel_join_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY cjr_select ON public.channel_join_requests
  FOR SELECT
  USING (
    employee_id = current_employee_id()
    OR is_channel_moderator(channel_id)
    OR is_admin(auth.uid())
    OR has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY cjr_insert ON public.channel_join_requests
  FOR INSERT
  WITH CHECK (
    employee_id = current_employee_id()
    AND status = 'pending'
  );

CREATE POLICY cjr_update ON public.channel_join_requests
  FOR UPDATE
  USING (
    is_channel_moderator(channel_id)
    OR is_admin(auth.uid())
    OR has_role(auth.uid(), 'manager'::app_role)
    OR (employee_id = current_employee_id() AND status = 'pending')
  );

CREATE POLICY cjr_delete ON public.channel_join_requests
  FOR DELETE
  USING (
    employee_id = current_employee_id()
    OR is_channel_moderator(channel_id)
    OR is_admin(auth.uid())
  );

CREATE TRIGGER channel_join_requests_set_updated_at
  BEFORE UPDATE ON public.channel_join_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.approve_channel_join_request(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _req public.channel_join_requests%ROWTYPE;
  _decider uuid;
BEGIN
  SELECT * INTO _req FROM public.channel_join_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Join request not found'; END IF;
  IF _req.status <> 'pending' THEN RAISE EXCEPTION 'Join request is not pending'; END IF;

  IF NOT (
    public.is_channel_moderator(_req.channel_id)
    OR public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'manager'::app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorized to approve this request';
  END IF;

  _decider := public.current_employee_id();

  INSERT INTO public.channel_members (channel_id, employee_id)
  VALUES (_req.channel_id, _req.employee_id)
  ON CONFLICT DO NOTHING;

  UPDATE public.channel_join_requests
    SET status = 'approved', decided_at = now(), decided_by = _decider
    WHERE id = _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_channel_join_request(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _req public.channel_join_requests%ROWTYPE;
  _decider uuid;
BEGIN
  SELECT * INTO _req FROM public.channel_join_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Join request not found'; END IF;
  IF _req.status <> 'pending' THEN RAISE EXCEPTION 'Join request is not pending'; END IF;

  IF NOT (
    public.is_channel_moderator(_req.channel_id)
    OR public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'manager'::app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorized to reject this request';
  END IF;

  _decider := public.current_employee_id();

  UPDATE public.channel_join_requests
    SET status = 'rejected', decided_at = now(), decided_by = _decider
    WHERE id = _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_channel_join_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_channel_join_request(uuid) TO authenticated;
