
-- Add username column to employees and backfill
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS username text;

-- Backfill: derive from alias_name (preferred) or full_name. Strip non-alphanumerics. Ensure uniqueness.
DO $$
DECLARE
  r record;
  base text;
  candidate text;
  i int;
BEGIN
  FOR r IN SELECT id, alias_name, full_name FROM public.employees WHERE username IS NULL OR username = '' LOOP
    base := regexp_replace(coalesce(NULLIF(trim(r.alias_name), ''), r.full_name, 'user'), '[^A-Za-z0-9]', '', 'g');
    IF base IS NULL OR base = '' THEN
      base := 'user';
    END IF;
    candidate := base;
    i := 1;
    WHILE EXISTS (SELECT 1 FROM public.employees WHERE username = candidate AND id <> r.id) LOOP
      i := i + 1;
      candidate := base || i::text;
    END LOOP;
    UPDATE public.employees SET username = candidate WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE public.employees ALTER COLUMN username SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS employees_username_unique_ci ON public.employees (lower(username));

-- Username format constraint: letters, digits, underscore; 2-32 chars
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_username_format_chk;
ALTER TABLE public.employees ADD CONSTRAINT employees_username_format_chk
  CHECK (username ~ '^[A-Za-z0-9_]{2,32}$');

-- Public lookup function for mention autocomplete (returns minimal info, no PII)
CREATE OR REPLACE FUNCTION public.search_mention_candidates(_q text, _limit int DEFAULT 10)
RETURNS TABLE (id uuid, username text, alias_name text, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.username, e.alias_name, e.full_name
  FROM public.employees e
  WHERE e.employment_status = 'active'
    AND (
      _q IS NULL OR _q = ''
      OR e.username ILIKE _q || '%'
      OR e.alias_name ILIKE '%' || _q || '%'
      OR e.full_name ILIKE '%' || _q || '%'
    )
  ORDER BY (CASE WHEN e.username ILIKE _q || '%' THEN 0 ELSE 1 END), e.username
  LIMIT LEAST(coalesce(_limit, 10), 25)
$$;

GRANT EXECUTE ON FUNCTION public.search_mention_candidates(text, int) TO authenticated;
