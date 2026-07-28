import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CreateEmployeeInput = z.object({
  full_name: z.string().min(1, "Full name is required"),
  email: z.string().email("Valid email is required"),
  employee_code: z.string().optional().nullable(),
  alias_name: z.string().optional().nullable(),
  mobile: z.string().optional().nullable(),
  designation: z.string().optional().nullable(),
  joining_date: z.string().optional().nullable(),
  department_id: z.string().uuid().optional().nullable(),
  centre_id: z.string().uuid().optional().nullable(),
  role_id: z.string().uuid().optional().nullable(),
  shift_id: z.string().uuid().optional().nullable(),
  team_leader_id: z.string().uuid().optional().nullable(),
  manager_id: z.string().uuid().optional().nullable(),
});

export const adminCreateEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateEmployeeInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: rpcErr } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (rpcErr || !isAdmin) {
      throw new Error("Forbidden: Admin privileges required");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.trim().toLowerCase();

    // Check if auth user or employee already exists
    const { data: existingEmp } = await supabaseAdmin
      .from("employees")
      .select("id, auth_user_id, email")
      .eq("email", email)
      .maybeSingle();

    let authUserId = existingEmp?.auth_user_id;

    if (!authUserId) {
      // Create user in Supabase Auth with auto-confirmed email (bypassing email verification)
      const { data: authUser, error: createAuthErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: data.full_name, alias_name: data.alias_name },
      });

      if (createAuthErr) {
        if (createAuthErr.message.includes("already registered")) {
          // Retrieve the existing Auth user's ID
          const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
          const matching = list?.users?.find((u) => u.email?.toLowerCase() === email);
          if (matching) {
            authUserId = matching.id;
          }
        } else {
          throw new Error(`Failed to create user account: ${createAuthErr.message}`);
        }
      } else if (authUser?.user) {
        authUserId = authUser.user.id;
      }
    }

    // Now update or insert employee attributes
    const empData = {
      full_name: data.full_name,
      alias_name: data.alias_name || null,
      email: email,
      employee_code: data.employee_code || null,
      designation: data.designation || null,
      joining_date: data.joining_date || null,
      department_id: data.department_id || null,
      centre_id: data.centre_id || null,
      role_id: data.role_id || null,
      shift_id: data.shift_id || null,
      team_leader_id: data.team_leader_id || null,
      manager_id: data.manager_id || null,
      employment_status: "active",
      approval_status: "pending",
      updated_at: new Date().toISOString(),
    };

    if (existingEmp?.id) {
      const { error: updateErr } = await supabaseAdmin
        .from("employees")
        .update({ ...empData, auth_user_id: authUserId || existingEmp.auth_user_id })
        .eq("id", existingEmp.id);
      if (updateErr) throw new Error(updateErr.message);
    } else {
      const { error: insertErr } = await supabaseAdmin
        .from("employees")
        .insert([{ ...empData, auth_user_id: authUserId }]);
      if (insertErr) throw new Error(insertErr.message);
    }

    return { ok: true };
  });
