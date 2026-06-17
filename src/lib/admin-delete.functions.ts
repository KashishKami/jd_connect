import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Entity = z.enum([
  "employee",
  "centre",
  "department",
  "shift",
  "holiday",
  "sales_source",
  "break_type",
  "role",
  "channel",
]);

const Input = z.object({ entity: Entity, id: z.string().uuid() });

export const deleteAdminEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    // Authorize: super_admin or admin only
    const { data: isAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Employee: soft delete + revoke auth
    if (data.entity === "employee") {
      const { data: emp } = await supabaseAdmin
        .from("employees")
        .select("id, auth_user_id, employment_status")
        .eq("id", data.id)
        .maybeSingle();
      if (!emp) throw new Error("Employee not found");

      // First click on an active employee → soft delete (mark terminated, revoke auth)
      if (emp.employment_status !== "terminated") {
        const { error } = await supabaseAdmin
          .from("employees")
          .update({ employment_status: "terminated" })
          .eq("id", data.id);
        if (error) throw new Error(error.message);
        if (emp.auth_user_id) {
          try {
            await supabaseAdmin.auth.admin.deleteUser(emp.auth_user_id);
          } catch {
            /* user may not exist; continue */
          }
        }
        return { ok: true, soft: true } as const;
      }

      // Second click on an already-terminated employee → permanent delete
      if (emp.auth_user_id) {
        try { await supabaseAdmin.auth.admin.deleteUser(emp.auth_user_id); } catch { /* ignore */ }
      }
      // Null out NO ACTION references so the row delete is not blocked
      await supabaseAdmin.from("employees").update({ team_leader_id: null }).eq("team_leader_id", data.id);
      await supabaseAdmin.from("employees").update({ manager_id: null }).eq("manager_id", data.id);
      await supabaseAdmin.from("leave_requests").update({ reviewed_by: null }).eq("reviewed_by", data.id);
      await supabaseAdmin.from("attendance_corrections").delete().eq("requested_by", data.id);
      await supabaseAdmin.from("attendance_corrections").update({ reviewed_by: null }).eq("reviewed_by", data.id);
      await supabaseAdmin.from("break_requests").update({ reviewer_id: null }).eq("reviewer_id", data.id);
      await supabaseAdmin.from("break_audit_logs").delete().eq("employee_id", data.id);
      await supabaseAdmin.from("channel_join_requests").update({ decided_by: null }).eq("decided_by", data.id);
      const { error: delErr } = await supabaseAdmin.from("employees").delete().eq("id", data.id);
      if (delErr) {
        if (delErr.code === "23503") {
          throw new Error("Cannot permanently delete: linked records still reference this employee.");
        }
        throw new Error(delErr.message);
      }
      return { ok: true, soft: false } as const;
    }

    // Centre / Department: block hard delete if employees still assigned
    if (data.entity === "centre" || data.entity === "department") {
      const col = data.entity === "centre" ? "centre_id" : "department_id";
      const { count } = await supabaseAdmin
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq(col, data.id)
        .neq("employment_status", "terminated");
      if ((count ?? 0) > 0) {
        throw new Error(
          `Cannot delete: ${count} active employee(s) are still assigned. Reassign them first, or set this ${data.entity} to inactive.`,
        );
      }
    }

    const del = async () => {
      switch (data.entity) {
        case "centre": return supabaseAdmin.from("centres").delete().eq("id", data.id);
        case "department": return supabaseAdmin.from("departments").delete().eq("id", data.id);
        case "shift": return supabaseAdmin.from("shifts").delete().eq("id", data.id);
        case "holiday": return supabaseAdmin.from("holidays").delete().eq("id", data.id);
        case "sales_source": return supabaseAdmin.from("sales_sources").delete().eq("id", data.id);
        case "break_type": return supabaseAdmin.from("break_types").delete().eq("id", data.id);
        case "role": return supabaseAdmin.from("roles").delete().eq("id", data.id);
        case "channel": return supabaseAdmin.from("channels").delete().eq("id", data.id);
        default: throw new Error("Unsupported entity");
      }
    };
    const { error } = await del();
    if (error) {
      // Friendly FK violation message
      if (error.code === "23503") {
        throw new Error(
          "Cannot delete: this record is still referenced by other data. Mark it inactive instead.",
        );
      }
      throw new Error(error.message);
    }
    return { ok: true, soft: false } as const;
  });