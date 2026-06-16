-- 1) break_policies: let approved active employees read policies that apply to them
DROP POLICY IF EXISTS bp_select_employee ON public.break_policies;
CREATE POLICY bp_select_employee ON public.break_policies
FOR SELECT TO authenticated
USING (
  is_active = true
  AND EXISTS (
    SELECT 1 FROM public.employees me
    WHERE me.auth_user_id = auth.uid()
      AND me.approval_status = 'approved'
      AND me.employment_status = 'active'
      AND (break_policies.centre_id IS NULL OR break_policies.centre_id = me.centre_id)
      AND (break_policies.department_id IS NULL OR break_policies.department_id = me.department_id)
  )
);

-- 2) employees PII: restrict direct column access to email/mobile.
--    RPCs (admin_list_employee_contacts, get_employee_contact, get_my_contact) are SECURITY DEFINER
--    and continue to expose these fields to authorized callers only.
REVOKE SELECT (email, mobile) ON public.employees FROM authenticated;
REVOKE SELECT (email, mobile) ON public.employees FROM anon;

-- Make sure all non-sensitive columns remain readable for authenticated users.
GRANT SELECT (
  id, auth_user_id, employee_code, full_name, department_id, role_id, team_leader_id,
  manager_id, centre_id, shift_id, designation, joining_date, employment_status,
  profile_photo_url, created_at, updated_at, alias_name, approval_status,
  profile_completed, username
) ON public.employees TO authenticated;