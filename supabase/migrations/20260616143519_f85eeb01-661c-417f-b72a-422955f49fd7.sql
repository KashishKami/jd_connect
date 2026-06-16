
CREATE OR REPLACE FUNCTION public.employees_auto_username()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  base text;
  candidate text;
  i int := 1;
BEGIN
  IF NEW.username IS NOT NULL AND NEW.username <> '' THEN
    RETURN NEW;
  END IF;
  base := regexp_replace(coalesce(NULLIF(trim(NEW.alias_name), ''), NEW.full_name, 'user'), '[^A-Za-z0-9]', '', 'g');
  IF base IS NULL OR base = '' OR length(base) < 2 THEN
    base := 'user';
  END IF;
  IF length(base) > 32 THEN
    base := substring(base from 1 for 32);
  END IF;
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM public.employees WHERE lower(username) = lower(candidate)) LOOP
    i := i + 1;
    candidate := substring(base from 1 for greatest(1, 32 - length(i::text))) || i::text;
  END LOOP;
  NEW.username := candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employees_auto_username ON public.employees;
CREATE TRIGGER trg_employees_auto_username
BEFORE INSERT ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.employees_auto_username();
