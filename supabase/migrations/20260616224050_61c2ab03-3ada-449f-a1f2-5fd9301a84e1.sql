DO $$
DECLARE
  emp_ids uuid[] := ARRAY['93f6e181-3c3f-4151-8680-de48bd404f44','46c100f1-0486-48f6-a1fa-8f020755d4ba']::uuid[];
  auth_ids uuid[] := ARRAY['f70489d0-9efb-41a5-965a-f353ec430808','c29cf885-8d05-4045-bd9e-954dd718f59b']::uuid[];
BEGIN
  SET LOCAL session_replication_role = 'replica';
  UPDATE public.employees SET team_leader_id = NULL WHERE team_leader_id = ANY(emp_ids);
  UPDATE public.employees SET manager_id = NULL WHERE manager_id = ANY(emp_ids);
  UPDATE public.leave_requests SET reviewed_by = NULL WHERE reviewed_by = ANY(emp_ids);
  DELETE FROM public.attendance_corrections WHERE requested_by = ANY(emp_ids);
  UPDATE public.attendance_corrections SET reviewed_by = NULL WHERE reviewed_by = ANY(emp_ids);
  UPDATE public.break_requests SET reviewer_id = NULL WHERE reviewer_id = ANY(emp_ids);
  DELETE FROM public.break_audit_logs WHERE employee_id = ANY(emp_ids);
  DELETE FROM public.attendance_audit_logs WHERE employee_id = ANY(emp_ids);
  DELETE FROM public.sales_audit_logs WHERE employee_id = ANY(emp_ids);
  UPDATE public.channel_join_requests SET decided_by = NULL WHERE decided_by = ANY(emp_ids);
  DELETE FROM public.employees WHERE id = ANY(emp_ids);
  DELETE FROM auth.users WHERE id = ANY(auth_ids);
END $$;