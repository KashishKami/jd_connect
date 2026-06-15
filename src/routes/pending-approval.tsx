import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/pending-approval")({
  head: () => ({ meta: [{ title: "Awaiting approval — JD Connect" }] }),
  component: PendingApprovalPage,
});

function PendingApprovalPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState<string>("");
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "unknown">("unknown");

  const check = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { nav({ to: "/auth" }); return; }
    setEmail(u.user.email ?? "");
    const { data: emp } = await supabase
      .from("employees")
      .select("approval_status")
      .eq("auth_user_id", u.user.id)
      .maybeSingle();
    const s = (emp?.approval_status ?? "pending") as "pending" | "approved" | "rejected";
    setStatus(s);
    if (s === "approved") nav({ to: "/dashboard" });
  };

  useEffect(() => {
    check();
    const t = setInterval(check, 15_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    nav({ to: "/auth" });
  };

  const rejected = status === "rejected";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary via-primary to-sidebar p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center">
          <div className={`mx-auto mb-2 h-14 w-14 rounded-full grid place-items-center ${rejected ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-600"}`}>
            <Clock className="h-7 w-7" />
          </div>
          <CardTitle className="text-xl">
            {rejected ? "Access denied" : "Admin approval waiting"}
          </CardTitle>
          <CardDescription>
            {rejected
              ? "Your account was not approved. Please contact your Super Admin."
              : "Your email is verified. A Super Admin needs to approve your account before you can access JD Connect."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {email && <p className="text-sm text-center text-muted-foreground">Signed in as <span className="font-medium text-foreground">{email}</span></p>}
          {!rejected && (
            <Button variant="outline" className="w-full" onClick={() => { check(); toast.info("Checked again — still waiting"); }}>
              Check again
            </Button>
          )}
          <Button variant="ghost" className="w-full" onClick={signOut}>Sign out</Button>
        </CardContent>
      </Card>
    </div>
  );
}