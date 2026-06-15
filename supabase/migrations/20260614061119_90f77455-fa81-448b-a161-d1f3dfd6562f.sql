
-- 1) break_audit_logs: drop conflicting admin insert policy; trigger remains the only writer
DROP POLICY IF EXISTS break_audit_logs_insert_admin ON public.break_audit_logs;

-- 2) document_versions: enforce file_path is scoped to the document's folder
CREATE OR REPLACE FUNCTION public.enforce_document_version_path()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.file_path IS NULL OR NEW.document_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF split_part(NEW.file_path, '/', 1) <> NEW.document_id::text THEN
    RAISE EXCEPTION 'file_path % must be inside folder %/', NEW.file_path, NEW.document_id
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_document_version_path ON public.document_versions;
CREATE TRIGGER trg_enforce_document_version_path
BEFORE INSERT OR UPDATE OF file_path, document_id ON public.document_versions
FOR EACH ROW EXECUTE FUNCTION public.enforce_document_version_path();

-- 3) employees: remove direct self-update via RLS; expose a narrow SECURITY DEFINER RPC instead
DROP POLICY IF EXISTS emp_self_update ON public.employees;

CREATE OR REPLACE FUNCTION public.update_self_profile(_profile_photo_url text DEFAULT NULL, _mobile text DEFAULT NULL)
RETURNS public.employees
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.employees;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  UPDATE public.employees
     SET profile_photo_url = COALESCE(_profile_photo_url, profile_photo_url),
         mobile = COALESCE(_mobile, mobile),
         updated_at = now()
   WHERE auth_user_id = auth.uid()
  RETURNING * INTO _row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no employee record for current user' USING ERRCODE = 'P0002';
  END IF;
  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.update_self_profile(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_self_profile(text, text) TO authenticated;
