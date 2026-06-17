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
    const { data: isAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: emp, error: empErr } = await supabaseAdmin
      .from("employees")
      .select("auth_user_id, email")
      .eq("id", data.employee_id)
      .maybeSingle();
    if (empErr) throw new Error(empErr.message);
    if (!emp) throw new Error("Employee not found.");

    let authId = emp.auth_user_id;

    // Create or link an auth account when missing
    if (!authId) {
      if (!emp.email) throw new Error("Cannot set password: employee has no email on file.");

      // Look for an existing auth user with this email
      const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      if (listErr) throw new Error(listErr.message);
      const existing = list.users.find((u) => u.email?.toLowerCase() === emp.email.toLowerCase());

      if (existing) {
        authId = existing.id;
      } else {
        const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email: emp.email,
          password: data.new_password,
          email_confirm: true,
        });
        if (createErr) throw new Error(createErr.message);
        authId = created.user!.id;
      }

      const { error: linkErr } = await supabaseAdmin
        .from("employees")
        .update({ auth_user_id: authId })
        .eq("id", data.employee_id);
      if (linkErr) throw new Error(linkErr.message);
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(authId, {
      password: data.new_password,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true } as const;
  });