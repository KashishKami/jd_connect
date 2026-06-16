-- Stop auto-adding employees to their department channel.
-- Channel membership is now strictly opt-in via join requests + admin approval.
DROP TRIGGER IF EXISTS trg_emp_dept_channel ON public.employees;
DROP FUNCTION IF EXISTS public.sync_employee_department_channel();