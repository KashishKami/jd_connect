import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "super_admin" | "admin" | "hr" | "manager" | "team_leader" | "employee";

interface EmployeeProfile {
  id: string;
  employee_code: string;
  full_name: string;
  alias_name: string | null;
  role_id: string | null;
  department_id: string | null;
  centre_id: string | null;
  designation: string | null;
}

interface AuthCtx {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  employee: EmployeeProfile | null;
  loading: boolean;
  isAdmin: boolean;
  hasRole: (r: AppRole) => boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);
const SESSION_KEY = "jd_session_id";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [employee, setEmployee] = useState<EmployeeProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (uid: string) => {
    const [{ data: rolesData }, { data: empData }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase
        .from("employees")
        .select("id, employee_code, full_name, alias_name, role_id, department_id, centre_id, designation")
        .eq("auth_user_id", uid)
        .maybeSingle(),
    ]);
    setRoles((rolesData?.map((r: { role: AppRole }) => r.role) ?? []) as AppRole[]);
    setEmployee((empData as EmployeeProfile | null) ?? null);
  };

  useEffect(() => {
    let mounted = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        // Defer to avoid deadlock
        setTimeout(() => loadProfile(s.user.id), 0);
      } else {
        setRoles([]);
        setEmployee(null);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) loadProfile(data.session.user.id);
      setLoading(false);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Single-active-session enforcement: poll every 30s
  useEffect(() => {
    if (!user) return;
    const localId = localStorage.getItem(SESSION_KEY);
    // If this device has no stored session token, skip enforcement entirely
    // (e.g. old browser tab that predates this feature)
    if (!localId) return;

    const check = async () => {
      // Re-read localStorage each time — login on another tab updates it
      const token = localStorage.getItem(SESSION_KEY);
      if (!token) return; // token was cleared, don't self-kick
      const { data: ok } = await supabase.rpc("is_current_session", { _token: token });
      if (ok === false) {
        await supabase.auth.signOut();
        localStorage.removeItem(SESSION_KEY);
        window.location.href = "/auth?reason=session-replaced";
      }
    };

    // Delay the FIRST check by 5 seconds so the DB insert and localStorage.setItem
    // from handleLogin are both committed before we query. Subsequent polls every 30s.
    const firstTimer = setTimeout(() => {
      void check();
    }, 5_000);
    const t = setInterval(check, 30_000);
    return () => {
      clearTimeout(firstTimer);
      clearInterval(t);
    };
  }, [user]);

  // Presence heartbeat
  useEffect(() => {
    if (!employee?.id) return;
    const beat = async (status: "online" | "away" = "online") => {
      await supabase.from("employee_presence").upsert({
        employee_id: employee.id, status, last_seen_at: new Date().toISOString(),
      });
    };
    beat("online");
    const t = setInterval(() => beat(document.hidden ? "away" : "online"), 45_000);
    const onVis = () => beat(document.hidden ? "away" : "online");
    const onUnload = () => {
      // best-effort offline
      void supabase.from("employee_presence").upsert({
        employee_id: employee.id, status: "offline", last_seen_at: new Date().toISOString(),
      });
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [employee?.id]);

  const signOut = async () => {
    if (user) {
      await supabase.from("employee_sessions").update({ is_active: false }).eq("user_id", user.id);
    }
    localStorage.removeItem(SESSION_KEY);
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  const refresh = async () => {
    if (user) await loadProfile(user.id);
  };

  const isAdmin = roles.includes("super_admin") || roles.includes("admin");
  const hasRole = (r: AppRole) => roles.includes(r);

  return (
    <Ctx.Provider value={{ user, session, roles, employee, loading, isAdmin, hasRole, signOut, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { SESSION_KEY };