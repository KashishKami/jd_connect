import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Helper to get client IP from request headers
export function getClientIp(request: Request): string {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp;

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;

  return "127.0.0.1";
}

// Server function: checks via SECURITY DEFINER RPC using the user's authenticated client.
// No service role key required. Admins/super_admins bypass inside the RPC.
export const checkIpRestriction = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const request = getRequest();
    const clientIp = request ? getClientIp(request) : "unknown";

    try {
      const { data, error } = await context.supabase.rpc("check_ip_allowed", { _ip: clientIp });

      if (error) {
        // Function not yet deployed — fail open to avoid lockout during rollout
        if ((error as { code?: string }).code === "42883") {
          console.warn("[IP CHECK SERVER] RPC missing, failing open");
          return { allowed: true, clientIp, reason: "rpc_missing" };
        }
        console.error("[IP CHECK SERVER] RPC error:", error);
        return { allowed: true, clientIp, reason: "rpc_error" };
      }

      const allowed = !!data;
      console.log(
        `[IP CHECK SERVER] IP: ${clientIp} | User: ${context.userId} | Allowed: ${allowed}`,
      );
      return { allowed, clientIp, reason: allowed ? "allowed" : "blocked" };
    } catch (e) {
      console.error("[IP CHECK SERVER] Exception:", e);
      return { allowed: true, clientIp, reason: "exception" };
    }
  });
