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
  const [status, setStatus] = useState<"unverified" | "pending" | "approved" | "rejected" | "unknown">("unknown");

  const check = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { nav({ to: "/auth" }); return; }
    setEmail(u.user.email ?? "");

    // If the user's email is now confirmed (they clicked the link), flip
    // their status from 'unverified' → 'pending' so the admin can see them.
    if (u.user.email_confirmed_at) {
      const { data: rpcResult } = await supabase.rpc("confirm_my_email_and_request_approval");
      // rpcResult will be: 'pending' | 'approved' | 'rejected' | 'unverified' | 'no_employee'
      if (rpcResult === "approved") { nav({ to: "/dashboard" }); return; }
      if (rpcResult === "pending" || rpcResult === "rejected") {
        setStatus(rpcResult as "pending" | "rejected");
        return;
      }
    }

    // Fallback: read approval_status directly from employees table
    const { data: emp } = await supabase
      .from("employees")
      .select("approval_status")
      .eq("auth_user_id", u.user.id)
      .maybeSingle();
    const s = (emp?.approval_status ?? "pending") as "unverified" | "pending" | "approved" | "rejected";
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
  const unverified = status === "unverified";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary via-primary to-sidebar p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center">
          <div className={`mx-auto mb-2 h-14 w-14 rounded-full grid place-items-center ${rejected ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-600"}`}>
            <Clock className="h-7 w-7" />
          </div>
          <CardTitle className="text-xl">
            {rejected ? "Access denied" : unverified ? "Verify your email" : "Admin approval waiting"}
          </CardTitle>
          <CardDescription>
            {rejected
              ? "Your account was not approved. Please contact your Super Admin."
              : unverified
              ? "Please check your inbox and click the \"Verify Email\" button to continue."
              : "Your email is verified. A Super Admin needs to approve your account before you can access JD Connect."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {email && <p className="text-sm text-center text-muted-foreground">Signed in as <span className="font-medium text-foreground">{email}</span></p>}
          {!rejected && (
            <Button variant="outline" className="w-full" onClick={() => { check(); if (!unverified) toast.info("Checked again — still waiting"); }}>
              {unverified ? "I've verified my email" : "Check again"}
            </Button>
          )}
          <Button variant="ghost" className="w-full" onClick={signOut}>Sign out</Button>
        </CardContent>
      </Card>
    </div>
  );
}