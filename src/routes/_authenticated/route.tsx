import { createFileRoute, Outlet, redirect, isRedirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { JdaiWidget } from "@/components/JdaiWidget";
import { HeaderActions } from "@/components/HeaderActions";
import { AppFooter } from "@/components/AppFooter";
import { ProfileCompletionDialog } from "@/components/ProfileCompletionDialog";
import { ChatNotifier } from "@/components/ChatNotifier";
import { checkIpRestriction } from "@/lib/ip-restriction.functions";

// Cache the IP check per session, keyed by the active userId.
// This prevents reusing a cached "allowed" state when switching user sessions.
let ipCheckPromise: Promise<{ allowed: boolean }> | null = null;
let cachedUserId: string | null = null;

function getIpCheck(userId: string) {
  if (!ipCheckPromise || cachedUserId !== userId) {
    cachedUserId = userId;
    ipCheckPromise = checkIpRestriction().catch((e) => {
      ipCheckPromise = null; // allow retry on next navigation
      cachedUserId = null;
      throw e;
    }) as Promise<{ allowed: boolean }>;
  }
  return ipCheckPromise;
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    // IP allowlist check (admins/super admins bypass server-side)
    try {
      const ipCheck = await getIpCheck(data.user.id);
      console.log("[IP Check Client] Allowed:", ipCheck.allowed, "Check Result:", ipCheck);
      if (!ipCheck.allowed) throw redirect({ to: "/ip-blocked" });
    } catch (e) {
      if (isRedirect(e)) throw e;
      // network/other error — fail open to avoid lockout
      console.error("IP check failed:", e);
    }
    // Block non-approved accounts from accessing the app
    const { data: emp } = await supabase
      .from("employees")
      .select("approval_status")
      .eq("auth_user_id", data.user.id)
      .maybeSingle();
    const approval = (emp?.approval_status ?? "pending") as string;
    if (approval !== "approved") throw redirect({ to: "/pending-approval" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <SidebarProvider>
      <div className="h-screen h-[100dvh] flex w-full bg-secondary/30 overflow-hidden">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          <header className="h-14 flex items-center gap-3 border-b bg-background px-4 sticky top-0 z-10 shrink-0">
            <SidebarTrigger />
            <div className="h-6 w-px bg-border" />
            <div className="text-sm font-medium text-foreground">JD Connect</div>
            <div className="ml-auto">
              <HeaderActions />
            </div>
          </header>
          <main className="flex-1 p-4 sm:p-6 overflow-y-auto min-h-0">
            <Outlet />
          </main>
          <AppFooter />
        </div>
        <JdaiWidget />
        <ProfileCompletionDialog />
        <ChatNotifier />
      </div>
    </SidebarProvider>
  );
}