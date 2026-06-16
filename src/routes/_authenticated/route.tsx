import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { JdaiWidget } from "@/components/JdaiWidget";
import { HeaderActions } from "@/components/HeaderActions";
import { AppFooter } from "@/components/AppFooter";
import { ProfileCompletionDialog } from "@/components/ProfileCompletionDialog";
import { ChatNotifier } from "@/components/ChatNotifier";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
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
      <div className="min-h-screen flex w-full bg-secondary/30">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-3 border-b bg-background px-4 sticky top-0 z-10">
            <SidebarTrigger />
            <div className="h-6 w-px bg-border" />
            <div className="text-sm font-medium text-foreground">JD Connect</div>
            <div className="ml-auto">
              <HeaderActions />
            </div>
          </header>
          <main className="flex-1 p-4 sm:p-6 overflow-x-hidden">
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