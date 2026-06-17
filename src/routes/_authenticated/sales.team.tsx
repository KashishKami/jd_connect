import { createFileRoute } from "@tanstack/react-router";
import { useRouteGuard, AccessDenied } from "@/components/PermissionGate";
import { usePermissions } from "@/hooks/usePermissions";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Download, ClipboardList, Pencil, Trash2 } from "lucide-react";
import { downloadCSV, toCSV, fmtUSD } from "@/lib/csv";
import { DateRangePicker } from "@/components/DateRangePicker";
import { formatDate } from "@/lib/utils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/sales/team")({
  head: () => ({ meta: [{ title: "Team Sales — JD Connect" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    kind: (["sales", "refund", "chargeback"] as const).includes(s.kind as never)
      ? (s.kind as "sales" | "refund" | "chargeback")
      : undefined,
    from: typeof s.from === "string" ? (s.from as string) : undefined,
    to: typeof s.to === "string" ? (s.to as string) : undefined,
  }),
  component: TeamSales,
});

const today = () => new Date().toISOString().slice(0, 10);

function TeamSales() {
  const __guard = useRouteGuard("sales.view_team");
  const { employee, roles, isAdmin } = useAuth();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const search = Route.useSearch();
  const kind = search.kind;
  // canEnter: built-in manager/team_leader roles OR the granular sales.enter_team permission
  const canEnter = isAdmin || roles.includes("manager") || roles.includes("team_leader") || can("sales.enter_team");
  // isManager: controls whether the user sees the full company leaderboard (true) or just their team (false)
  const isManager = isAdmin || roles.includes("manager") || can("sales.view_all");
  const [from, setFrom] = useState(() => search.from ?? today());
  const [to, setTo] = useState(() => search.to ?? today());

  const { data: team = [] } = useQuery({
    queryKey: ["team-perf", employee?.id, isManager, from, to],
    enabled: !!employee?.id,
    queryFn: async () => {
      // Admins and managers see the full company leaderboard (every agent with activity);
      // team leaders see only their direct team.
      if (isManager) {
        const { data, error } = await supabase.rpc("leaderboard", { _from: from, _to: to, _limit: 500 });
        if (error) throw error;
        return (data ?? []) as Array<{
          employee_id: string;
          full_name: string;
          employee_code: string;
          sales_count: number;
          gross_revenue: number;
          refunds: number;
          chargebacks: number;
          net_revenue: number;
        }>;
      }
      const { data, error } = await supabase.rpc("team_performance", {
        _team_leader_id: employee!.id,
        _from: from,
        _to: to,
      });
      if (error) throw error;
      return (data ?? []) as Array<{
        employee_id: string;
        full_name: string;
        employee_code: string;
        sales_count: number;
        gross_revenue: number;
        refunds: number;
        chargebacks: number;
        net_revenue: number;
      }>;
    },
  });

  const { data: sources = [] } = useQuery({
    queryKey: ["sources-active"],
    queryFn: async () => {
      const { data } = await supabase.from("sales_sources").select("id, name").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  // Agents pickable in the entry dialog. Managers/admins can log for any active employee;
  // team leaders can only log for their team.
  const { data: agents = [] } = useQuery({
    queryKey: ["entry-agents", employee?.id, isManager],
    enabled: canEnter && !!employee?.id,
    queryFn: async () => {
      if (isManager) {
        const { data, error } = await supabase
          .from("employees")
          .select("id, full_name, alias_name, employee_code")
          .eq("employment_status", "active")
          .order("full_name");
        if (error) throw error;
        return (data ?? []).map((e) => ({
          employee_id: e.id,
          full_name: e.alias_name || e.full_name,
          employee_code: e.employee_code,
        }));
      }
      return team.map((t) => ({ employee_id: t.employee_id, full_name: t.full_name, employee_code: t.employee_code }));
    },
  });

  const exportCsv = () => {
    downloadCSV(`team-performance-${from}_to_${to}.csv`, toCSV(team as any));
  };

  // When drilled in from a specific KPI, filter the visible rows to those that
  // actually contributed to that bucket (matches the dashboard number).
  const visible = useMemo(() => {
    if (!kind) return team;
    if (kind === "sales") return team.filter((r) => Number(r.sales_count) > 0 || Number(r.gross_revenue) > 0);
    if (kind === "refund") return team.filter((r) => Number(r.refunds) > 0);
    return team.filter((r) => Number(r.chargebacks) > 0);
  }, [team, kind]);

  const totals = visible.reduce(
    (a, r) => ({
      cnt: a.cnt + Number(r.sales_count),
      gross: a.gross + Number(r.gross_revenue),
      ref: a.ref + Number(r.refunds),
      cb: a.cb + Number(r.chargebacks),
      net: a.net + Number(r.net_revenue),
    }),
    { cnt: 0, gross: 0, ref: 0, cb: 0, net: 0 },
  );

  const kindLabel =
    kind === "refund" ? "Refunds" : kind === "chargeback" ? "Chargebacks" : kind === "sales" ? "Sales" : null;

  if (!__guard.isLoading && !__guard.allowed) return <AccessDenied perm="sales.view_team" label="team sales" />;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ClipboardList className="h-6 w-6" /> Team Performance
          </h1>
          {kindLabel && (
            <p className="text-xs text-muted-foreground mt-1">
              Filtered: {kindLabel} only ·{" "}
              <a href="/sales/team" className="text-primary hover:underline">
                clear
              </a>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <DateRangePicker
            value={{ from, to }}
            onChange={(v) => {
              setFrom(v.from);
              setTo(v.to);
            }}
            align="end"
          />
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
          {canEnter && (
            <EntryDialog
              team={agents}
              sources={sources}
              onSaved={() => qc.invalidateQueries({ queryKey: ["team-perf"] })}
            />
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{kindLabel ? `${kindLabel} — Agents` : "Team Summary"}</CardTitle>
        </CardHeader>
        <CardContent>
          {!kind && (
            <div className="grid gap-3 sm:grid-cols-5 mb-4">
              <Stat label="Sales" value={String(totals.cnt)} />
              <Stat label="Gross" value={fmtUSD(totals.gross)} />
              <Stat label="Refunds" value={fmtUSD(totals.ref)} />
              <Stat label="Chargebacks" value={fmtUSD(totals.cb)} />
              <Stat label="Net" value={fmtUSD(totals.net)} highlight />
            </div>
          )}
          {kind && (
            <div className="grid gap-3 sm:grid-cols-3 mb-4">
              <Stat label="Agents" value={String(visible.length)} />
              <Stat
                label="Total"
                value={fmtUSD(kind === "sales" ? totals.gross : kind === "refund" ? totals.ref : totals.cb)}
                highlight
              />
              <Stat label="Sales Count" value={String(totals.cnt)} />
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Refunds</TableHead>
                <TableHead className="text-right">Chargebacks</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    {kindLabel ? `No ${kindLabel.toLowerCase()} in range.` : "No team members or no data."}
                  </TableCell>
                </TableRow>
              )}
              {visible.map((r) => (
                <TableRow key={r.employee_id}>
                  <TableCell>
                    {r.full_name} <span className="text-xs text-muted-foreground">{r.employee_code}</span>
                  </TableCell>
                  <TableCell className="text-right">{r.sales_count}</TableCell>
                  <TableCell className="text-right">{fmtUSD(r.gross_revenue)}</TableCell>
                  <TableCell className="text-right">{fmtUSD(r.refunds)}</TableCell>
                  <TableCell className="text-right">{fmtUSD(r.chargebacks)}</TableCell>
                  <TableCell className="text-right font-semibold">{fmtUSD(r.net_revenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {canEnter && (
        <EntriesPanel
          from={from}
          to={to}
          isAdmin={!!isAdmin}
          isManager={isManager}
          agents={agents}
          sources={sources}
          initialKind={kind ?? "sales"}
          onChanged={() => qc.invalidateQueries({ queryKey: ["team-perf"] })}
        />
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-primary" : ""}>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-base font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

type EntryKind = "sales" | "refund" | "chargeback";

type SalesRow = {
  id: string;
  sale_date: string;
  sales_count: number;
  sales_amount_usd: number;
  source_id: string | null;
  notes: string | null;
  employee_id: string;
  employees?: { full_name: string; alias_name: string | null; employee_code: string } | null;
};
type RefundRow = {
  id: string;
  refund_date: string;
  amount_usd: number;
  reason: string | null;
  employee_id: string;
  employees?: { full_name: string; alias_name: string | null; employee_code: string } | null;
};
type ChargebackRow = {
  id: string;
  chargeback_date: string;
  amount_usd: number;
  reason: string | null;
  employee_id: string;
  employees?: { full_name: string; alias_name: string | null; employee_code: string } | null;
};

function EntriesPanel({
  from, to, isAdmin, isManager, agents, sources, initialKind, onChanged,
}: {
  from: string;
  to: string;
  isAdmin: boolean;
  isManager: boolean;
  agents: Array<{ employee_id: string; full_name: string; employee_code: string }>;
  sources: Array<{ id: string; name: string }>;
  initialKind: EntryKind;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<EntryKind>(initialKind);
  const [agentFilter, setAgentFilter] = useState<string>("__all");

  const salesQ = useQuery({
    queryKey: ["entries-sales", from, to, agentFilter],
    enabled: tab === "sales",
    queryFn: async () => {
      let q = supabase
        .from("sales_entries")
        .select(`id, sale_date, sales_count, sales_amount_usd, source_id, notes, employee_id, employees!sales_entries_employee_id_fkey(full_name, alias_name, employee_code)`)
        .gte("sale_date", from).lte("sale_date", to)
        .order("sale_date", { ascending: false });
      if (agentFilter !== "__all") q = q.eq("employee_id", agentFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as SalesRow[];
    },
  });

  const refundQ = useQuery({
    queryKey: ["entries-refund", from, to, agentFilter],
    enabled: tab === "refund",
    queryFn: async () => {
      let q = supabase
        .from("refund_entries")
        .select(`id, refund_date, amount_usd, reason, employee_id, employees!refund_entries_employee_id_fkey(full_name, alias_name, employee_code)`)
        .gte("refund_date", from).lte("refund_date", to)
        .order("refund_date", { ascending: false });
      if (agentFilter !== "__all") q = q.eq("employee_id", agentFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as RefundRow[];
    },
  });

  const cbQ = useQuery({
    queryKey: ["entries-chargeback", from, to, agentFilter],
    enabled: tab === "chargeback",
    queryFn: async () => {
      let q = supabase
        .from("chargeback_entries")
        .select(`id, chargeback_date, amount_usd, reason, employee_id, employees!chargeback_entries_employee_id_fkey(full_name, alias_name, employee_code)`)
        .gte("chargeback_date", from).lte("chargeback_date", to)
        .order("chargeback_date", { ascending: false });
      if (agentFilter !== "__all") q = q.eq("employee_id", agentFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ChargebackRow[];
    },
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["entries-sales"] });
    qc.invalidateQueries({ queryKey: ["entries-refund"] });
    qc.invalidateQueries({ queryKey: ["entries-chargeback"] });
    onChanged();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle>Entries</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="w-56"><SelectValue placeholder="All agents" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All agents</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a.employee_id} value={a.employee_id}>
                  {a.full_name} · {a.employee_code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={(v) => setTab(v as EntryKind)}>
          <TabsList className="grid grid-cols-3 w-full max-w-md">
            <TabsTrigger value="sales">Sales</TabsTrigger>
            <TabsTrigger value="refund">Refunds</TabsTrigger>
            <TabsTrigger value="chargeback">Chargebacks</TabsTrigger>
          </TabsList>

          <TabsContent value="sales" className="m-0 mt-3">
            <EntriesTable
              kind="sales"
              rows={salesQ.data ?? []}
              loading={salesQ.isLoading}
              isAdmin={isAdmin}
              isManager={isManager}
              sources={sources}
              onChanged={invalidateAll}
            />
          </TabsContent>
          <TabsContent value="refund" className="m-0 mt-3">
            <EntriesTable
              kind="refund"
              rows={refundQ.data ?? []}
              loading={refundQ.isLoading}
              isAdmin={isAdmin}
              isManager={isManager}
              sources={sources}
              onChanged={invalidateAll}
            />
          </TabsContent>
          <TabsContent value="chargeback" className="m-0 mt-3">
            <EntriesTable
              kind="chargeback"
              rows={cbQ.data ?? []}
              loading={cbQ.isLoading}
              isAdmin={isAdmin}
              isManager={isManager}
              sources={sources}
              onChanged={invalidateAll}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function EntriesTable({
  kind, rows, loading, isAdmin, isManager, sources, onChanged,
}: {
  kind: EntryKind;
  rows: Array<SalesRow | RefundRow | ChargebackRow>;
  loading: boolean;
  isAdmin: boolean;
  isManager: boolean;
  sources: Array<{ id: string; name: string }>;
  onChanged: () => void;
}) {
  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!rows.length) return <p className="text-sm text-muted-foreground">No entries in this range.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Agent</TableHead>
          {kind === "sales" && <TableHead className="text-right">Count</TableHead>}
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>{kind === "sales" ? "Source / Notes" : "Reason"}</TableHead>
          <TableHead className="text-right w-32">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const date = kind === "sales" ? (r as SalesRow).sale_date
            : kind === "refund" ? (r as RefundRow).refund_date
            : (r as ChargebackRow).chargeback_date;
          const amount = kind === "sales" ? (r as SalesRow).sales_amount_usd : (r as RefundRow | ChargebackRow).amount_usd;
          const emp = r.employees;
          const name = emp ? (emp.alias_name || emp.full_name) : "—";
          return (
            <TableRow key={r.id}>
              <TableCell>{formatDate(date)}</TableCell>
              <TableCell>
                {name} <span className="text-xs text-muted-foreground">{emp?.employee_code}</span>
              </TableCell>
              {kind === "sales" && <TableCell className="text-right">{(r as SalesRow).sales_count}</TableCell>}
              <TableCell className="text-right">{fmtUSD(amount)}</TableCell>
              <TableCell className="max-w-xs truncate">
                {kind === "sales"
                  ? [(sources.find((s) => s.id === (r as SalesRow).source_id)?.name), (r as SalesRow).notes].filter(Boolean).join(" — ")
                  : ((r as RefundRow | ChargebackRow).reason ?? "")}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {isManager && (
                    <EditEntryDialog kind={kind} row={r} sources={sources} onSaved={onChanged} />
                  )}
                  {isAdmin && (
                    <DeleteEntryButton kind={kind} id={r.id} onDeleted={onChanged} />
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function tableFor(kind: EntryKind) {
  return kind === "sales" ? "sales_entries" : kind === "refund" ? "refund_entries" : "chargeback_entries";
}
function dateColFor(kind: EntryKind) {
  return kind === "sales" ? "sale_date" : kind === "refund" ? "refund_date" : "chargeback_date";
}

function EditEntryDialog({
  kind, row, sources, onSaved,
}: {
  kind: EntryKind;
  row: SalesRow | RefundRow | ChargebackRow;
  sources: Array<{ id: string; name: string }>;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const initialDate = kind === "sales" ? (row as SalesRow).sale_date
    : kind === "refund" ? (row as RefundRow).refund_date
    : (row as ChargebackRow).chargeback_date;
  const initialAmount = kind === "sales" ? (row as SalesRow).sales_amount_usd : (row as RefundRow | ChargebackRow).amount_usd;
  const [date, setDate] = useState(initialDate);
  const [amount, setAmount] = useState(String(initialAmount ?? 0));
  const [salesCount, setSalesCount] = useState(kind === "sales" ? String((row as SalesRow).sales_count ?? 0) : "0");
  const [sourceId, setSourceId] = useState<string>(kind === "sales" ? ((row as SalesRow).source_id ?? "") : "");
  const [notes, setNotes] = useState(kind === "sales" ? ((row as SalesRow).notes ?? "") : "");
  const [reason, setReason] = useState(
    kind === "sales" ? "" : ((row as RefundRow | ChargebackRow).reason ?? ""),
  );

  const mut = useMutation({
    mutationFn: async () => {
      const tbl = tableFor(kind);
      const dateCol = dateColFor(kind);
      const patch: Record<string, unknown> = { [dateCol]: date };
      if (kind === "sales") {
        patch.sales_amount_usd = Number(amount) || 0;
        patch.sales_count = Number(salesCount) || 0;
        patch.source_id = sourceId || null;
        patch.notes = notes || null;
      } else {
        patch.amount_usd = Number(amount) || 0;
        patch.reason = reason || null;
      }
      const { error } = await (supabase.from(tbl) as any).update(patch).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Entry updated");
      setOpen(false);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Edit entry">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {kind === "sales" ? "Sale" : kind === "refund" ? "Refund" : "Chargeback"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Amount (USD)</Label>
              <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          {kind === "sales" && (
            <>
              <div>
                <Label>Sales Count</Label>
                <Input type="number" min={0} value={salesCount} onChange={(e) => setSalesCount(e.target.value)} />
              </div>
              <div>
                <Label>Source</Label>
                <Select value={sourceId} onValueChange={setSourceId}>
                  <SelectTrigger><SelectValue placeholder="Select source…" /></SelectTrigger>
                  <SelectContent>
                    {sources.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </>
          )}
          {kind !== "sales" && (
            <div>
              <Label>Reason</Label>
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteEntryButton({ kind, id, onDeleted }: { kind: EntryKind; id: string; onDeleted: () => void }) {
  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from(tableFor(kind)).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Entry deleted");
      onDeleted();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Delete entry">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); mut.mutate(); }} disabled={mut.isPending}>
            {mut.isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function EntryDialog({
  team,
  sources,
  onSaved,
}: {
  team: Array<{ employee_id: string; full_name: string; employee_code: string }>;
  sources: Array<{ id: string; name: string }>;
  onSaved: () => void;
}) {
  const { employee } = useAuth();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"sales" | "refund" | "chargeback">("sales");
  const [date, setDate] = useState(today());
  const [empId, setEmpId] = useState<string>("");
  const [salesCount, setSalesCount] = useState("1");
  const [amount, setAmount] = useState("0");
  const [sourceId, setSourceId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      if (!empId) throw new Error("Select an agent");
      const enteredBy = employee?.id ?? null;
      if (kind === "sales") {
        const { error } = await supabase.from("sales_entries").insert({
          sale_date: date,
          employee_id: empId,
          sales_count: Number(salesCount) || 0,
          sales_amount_usd: Number(amount) || 0,
          source_id: sourceId || null,
          notes: notes || null,
          entered_by: enteredBy,
        });
        if (error) throw error;
      } else if (kind === "refund") {
        const { error } = await supabase.from("refund_entries").insert({
          refund_date: date,
          employee_id: empId,
          amount_usd: Number(amount) || 0,
          reason: reason || null,
          entered_by: enteredBy,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("chargeback_entries").insert({
          chargeback_date: date,
          employee_id: empId,
          amount_usd: Number(amount) || 0,
          reason: reason || null,
          entered_by: enteredBy,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Entry saved");
      setOpen(false);
      setAmount("0");
      setSalesCount("1");
      setNotes("");
      setReason("");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" /> New Entry
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Entry</DialogTitle>
        </DialogHeader>
        <Tabs value={kind} onValueChange={(v) => setKind(v as "sales" | "refund" | "chargeback")}>
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="sales">Sale</TabsTrigger>
            <TabsTrigger value="refund">Refund</TabsTrigger>
            <TabsTrigger value="chargeback">Chargeback</TabsTrigger>
          </TabsList>
          <div className="space-y-3 mt-4">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <Label>Agent</Label>
                <Select value={empId} onValueChange={setEmpId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {team.map((t) => (
                      <SelectItem key={t.employee_id} value={t.employee_id}>
                        {t.full_name} · {t.employee_code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <TabsContent value="sales" className="space-y-3 m-0">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Sales Count</Label>
                  <Input type="number" min={0} value={salesCount} onChange={(e) => setSalesCount(e.target.value)} />
                </div>
                <div>
                  <Label>Amount (USD)</Label>
                  <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Source</Label>
                <Select value={sourceId} onValueChange={setSourceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select source…" />
                  </SelectTrigger>
                  <SelectContent>
                    {sources.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </TabsContent>
            <TabsContent value="refund" className="space-y-3 m-0">
              <div>
                <Label>Refund Amount (USD)</Label>
                <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div>
                <Label>Reason</Label>
                <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            </TabsContent>
            <TabsContent value="chargeback" className="space-y-3 m-0">
              <div>
                <Label>Chargeback Amount (USD)</Label>
                <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div>
                <Label>Reason</Label>
                <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            </TabsContent>
          </div>
        </Tabs>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
