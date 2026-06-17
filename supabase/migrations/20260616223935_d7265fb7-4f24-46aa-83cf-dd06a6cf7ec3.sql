DO $$
DECLARE
  emp_id uuid := '047ea3f1-5963-4870-96ed-8f0e471cd729';
  auth_id uuid := 'e53e96df-87b7-482d-ad78-b20c5a0debcf';
BEGIN
  SET LOCAL session_replication_role = 'replica';
  UPDATE public.employees SET team_leader_id = NULL WHERE team_leader_id = emp_id;
  UPDATE public.employees SET manager_id = NULL WHERE manager_id = emp_id;
  UPDATE public.leave_requests SET reviewed_by = NULL WHERE reviewed_by = emp_id;
  DELETE FROM public.attendance_corrections WHERE requested_by = emp_id;
  UPDATE public.attendance_corrections SET reviewed_by = NULL WHERE reviewed_by = emp_id;
  UPDATE public.break_requests SET reviewer_id = NULL WHERE reviewer_id = emp_id;
  DELETE FROM public.break_audit_logs WHERE employee_id = emp_id;
  DELETE FROM public.attendance_audit_logs WHERE employee_id = emp_id;
  DELETE FROM public.sales_audit_logs WHERE employee_id = emp_id;
  UPDATE public.channel_join_requests SET decided_by = NULL WHERE decided_by = emp_id;
  DELETE FROM public.employees WHERE id = emp_id;
  DELETE FROM auth.users WHERE id = auth_id;
END $$;