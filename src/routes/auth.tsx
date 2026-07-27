import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/PasswordInput";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "sonner";
import { checkIpRestriction } from "@/lib/ip-restriction.functions";
import { SESSION_KEY } from "@/hooks/useAuth";
import { z } from "zod";
import { Apple, Monitor, Download } from "lucide-react";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { reason?: string } => ({
    reason: typeof s.reason === "string" ? s.reason : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — JD Connect" },
      {
        name: "description",
        content:
          "Sign in to the JD Connect employee portal to manage your profile, attendance, sales and team communication.",
      },
      { property: "og:title", content: "Sign in — JD Connect" },
      {
        property: "og:description",
        content:
          "Sign in to the JD Connect employee portal to manage your profile, attendance, sales and team communication.",
      },
    ],
  }),
  component: AuthPage,
});

const loginSchema = z.object({
  identifier: z.string().trim().min(3, "Employee ID or email is required").max(255),
  password: z.string().min(6, "Password must be at least 6 characters").max(128),
});

const signupSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your real full name").max(100),
  alias_name: z.string().trim().min(2, "Enter your alias / display name").max(100),
  email: z.string().trim().email().max(255),
  password: z.string().min(8, "Use at least 8 characters").max(128),
});

const ALLOWED_DOMAIN = "jdfusion.in";
type Step = "auth" | "check-email" | "reset-request" | "verify-recovery" | "reset-password";

