import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldAlert, RefreshCw } from "lucide-react";
import { checkIpRestriction } from "@/lib/ip-restriction.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/ip-blocked")({
  head: () => ({ meta: [{ title: "IP Access Denied — JD Connect" }] }),
  component: IpBlockedPage,
});

function IpBlockedPage() {
  const nav = useNavigate();
  const [clientIp, setClientIp] = useState<string>("");
  const [checking, setChecking] = useState(false);

  const checkStatus = async () => {
    setChecking(true);
    try {
      const res = await checkIpRestriction();
      setClientIp(res.clientIp);
      if (res.allowed) {
        toast.success("Your IP is now authorized!");
        nav({ to: "/dashboard" });
      } else {
        toast.error("Your IP is still blocked.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Error checking IP status.");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    // Initial status check to fetch user's IP
    const fetchIp = async () => {
      try {
        const res = await checkIpRestriction();
        setClientIp(res.clientIp);
        if (res.allowed) {
          nav({ to: "/dashboard" });
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchIp();
  }, [nav]);

  const signOut = async () => {
    await supabase.auth.signOut();
    nav({ to: "/auth" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-destructive/10 via-background to-secondary/30 p-4 animate-fade-in">
      <Card className="w-full max-w-md shadow-2xl border-destructive/20">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 h-14 w-14 rounded-full bg-destructive/10 text-destructive grid place-items-center animate-bounce">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <CardTitle className="text-xl font-bold tracking-tight text-destructive">
            IP Access Blocked
          </CardTitle>
          <CardDescription className="text-sm mt-2">
            This application is restricted to authorized office networks. Your current IP address is not whitelisted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {clientIp && (
            <div className="bg-secondary/40 p-3 rounded-lg border border-border text-center font-mono text-sm">
              <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Your IP Address</div>
              <div className="text-foreground font-bold mt-1 text-base">{clientIp}</div>
            </div>
          )}
          
          <div className="space-y-2">
            <Button 
              className="w-full flex items-center justify-center gap-2" 
              onClick={checkStatus} 
              disabled={checking}
            >
              <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
              {checking ? "Checking..." : "Verify & Retry"}
            </Button>
            <Button variant="ghost" className="w-full text-muted-foreground" onClick={signOut}>
              Sign out
            </Button>
          </div>

          <div className="text-[10px] text-center text-muted-foreground/80 mt-4 leading-normal">
            If this is a mistake, please contact your administrator or IT support to authorize this IP address.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
