CREATE OR REPLACE FUNCTION public.compute_attendance_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_hours numeric;
BEGIN
  IF NEW.login_at IS NOT NULL AND NEW.logout_at IS NOT NULL THEN
    v_hours := ROUND(EXTRACT(EPOCH FROM (NEW.logout_at - NEW.login_at))/3600.0, 2);
    NEW.hours_worked := v_hours;
    IF NEW.status NOT IN ('leave','weekly_off','holiday') THEN
      IF v_hours >= 9 THEN NEW.status := 'present';
      ELSIF v_hours >= 5 THEN NEW.status := 'half_day';
      ELSE NEW.status := 'absent';
      END IF;
    END IF;
  ELSIF NEW.login_at IS NOT NULL AND NEW.logout_at IS NULL THEN
    IF NEW.status NOT IN ('leave','weekly_off','holiday') THEN
      NEW.status := 'present';
    END IF;
  END IF;
  RETURN NEW;
END $$;

UPDATE public.attendance_records
SET status = 'present'
WHERE login_at IS NOT NULL
  AND logout_at IS NULL
  AND status = 'absent';