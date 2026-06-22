import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { LogIn, LogOut, Coffee, Square } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { fmtUSD } from "@/lib/csv";
import { KpiTile } from "@/components/KpiTile";
import { AgentRankings } from "@/components/AgentRankings";
import { titleCase } from "@/lib/utils";
import { DateRangePicker, detectPreset } from "@/components/DateRangePicker";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — JD Connect" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { employee, roles, isAdmin, hasRole } = useAuth();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const isManager = isAdmin || hasRole("manager") || can("reports.dashboards");
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const monthStart = today.slice(0, 8) + "01";
  const isCustomRange = detectPreset({ from, to }) === "custom";

  // Today + MTD company sales for the reorganized header (manager+ only)
  const { data: todayKpi } = useQuery({
    queryKey: ["dash-company-today", today],
    enabled: isManager,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("company_dashboard", { _from: today, _to: today });
      if (error) throw error;
      return (data?.[0] ?? null) as null | {
        gross_revenue: number;
        refunds: number;
        chargebacks: number;
        net_revenue: number;
        logged_in: number;
        on_break: number;
        present_today: number;
        absent_today: number;
      };
    },
  });
  const { data: monthKpi } = useQuery({
    queryKey: ["dash-company-month", monthStart, today],
    enabled: isManager,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("company_dashboard", { _from: monthStart, _to: today });
      if (error) throw error;
      return (data?.[0] ?? null) as null | {
        gross_revenue: number;
        refunds: number;
        chargebacks: number;
        net_revenue: number;
        logged_in: number;
        on_break: number;
        present_today: number;
        absent_today: number;
      };
    },
  });

  const { data: personal } = useQuery({
    queryKey: ["dash-personal", employee?.id, today, monthStart],
    enabled: !!employee?.id,
    queryFn: async () => {
      const [att, perf] = await Promise.all([
        supabase
          .from("attendance_records")
          .select("status, login_at, logout_at, hours_worked")
          .eq("employee_id", employee!.id)
          .eq("work_date", today)
          .maybeSingle(),
        supabase.rpc("agent_performance", { _employee_id: employee!.id, _from: monthStart, _to: today }),
      ]);
      return {
        att: att.data,
        perf: (perf.data?.[0] ?? null) as null | { sales_count: number; net_revenue: number; gross_revenue: number },
      };
    },
  });

  const { data: attToday } = useQuery({
    queryKey: ["dash-att-today", employee?.id, today],
    enabled: !!employee?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_records")
        .select("id, login_at, logout_at, status")
        .eq("employee_id", employee!.id)
        .eq("work_date", today)
        .maybeSingle();
      return data as null | { id: string; login_at: string | null; logout_at: string | null; status: string };
    },
  });

  const { data: activeBreak } = useQuery({
    queryKey: ["dash-active-break", employee?.id],
    enabled: !!employee?.id,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("break_records")
        .select("id, start_at, limit_minutes, break_type:break_types(name)")
        .eq("employee_id", employee!.id)
        .eq("status", "active")
        .order("start_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as null | {
        id: string;
        start_at: string;
        limit_minutes: number | null;
        break_type: { name: string } | null;
      };
    },
  });
  const { data: breakTypes = [] } = useQuery({
    queryKey: ["dash-break-types"],
    queryFn: async () =>
      (await supabase.from("break_types").select("id, name, default_limit_minutes").eq("is_active", true).order("name"))
        .data ?? [],
  });

  const checkIn = useMutation({
    mutationFn: async () => {
      if (!employee?.id) throw new Error("No employee");
      const { error } = await supabase
        .from("attendance_records")
        .upsert(
          { employee_id: employee.id, work_date: today, login_at: new Date().toISOString(), source: "auto" as const },
          { onConflict: "employee_id,work_date" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Logged in");
      qc.invalidateQueries({ queryKey: ["dash-att-today"] });
      qc.invalidateQueries({ queryKey: ["dash-personal"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const checkOut = useMutation({
    mutationFn: async () => {
      if (!attToday?.id) throw new Error("No login recorded today");
      const { error } = await supabase
        .from("attendance_records")
        .update({ logout_at: new Date().toISOString() })
        .eq("id", attToday.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Logged out");
      qc.invalidateQueries({ queryKey: ["dash-att-today"] });
      qc.invalidateQueries({ queryKey: ["dash-personal"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const startBreak = useMutation({
    mutationFn: async (breakTypeId: string) => {
      if (!employee?.id) throw new Error("No employee");
      const { data: lim } = await supabase.rpc("effective_break_limit", {
        _break_type_id: breakTypeId,
        _centre_id: employee.centre_id ?? "00000000-0000-0000-0000-000000000000",
        _department_id: employee.department_id ?? "00000000-0000-0000-0000-000000000000",
      });
      const row = Array.isArray(lim) ? lim[0] : lim;
      const { error } = await supabase.from("break_records").insert({
        employee_id: employee.id,
        break_type_id: breakTypeId,
        department_id: employee.department_id ?? null,
        centre_id: employee.centre_id ?? null,
        limit_minutes: row?.limit_minutes ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Break started");
      qc.invalidateQueries({ queryKey: ["dash-active-break"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const endBreak = useMutation({
    mutationFn: async () => {
      if (!activeBreak) throw new Error("No active break");
      const { error } = await supabase
        .from("break_records")
        .update({ end_at: new Date().toISOString() })
        .eq("id", activeBreak.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Break ended");
      qc.invalidateQueries({ queryKey: ["dash-active-break"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const [breakTypeId, setBreakTypeId] = useState<string>("");
  const [breakDlg, setBreakDlg] = useState(false);

  // Manager+ company KPIs
  const { data: kpi } = useQuery({
    queryKey: ["dash-company", from, to],
    enabled: isManager,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("company_dashboard", { _from: from, _to: to });
      if (error) throw error;
      return (data?.[0] ?? null) as null | {
        gross_revenue: number;
        refunds: number;
        chargebacks: number;
        net_revenue: number;
        logged_in: number;
        on_break: number;
        present_today: number;
        absent_today: number;
      };
    },
  });

  // Active centres — feeds dynamic per-centre rankings.
  const { data: centres = [] } = useQuery({
    queryKey: ["dash-active-centres"],
    enabled: isManager,
    queryFn: async () => {
      const { data } = await supabase.from("centres").select("id, code, name").eq("is_active", true).order("code");
      return (data ?? []) as Array<{ id: string; code: string; name: string }>;
    },
  });

  // Admin: directory counts
  const { data: counts } = useQuery({
    queryKey: ["dash-counts"],
    enabled: isAdmin,
    queryFn: async () => {
      const [emp, dept, ctr, sh] = await Promise.all([
        supabase.from("employees").select("id", { count: "exact", head: true }).eq("employment_status", "active"),
        supabase.from("departments").select("*", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("centres").select("*", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("shifts").select("*", { count: "exact", head: true }).eq("is_active", true),
      ]);
      return { emp: emp.count ?? 0, dept: dept.count ?? 0, ctr: ctr.count ?? 0, sh: sh.count ?? 0 };
    },
  });

  // Common link search for date range
  const dateSearch = { from, to } as const;

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:flex sm:items-center sm:justify-between gap-3 sm:flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight truncate">
            Welcome back, {(employee?.alias_name || employee?.full_name || "—").split(" ")[0]}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground truncate">
            {employee?.employee_code} · {roles[0]?.replace("_", " ") ?? ""}
          </p>
        </div>
        {isManager && (
          <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
            <DateRangePicker
              value={{ from, to }}
              onChange={(v) => {
                setFrom(v.from);
                setTo(v.to);
              }}
              align="end"
              className="w-full sm:min-w-[260px]"
            />
          </div>
        )}
      </div>

      {/* Quick actions */}
      <Card>
        <CardContent className="p-3 sm:p-4 flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="text-xs sm:text-sm flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Today:</span>
            <Badge variant={attToday?.login_at && !attToday?.logout_at ? "default" : "outline"}>
              {attToday?.login_at && !attToday?.logout_at
                ? "Logged in"
                : attToday?.logout_at
                  ? "Logged out"
                  : "Not logged in"}
            </Badge>
            {activeBreak && <Badge variant="secondary">On break · {activeBreak.break_type?.name ?? ""}</Badge>}
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" onClick={() => checkIn.mutate()} disabled={!!attToday?.login_at || checkIn.isPending}>
              <LogIn className="h-4 w-4 mr-1" /> Log in
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => checkOut.mutate()}
              disabled={!attToday?.login_at || !!attToday?.logout_at || checkOut.isPending}
            >
              <LogOut className="h-4 w-4 mr-1" /> Log out
            </Button>
            {activeBreak ? (
              <Button size="sm" variant="destructive" onClick={() => endBreak.mutate()} disabled={endBreak.isPending}>
                <Square className="h-4 w-4 mr-1" /> End break
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setBreakDlg(true)}
                disabled={!attToday?.login_at || !!attToday?.logout_at}
              >
                <Coffee className="h-4 w-4 mr-1" /> Start break
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={breakDlg} onOpenChange={setBreakDlg}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start a break</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Break Type</Label>
            <Select value={breakTypeId} onValueChange={setBreakTypeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select break type" />
              </SelectTrigger>
              <SelectContent>
                {(breakTypes as Array<{ id: string; name: string; default_limit_minutes: number | null }>).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                    {t.default_limit_minutes ? ` (${t.default_limit_minutes} min)` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end pt-2">
              <Button
                disabled={!breakTypeId || startBreak.isPending}
                onClick={() => {
                  startBreak.mutate(breakTypeId);
                  setBreakDlg(false);
                  setBreakTypeId("");
                }}
              >
                Start
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Personal cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Today"
          value={titleCase(personal?.att?.status) || "Not logged in"}
          hint={personal?.att?.hours_worked ? `${personal.att.hours_worked} hrs` : undefined}
          linkProps={{ to: "/attendance" }}
        />
        <KpiTile
          label="Login"
          value={
            personal?.att?.login_at
              ? new Date(personal.att.login_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : "—"
          }
          linkProps={{ to: "/attendance" }}
        />
        <KpiTile label="My Sales (MTD)" value={personal?.perf?.sales_count ?? 0} linkProps={{ to: "/sales" }} />
        <KpiTile
          label="My Net (MTD)"
          value={fmtUSD(personal?.perf?.net_revenue ?? 0)}
          highlight
          linkProps={{ to: "/sales" }}
        />
      </div>

      {/* Manager+ KPIs */}
      {isManager && (
        <>
          {/* Attendance — live, top of fold */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Attendance — Today</h2>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <KpiTile
                label="Logged In"
                value={kpi?.logged_in ?? 0}
                linkProps={{ to: "/attendance/team", search: { ...dateSearch, view: "logged_in" } as never }}
              />
              <KpiTile label="On Break" value={kpi?.on_break ?? 0} linkProps={{ to: "/breaks/team" }} />
              <KpiTile
                label="Present Today"
                value={kpi?.present_today ?? 0}
                linkProps={{ to: "/attendance/team", search: { ...dateSearch, view: "present" } as never }}
              />
              <KpiTile
                label="Absent Today"
                value={kpi?.absent_today ?? 0}
                linkProps={{ to: "/attendance/team", search: { ...dateSearch, view: "absent" } as never }}
              />
            </div>
          </section>

          {/* Sales — Today */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Sales — Today</h2>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <KpiTile
                label="Today's Sales"
                value={fmtUSD(todayKpi?.gross_revenue ?? 0)}
                linkProps={{ to: "/sales/team", search: { kind: "sales", from: today, to: today } as never }}
              />
              <KpiTile
                label="Today's Refunds"
                value={fmtUSD(todayKpi?.refunds ?? 0)}
                linkProps={{ to: "/sales/team", search: { kind: "refund", from: today, to: today } as never }}
              />
              <KpiTile
                label="Today's Chargebacks"
                value={fmtUSD(todayKpi?.chargebacks ?? 0)}
                linkProps={{ to: "/sales/team", search: { kind: "chargeback", from: today, to: today } as never }}
              />
              <KpiTile
                label="Today's Net Revenue"
                value={fmtUSD(todayKpi?.net_revenue ?? 0)}
                highlight
                linkProps={{ to: "/sales/team", search: { from: today, to: today } as never }}
              />
            </div>
          </section>

          {/* Sales — This Month */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Sales — This Month</h2>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <KpiTile
                label="MTD Sales"
                value={fmtUSD(monthKpi?.gross_revenue ?? 0)}
                linkProps={{ to: "/sales/team", search: { kind: "sales", from: monthStart, to: today } as never }}
              />
              <KpiTile
                label="MTD Refunds"
                value={fmtUSD(monthKpi?.refunds ?? 0)}
                linkProps={{ to: "/sales/team", search: { kind: "refund", from: monthStart, to: today } as never }}
              />
              <KpiTile
                label="MTD Chargebacks"
                value={fmtUSD(monthKpi?.chargebacks ?? 0)}
                linkProps={{ to: "/sales/team", search: { kind: "chargeback", from: monthStart, to: today } as never }}
              />
              <KpiTile
                label="MTD Net Revenue"
                value={fmtUSD(monthKpi?.net_revenue ?? 0)}
                highlight
                linkProps={{ to: "/sales/team", search: { from: monthStart, to: today } as never }}
              />
            </div>
          </section>

          {/* Sales — Custom Range (top-of-card date range still applies) */}
          {isCustomRange && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Sales — Selected Range
              </h2>
              <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                <KpiTile
                  label="Gross (Sales)"
                  value={fmtUSD(kpi?.gross_revenue ?? 0)}
                  linkProps={{ to: "/sales/team", search: { kind: "sales", from, to } as never }}
                />
                <KpiTile
                  label="Refunds"
                  value={fmtUSD(kpi?.refunds ?? 0)}
                  linkProps={{ to: "/sales/team", search: { kind: "refund", from, to } as never }}
                />
                <KpiTile
                  label="Chargebacks"
                  value={fmtUSD(kpi?.chargebacks ?? 0)}
                  linkProps={{ to: "/sales/team", search: { kind: "chargeback", from, to } as never }}
                />
                <KpiTile
                  label="Net Revenue"
                  value={fmtUSD(kpi?.net_revenue ?? 0)}
                  highlight
                  linkProps={{ to: "/sales/team", search: { from, to } as never }}
                />
              </div>
            </section>
          )}

          {/* Dynamic rankings — one panel per active centre + company-wide */}
          <div className="grid gap-4">
            <AgentRankings title="Company-wide — Top & Bottom 5 Agents (Current Month)" centreId={null} from={monthStart} to={today} />
            {centres.map((c) => (
              <AgentRankings
                key={c.id}
                title={`${c.name || c.code} — Top & Bottom 5 Agents (Current Month)`}
                centreId={c.id}
                from={monthStart}
                to={today}
              />
            ))}
          </div>
        </>
      )}

      {/* Admin: directory counts */}
      {isAdmin && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <KpiTile label="Active Employees" value={counts?.emp ?? "—"} linkProps={{ to: "/admin/employees" }} />
          <KpiTile label="Departments" value={counts?.dept ?? "—"} linkProps={{ to: "/admin/departments" }} />
          <KpiTile label="Centres" value={counts?.ctr ?? "—"} linkProps={{ to: "/admin/centres" }} />
          <KpiTile label="Shifts" value={counts?.sh ?? "—"} linkProps={{ to: "/admin/shifts" }} />
        </div>
      )}
    </div>
  );
}

// Suppress unused-import warnings for shape parity (Link kept available for ad-hoc additions).
void Link; // Touch for HMR rebuild