export function AuthPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>("auth");
  const [pendingEmail, setPendingEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [downloadUrls, setDownloadUrls] = useState({
    win: "https://github.com/KashishKami/jd_connect/releases/latest",
    mac: "https://github.com/KashishKami/jd_connect/releases/latest",
  });

  useEffect(() => {
    fetch("https://api.github.com/repos/KashishKami/jd_connect/releases/latest")
      .then((res) => res.json())
      .then((data) => {
        if (data && data.assets) {
          const winAsset = data.assets.find((asset: any) => asset.name.endsWith(".exe"));
          const macAsset = data.assets.find((asset: any) => asset.name.endsWith(".dmg"));
          setDownloadUrls({
            win: winAsset?.browser_download_url || "https://github.com/KashishKami/jd_connect/releases/latest",
            mac: macAsset?.browser_download_url || "https://github.com/KashishKami/jd_connect/releases/latest",
          });
        }
      })
      .catch((err) => {
        console.error("Failed to fetch latest release assets:", err);
      });
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
    if (search.reason === "session-replaced") {
      toast.warning("You were signed out — this account was signed in elsewhere.");
    }
  }, [navigate, search.reason]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const rawIdentifier = String(fd.get("identifier") ?? "").trim();
    const parsed = loginSchema.safeParse({
      identifier: rawIdentifier,
      password: String(fd.get("password") ?? ""),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setLoading(true);
    try {
      const isEmail = parsed.data.identifier.includes("@");
      let email: string | null = null;
      if (isEmail) {
        email = parsed.data.identifier.toLowerCase();
      } else {
        const { data: emailData, error: rpcErr } = await supabase.rpc("email_for_employee_code", {
          _code: parsed.data.identifier.toUpperCase(),
        });
        if (rpcErr || !emailData) {
          toast.error("Employee ID not found or inactive");
          return;
        }
        email = emailData as string;
      }
      const { data: signIn, error } = await supabase.auth.signInWithPassword({
        email,
        password: parsed.data.password,
      });
      if (error || !signIn.user) {
        toast.error(error?.message ?? "Sign-in failed");
        return;
      }

      // Check IP restriction before creating a session to avoid invalidating other devices
      try {
        const ipCheck = await checkIpRestriction();
        if (!ipCheck.allowed) {
          toast.error("Access denied: Your IP address is not whitelisted.");
          await supabase.auth.signOut({ scope: "local" });
          return;
        }
      } catch (ipErr) {
        console.error("IP check failed during login:", ipErr);
      }

      // Record single active session
      const sid = crypto.randomUUID();
      await supabase.from("employee_sessions").update({ is_active: false }).eq("user_id", signIn.user.id);
      await supabase.from("employee_sessions").insert({ user_id: signIn.user.id, session_token: sid, is_active: true });
      localStorage.setItem(SESSION_KEY, sid);
      toast.success("Signed in");
      navigate({ to: "/dashboard" });
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = signupSchema.safeParse({
      full_name: String(fd.get("full_name") ?? ""),
      alias_name: String(fd.get("alias_name") ?? ""),
      email: String(fd.get("email") ?? ""),
      password: String(fd.get("password") ?? ""),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    if (parsed.data.full_name.trim().toLowerCase() === parsed.data.alias_name.trim().toLowerCase()) {
      toast.error("Alias name should be different from your real name");
      return;
    }
    setLoading(true);
    try {
      const email = parsed.data.email.toLowerCase();
      const { data, error } = await supabase.auth.signUp({
        email,
        password: parsed.data.password,
        options: {
          emailRedirectTo: `${window.location.origin}/pending-approval`,
          data: { full_name: parsed.data.full_name, alias_name: parsed.data.alias_name },
        },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      const domain = email.split("@")[1] ?? "";
      if (domain !== ALLOWED_DOMAIN) {
        toast.info(`Heads up: ${ALLOWED_DOMAIN} accounts are preferred. Yours will still need Super Admin approval.`);
      }
      setPendingEmail(email);
      // Always show the "check your email" screen first — even if Supabase returns
      // a session immediately. The status flip (unverified → pending) must only
      // happen AFTER the user physically clicks the verification link, not before.
      // Skipping this step was causing admins to see users in the approval queue
      // before the email had even arrived in the user's inbox.
      setStep("check-email");
    } finally {
      setLoading(false);
    }
  };

  const handleSendReset = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "")
      .trim()
      .toLowerCase();
    if (!email) return toast.error("Enter your email");
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else {
      toast.success("We sent a 6-digit code to your email.");
      setPendingEmail(email);
      setOtp("");
      setStep("verify-recovery");
    }
  };

  const handleResendVerification = async () => {
    if (!pendingEmail) return;
    setLoading(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: pendingEmail,
      options: { emailRedirectTo: window.location.origin },
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success("Verification email resent!");
  };

  const handleVerifyRecovery = async () => {
    if (otp.length !== 6) return toast.error("Enter the 6-digit code");
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: pendingEmail,
        token: otp,
        type: "recovery",
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      setStep("reset-password");
    } finally {
      setLoading(false);
    }
  };

  const handleSetNewPassword = async () => {
    if (newPassword.length < 8) return toast.error("Use at least 8 characters");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated. Please sign in.");
    await supabase.auth.signOut();
    setStep("auth");
    setNewPassword("");
    setOtp("");
    setPendingEmail("");
  };

  const handleResendCode = async (_type: "recovery") => {
    if (!pendingEmail) return;
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(pendingEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success("Code resent");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary via-primary to-sidebar p-4">
      <div className="w-full max-w-md flex flex-col gap-3">
        <Card className="w-full shadow-2xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 h-12 w-12 rounded-xl bg-primary text-primary-foreground grid place-items-center text-xl font-bold">
              JD
            </div>
            <CardTitle className="text-2xl">JD Connect</CardTitle>
            <CardDescription>Employee Portal</CardDescription>
          </CardHeader>
          <CardContent>
            {step === "check-email" ? (
              <div className="space-y-4 text-center">
                <div className="mx-auto h-14 w-14 rounded-full grid place-items-center bg-primary/10 text-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold">Check your inbox</h3>
                  <p className="text-sm text-muted-foreground">We sent a verification link to</p>
                  <p className="font-medium text-foreground break-all">{pendingEmail}</p>
                </div>
                <div className="rounded-md bg-muted/50 p-3 text-left text-sm space-y-2">
                  <p>👉 Click the <span className="font-medium">"Verify Email"</span> button in that email.</p>
                  <p className="text-muted-foreground">You'll be brought back here automatically after verification.</p>
                </div>
                <div className="space-y-2">
                  <Button className="w-full" disabled={loading} onClick={handleResendVerification}>
                    {loading ? "Sending…" : "Resend verification email"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => { setStep("auth"); setPendingEmail(""); }}
                  >
                    Back to sign in
                  </Button>
                </div>
              </div>
            ) : step === "reset-request" ? (
              <form onSubmit={handleSendReset} className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Enter your email and we'll send you a 6-digit code to reset your password.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" required />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  Send code
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={() => setStep("auth")}>
                  Back to sign in
                </Button>
              </form>
            ) : step === "verify-recovery" ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground text-center">
                  Enter the 6-digit code sent to
                  <br />
                  <span className="font-medium text-foreground">{pendingEmail}</span>
                </p>
                <div className="flex justify-center">
                  <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                    <InputOTPGroup>
                      {[0, 1, 2, 3, 4, 5].map((i) => (
                        <InputOTPSlot key={i} index={i} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <Button
                  className="w-full"
                  disabled={loading || otp.length !== 6}
                  onClick={handleVerifyRecovery}
                >
                  Verify
                </Button>
                <div className="flex justify-between text-xs">
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-primary"
                    onClick={() => handleResendCode("recovery")}
                    disabled={loading}
                  >
                    Resend code
                  </button>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-primary"
                    onClick={() => setStep("auth")}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : step === "reset-password" ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Set a new password for <span className="font-medium text-foreground">{pendingEmail}</span>
                </p>
                <div className="space-y-2">
                  <Label htmlFor="new_password">New password</Label>
                  <PasswordInput
                    id="new_password"
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <Button className="w-full" disabled={loading} onClick={handleSetNewPassword}>
                  Update password
                </Button>
              </div>
            ) : (
              <Tabs defaultValue="login">
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="login">Sign in</TabsTrigger>
                  <TabsTrigger value="signup">Create account</TabsTrigger>
                </TabsList>
                <TabsContent value="login">
                  <form onSubmit={handleLogin} className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label htmlFor="identifier">Employee ID or Email</Label>
                      <Input
                        id="identifier"
                        name="identifier"
                        placeholder="JD0001 or you@example.com"
                        required
                        autoFocus
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <PasswordInput id="password" name="password" required />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      Sign in
                    </Button>
                    <button
                      type="button"
                      onClick={() => setStep("reset-request")}
                      className="text-sm text-muted-foreground hover:text-primary w-full text-center"
                    >
                      Forgot password?
                    </button>
                  </form>
                </TabsContent>
                <TabsContent value="signup">
                  <form onSubmit={handleSignup} className="space-y-4 mt-4">
                    <p className="text-xs text-muted-foreground">
                      Use your <span className="font-medium text-foreground">@{ALLOWED_DOMAIN}</span> email. Other
                      domains can sign up but require Super Admin approval before access.
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="full_name">Real Full Name</Label>
                      <Input id="full_name" name="full_name" required placeholder="As on your ID / official records" />
                      <p className="text-xs text-muted-foreground">Your legal name — used for HR and payroll.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="alias_name">Alias Name</Label>
                      <Input
                        id="alias_name"
                        name="alias_name"
                        required
                        placeholder="The name you use on calls / with customers"
                      />
                      <p className="text-xs text-muted-foreground">
                        Shown to teammates and customers. Must be different from your real name.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup_email">Email</Label>
                      <Input
                        id="signup_email"
                        name="email"
                        type="email"
                        required
                        placeholder={`you@${ALLOWED_DOMAIN}`}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup_password">Password</Label>
                      <PasswordInput id="signup_password" name="password" required minLength={8} />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      Create account
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
        <div className="rounded-xl bg-white/10 backdrop-blur border border-white/20 p-4 space-y-3">
          <div className="flex items-center justify-center gap-2 text-white text-sm font-medium">
            <Download className="h-4 w-4" />
            Download the desktop app
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                if (downloadUrls.win.endsWith(".exe")) {
                  window.location.href = downloadUrls.win;
                } else {
                  window.open(downloadUrls.win, "_blank", "noopener,noreferrer");
                }
              }}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-white text-slate-900 hover:bg-white/90 px-3 py-2 text-sm font-medium transition-colors cursor-pointer"
            >
              <Monitor className="h-4 w-4" />
              Windows
            </button>
            <button
              onClick={() => {
                if (downloadUrls.mac.endsWith(".dmg")) {
                  window.location.href = downloadUrls.mac;
                } else {
                  window.open(downloadUrls.mac, "_blank", "noopener,noreferrer");
                }
              }}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-white text-slate-900 hover:bg-white/90 px-3 py-2 text-sm font-medium transition-colors cursor-pointer"
            >
              <Apple className="h-4 w-4" />
              macOS
            </button>
          </div>
        </div>
        <p className="text-center text-xs text-white/80">
          Design &amp; Develop by{" "}
          <a
            href="https://www.amitsrivastav.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white font-medium hover:underline"
          >
            Amit Srivastav
          </a>
        </p>
      </div>
    </div>
  );
}
