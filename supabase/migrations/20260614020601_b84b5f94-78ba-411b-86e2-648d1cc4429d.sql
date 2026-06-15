
-- =========================================================
-- 1) DOCUMENT AUDIT LOG: remove forgery vector
-- =========================================================

-- Drop the open INSERT policy that let any authenticated user
-- write arbitrary audit rows.
DROP POLICY IF EXISTS "Insert audit" ON public.document_audit_logs;

-- SECURITY DEFINER helper. The caller can only log actions for
-- documents they are allowed to access (view/download/favorite)
-- or manage (upload/version/archive/restore). The function always
-- stamps the real auth.uid() and resolves employee_id on the server.
CREATE OR REPLACE FUNCTION public.log_document_action(
  _document_id uuid,
  _action public.document_audit_action,
  _metadata jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _emp uuid;
  _id  uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF _document_id IS NULL THEN
    RAISE EXCEPTION 'document_id required';
  END IF;

  -- Permission check based on the kind of action being recorded.
  IF _action IN ('upload', 'version', 'archive', 'restore', 'delete', 'edit') THEN
    IF NOT public.can_manage_document(_document_id) THEN
      RAISE EXCEPTION 'not allowed to manage document %', _document_id
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public.can_access_document(_document_id) THEN
      RAISE EXCEPTION 'not allowed to access document %', _document_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT id INTO _emp FROM public.employees WHERE auth_user_id = _uid LIMIT 1;

  INSERT INTO public.document_audit_logs(
    document_id, employee_id, actor_user_id, action, metadata
  ) VALUES (
    _document_id, _emp, _uid, _action, _metadata
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_document_action(uuid, public.document_audit_action, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_document_action(uuid, public.document_audit_action, jsonb) TO authenticated;

-- =========================================================
-- 2) MOVE EXTENSIONS OUT OF PUBLIC SCHEMA
-- =========================================================

CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

ALTER EXTENSION pg_trgm SET SCHEMA extensions;
ALTER EXTENSION vector  SET SCHEMA extensions;

-- Functions that reference the moved types/operators must keep
-- 'extensions' on their search_path so existing SQL keeps resolving.
ALTER FUNCTION public.match_knowledge(vector, integer, double precision)
  SET search_path = public, extensions;

ALTER FUNCTION public.search_employee_directory(
  text, uuid, uuid, uuid, public.employment_status, integer
) SET search_path = public, extensions;
