import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Users, Coffee, AlertCircle, Trophy, BarChart3, CheckCircle2, Megaphone } from "lucide-react";

export const Route = createFileRoute("/_authenticated/command-center")({
  head: () => ({ meta: [{ title: "Command Center — JD Connect" }] }),
  component: CommandCenterPage,
});

function CommandCenterPage() {
  const { isAdmin, hasRole, loading } = useAuth();
  const { can, isLoading: permsLoading } = usePermissions();
  const canView = isAdmin || hasRole("manager") || hasRole("team_leader") || can("attendance.view_team") || can("sales.view_team");

  if (loading || permsLoading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!canView) return <Navigate to="/dashboard" />;

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Command Center</h1>
        <p className="text-sm text-muted-foreground">Live workforce visibility, leaderboards, and announcement coverage.</p>
      </div>
      <Tabs defaultValue="live">
        <TabsList>
          <TabsTrigger value="live"><Users className="h-4 w-4 mr-1.5" />Live</TabsTrigger>
          <TabsTrigger value="leaderboard"><Trophy className="h-4 w-4 mr-1.5" />Leaderboard</TabsTrigger>
          <TabsTrigger value="performance"><BarChart3 className="h-4 w-4 mr-1.5" />Performance</TabsTrigger>
          <TabsTrigger value="acks"><Megaphone className="h-4 w-4 mr-1.5" />Acknowledgements</TabsTrigger>
        </TabsList>
        <TabsContent value="live" className="mt-4"><LiveStatus /></TabsContent>
        <TabsContent value="leaderboard" className="mt-4"><Leaderboard /></TabsContent>
        <TabsContent value="performance" className="mt-4"><PerformanceSnapshots /></TabsContent>
        <TabsContent value="acks" className="mt-4"><AcknowledgementReport /></TabsContent>
      </Tabs>
    </div>
  );
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const monthStartISO = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };

function LiveStatus() {
  const { data, isLoading } = useQuery({
    queryKey: ["cc-live", todayISO()],
    refetchInterval: 30_000,
    queryFn: async () => {
      const today = todayISO();
      const [emps, attendance, breaks] = await Promise.all([
        supabase.from("employees").select("id, full_name, profile_photo_url, designation").eq("employment_status", "active"),
        supabase.from("attendance_records").select("employee_id, login_at, logout_at, status, is_late").eq("work_date", today),
        supabase.from("break_records").select("employee_id, start_at, break_type_id").is("end_at", null),
      ]);
      if (emps.error) throw emps.error;
      return {
        employees: emps.data ?? [],
        attendance: attendance.data ?? [],
        breaks: breaks.data ?? [],
      };
    },
  });

  const stats = useMemo(() => {
    if (!data) return { present: [], onBreak: [], absent: [], late: [] };
    const attMap = new Map(data.attendance.map(a => [a.employee_id, a]));
    const breakSet = new Set(data.breaks.map(b => b.employee_id));
    const present: typeof data.employees = [];
    const onBreak: typeof data.employees = [];
    const absent: typeof data.employees = [];
    const late: typeof data.employees = [];
    for (const e of data.employees) {
      const a = attMap.get(e.id);
      if (breakSet.has(e.id)) onBreak.push(e);
      else if (a && a.login_at && !a.logout_at) present.push(e);
      else if (!a || !a.login_at) absent.push(e);
      if (a?.is_late) late.push(e);
    }
    return { present, onBreak, absent, late };
  }, [data]);

  if (isLoading) return <div className="text-muted-foreground">Loading live status…</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Present" count={stats.present.length} icon={Users} tone="success" />
        <StatCard label="On Break" count={stats.onBreak.length} icon={Coffee} tone="warning" />
        <StatCard label="Absent" count={stats.absent.length} icon={AlertCircle} tone="muted" />
        <StatCard label="Late Today" count={stats.late.length} icon={AlertCircle} tone="destructive" />
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <EmployeeListCard title="Present" list={stats.present} dotClass="bg-emerald-500" />
        <EmployeeListCard title="On Break" list={stats.onBreak} dotClass="bg-orange-500" />
        <EmployeeListCard title="Absent" list={stats.absent} dotClass="bg-muted-foreground/50" />
      </div>
    </div>
  );
}

function StatCard({ label, count, icon: Icon, tone }: { label: string; count: number; icon: React.ComponentType<{className?: string}>; tone: "success"|"warning"|"muted"|"destructive" }) {
  const tones: Record<string, string> = {
    success: "text-emerald-600",
    warning: "text-amber-600",
    muted: "text-muted-foreground",
    destructive: "text-destructive",
  };
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold">{count}</div>
        </div>
        <Icon className={`h-8 w-8 ${tones[tone]}`} />
      </CardContent>
    </Card>
  );
}

