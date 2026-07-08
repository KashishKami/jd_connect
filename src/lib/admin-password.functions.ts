import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  employee_id: z.string().uuid(),
  new_password: z.string().min(8, "Password must be at least 8 characters"),
});

export const adminSetEmployeePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    console.log('[Password Reset] Checking admin status for user:', context.userId);
    const { data: isAdmin, error: rpcErr } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (rpcErr) {
      console.error('[Password Reset] is_admin RPC failed:', rpcErr);
      throw new Error(rpcErr.message);
    }
    if (!isAdmin) {
      console.warn('[Password Reset] Access forbidden for user:', context.userId);
      throw new Error("Forbidden");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    console.log('[Password Reset] Fetching employee profile for:', data.employee_id);
    const { data: emp, error: empErr } = await supabaseAdmin
      .from("employees")
      .select("auth_user_id, email")
      .eq("id", data.employee_id)
      .maybeSingle();
    if (empErr) {
      console.error('[Password Reset] Employee fetch error:', empErr);
      throw new Error(empErr.message);
    }
    if (!emp) throw new Error("Employee not found.");

    let authId = emp.auth_user_id;

    // Create or link an auth account when missing
    if (!authId) {
      if (!emp.email) throw new Error("Cannot set password: employee has no email on file.");

      console.log('[Password Reset] Auth ID missing. Listing existing users to link...');
      // Look for an existing auth user with this email
      const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      if (listErr) {
        console.error('[Password Reset] listUsers failed:', listErr);
        throw new Error(listErr.message);
      }
      const existing = list.users.find((u) => u.email?.toLowerCase() === emp.email.toLowerCase());

      if (existing) {
        authId = existing.id;
        console.log('[Password Reset] Found existing user with ID:', authId);
      } else {
        console.log('[Password Reset] Creating new auth user for:', emp.email);
        const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email: emp.email,
          password: data.new_password,
          email_confirm: true,
        });
        if (createErr) {
          console.error('[Password Reset] createUser failed:', createErr);
          throw new Error(createErr.message);
        }
        authId = created.user!.id;
      }

      console.log('[Password Reset] Linking employee to auth ID:', authId);
      const { error: linkErr } = await supabaseAdmin
        .from("employees")
        .update({ auth_user_id: authId })
        .eq("id", data.employee_id);
      if (linkErr) {
        console.error('[Password Reset] Linking failed:', linkErr);
        throw new Error(linkErr.message);
      }
    }

    console.log('[Password Reset] Updating password via updateUserById for auth ID:', authId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(authId, {
      password: data.new_password,
      email_confirm: true,
    });
    if (error) {
      console.error('[Password Reset] updateUserById failed:', error);
      throw new Error(error.message);
    }
    console.log('[Password Reset] Password updated successfully for employee:', data.employee_id);
    return { ok: true } as const;
  });