function EmployeeListCard({ title, list, dotClass }: { title: string; list: { id: string; full_name: string; profile_photo_url: string | null; designation: string | null }[]; dotClass: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center justify-between">{title}<Badge variant="secondary">{list.length}</Badge></CardTitle></CardHeader>
      <CardContent className="space-y-2 max-h-96 overflow-y-auto">
        {list.length === 0 && <div className="text-xs text-muted-foreground">Nobody here.</div>}
        {list.map(e => (
          <div key={e.id} className="flex items-center gap-2">
            <div className="relative">
              <Avatar className="h-7 w-7"><AvatarImage src={e.profile_photo_url ?? undefined} /><AvatarFallback>{e.full_name.slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
              <span className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background", dotClass)} />
            </div>
            <div className="min-w-0">
              <div className="text-sm truncate">{e.full_name}</div>
              {e.designation && <div className="text-xs text-muted-foreground truncate">{e.designation}</div>}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Leaderboard() {
  const [range, setRange] = useState<"today"|"month">("month");
  const { data = [], isLoading } = useQuery({
    queryKey: ["cc-leaderboard", range],
    queryFn: async () => {
      const since = range === "today" ? todayISO() : monthStartISO();
      const { data, error } = await supabase
        .from("sales_entries")
        .select("employee_id, sales_amount_usd, sales_count, employees!sales_entries_employee_id_fkey(full_name, profile_photo_url)")
        .gte("sale_date", since);
      if (error) throw error;
      const agg = new Map<string, { name: string; photo: string | null; total: number; count: number }>();
      for (const row of (data ?? []) as Array<{ employee_id: string; sales_amount_usd: number | null; sales_count: number | null; employees: { full_name: string; profile_photo_url: string | null } | null }>) {
        const id = row.employee_id;
        const prev = agg.get(id) ?? { name: row.employees?.full_name ?? "Unknown", photo: row.employees?.profile_photo_url ?? null, total: 0, count: 0 };
        prev.total += Number(row.sales_amount_usd ?? 0);
        prev.count += Number(row.sales_count ?? 0);
        agg.set(id, prev);
      }
      return Array.from(agg.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.total - a.total).slice(0, 20);
    },
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-500" />Top Sales</CardTitle>
        <Select value={range} onValueChange={(v) => setRange(v as "today"|"month")}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {isLoading ? <div className="text-muted-foreground">Loading…</div> : (
          <Table>
            <TableHeader><TableRow><TableHead className="w-12">#</TableHead><TableHead>Employee</TableHead><TableHead className="text-right">Sales</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No sales in this period.</TableCell></TableRow>}
              {data.map((row, i) => (
                <TableRow key={row.id}>
                  <TableCell><Badge variant={i < 3 ? "default" : "secondary"}>{i + 1}</Badge></TableCell>
                  <TableCell className="flex items-center gap-2">
                    <Avatar className="h-7 w-7"><AvatarImage src={row.photo ?? undefined} /><AvatarFallback>{row.name.slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
                    <span>{row.name}</span>
                  </TableCell>
                  <TableCell className="text-right">{row.count}</TableCell>
                  <TableCell className="text-right font-medium">₹{row.total.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function PerformanceSnapshots() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["cc-snapshots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("performance_snapshots")
        .select("id, period_type, period_start, period_end, sales_count, gross_revenue, net_revenue, refunds, chargebacks, employees!performance_snapshots_employee_id_fkey(full_name)")
        .order("period_start", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Performance Snapshots</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <div className="text-muted-foreground">Loading…</div> : (
          <Table>
            <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Period</TableHead><TableHead className="text-right">Sales</TableHead><TableHead className="text-right">Gross</TableHead><TableHead className="text-right">Refunds</TableHead><TableHead className="text-right">Net</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No snapshots yet.</TableCell></TableRow>}
              {(data as Array<{id:string; period_type:string; period_start:string; period_end:string; sales_count:number; gross_revenue:number; net_revenue:number; refunds:number; chargebacks:number; employees:{full_name:string}|null}>).map(s => (
                <TableRow key={s.id}>
                  <TableCell>{s.employees?.full_name ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline">{s.period_type}</Badge> <span className="text-xs text-muted-foreground ml-1">{s.period_start} → {s.period_end}</span></TableCell>
                  <TableCell className="text-right">{s.sales_count}</TableCell>
                  <TableCell className="text-right">₹{Number(s.gross_revenue).toLocaleString()}</TableCell>
                  <TableCell className="text-right text-destructive">₹{Number(s.refunds).toLocaleString()}</TableCell>
                  <TableCell className="text-right font-medium">₹{Number(s.net_revenue).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function AcknowledgementReport() {
  const { data, isLoading } = useQuery({
    queryKey: ["cc-acks"],
    queryFn: async () => {
      const [{ data: anns, error: e1 }, { count: total, error: e2 }] = await Promise.all([
        supabase.from("announcements").select("id, title, priority, requires_ack, created_at, acks:announcement_acknowledgements(employee_id)").eq("requires_ack", true).order("created_at", { ascending: false }).limit(50),
        supabase.from("employees").select("id", { count: "exact", head: true }).eq("employment_status", "active"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      return { anns: anns ?? [], total: total ?? 0 };
    },
  });

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />Critical Acknowledgements</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Priority</TableHead><TableHead>Posted</TableHead><TableHead className="text-right">Acknowledged</TableHead><TableHead className="text-right">Coverage</TableHead></TableRow></TableHeader>
          <TableBody>
            {(data?.anns ?? []).length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No announcements requiring acknowledgement.</TableCell></TableRow>}
            {(data?.anns ?? []).map((a: { id: string; title: string; priority: string; created_at: string; acks: { employee_id: string }[] }) => {
              const ackCount = a.acks?.length ?? 0;
              const pct = data!.total ? Math.round((ackCount / data!.total) * 100) : 0;
              return (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.title}</TableCell>
                  <TableCell><Badge variant={a.priority === "critical" ? "destructive" : a.priority === "important" ? "default" : "secondary"}>{a.priority}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">{ackCount} / {data!.total}</TableCell>
                  <TableCell className="text-right"><Badge variant={pct >= 80 ? "default" : pct >= 50 ? "secondary" : "destructive"}>{pct}%</Badge></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}