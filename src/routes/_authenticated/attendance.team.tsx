import { usePermissions } from "@/hooks/usePermissions";
import { createFileRoute } from "@tanstack/react-router";
import { useRouteGuard, AccessDenied } from "@/components/PermissionGate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { DateRangePicker } from "@/components/DateRangePicker";
import { formatDate, formatDateTime } from "@/lib/utils";

type AttSearch = { from?: string; to?: string; view?: "all" | "logged_in" | "present" | "absent" };

export const Route = createFileRoute("/_authenticated/attendance/team")({
  head: () => ({ meta: [{ title: "Team Attendance — JD Connect" }] }),
  validateSearch: (s: Record<string, unknown>): AttSearch => ({
    from: typeof s.from === "string" ? s.from : undefined,
    to: typeof s.to === "string" ? s.to : undefined,
    view: ["all", "logged_in", "present", "absent"].includes(s.view as string)
      ? (s.view as AttSearch["view"])
      : undefined,
  }),
  component: TeamAttendance,
});

const today = () => new Date().toISOString().slice(0, 10);

type AttRow = {
  id: string;
  employee_id: string;
  work_date: string;
  login_at: string | null;
  logout_at: string | null;
  hours_worked: number | null;
  status: string;
  source: string;
  employees: { full_name: string; alias_name: string | null; employee_code: string } | null;
};

type CorrRow = {
  id: string;
  employee_id: string;
  work_date: string;
  reason: string;
  status: string;
  requested_login_at: string | null;
  requested_logout_at: string | null;
  requested_status: string | null;
  review_notes: string | null;
  employees: { full_name: string; alias_name: string | null; employee_code: string } | null;
};

type LeaveRow = {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  review_notes: string | null;
  employees: { full_name: string; alias_name: string | null; employee_code: string } | null;
};

function statusBadge(s: string) {
  const map: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    present: "default",
    half_day: "secondary",
    absent: "destructive",
    logged_in: "default",
    late: "secondary",
    leave: "outline",
    weekly_off: "outline",
    holiday: "outline",
  };
  return (
    <Badge variant={map[s] ?? "outline"} className="capitalize">
      {s.replace(/_/g, " ")}
    </Badge>
  );
}

function effectiveStatus(r: { status: string; login_at: string | null; logout_at: string | null }) {
  if (r.login_at && !r.logout_at) return "logged_in";
  return r.status;
}

function TeamAttendance() {
  const __guard = useRouteGuard("attendance.view_team");
  const { employee, hasRole, isAdmin } = useAuth();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const sp = Route.useSearch();
  const [from, setFrom] = useState(sp.from || today());
  const [to, setTo] = useState(sp.to || today());
  const view = sp.view ?? "all";
  useEffect(() => {
    if (sp.from) setFrom(sp.from);
    if (sp.to) setTo(sp.to);
  }, [sp.from, sp.to]);

  const canViewAll = isAdmin || can("attendance.view_all");

  // canReview: approve/reject correction requests and leave requests
  const canReview = isAdmin || hasRole("manager") || can("attendance.correction_approve");
  // canRequestCorrection: submit a correction on behalf of a team member
  const canRequestCorrection =
    isAdmin || hasRole("manager") || hasRole("team_leader") || can("attendance.correction_request");

  const { data: team } = useQuery({
    enabled: !!employee?.id,
    queryKey: ["my-team", employee?.id, canViewAll],
    queryFn: async () => {
      const q = supabase.from("employees").select("id, full_name, alias_name, employee_code").order("full_name");
      if (canViewAll) return (await q).data ?? [];
      const { data } = await q.or(`manager_id.eq.${employee!.id},team_leader_id.eq.${employee!.id}`);
      return data ?? [];
    },
  });

  const teamIds = useMemo(() => (team ?? []).map((t) => t.id), [team]);

  const { data: rows } = useQuery({
    enabled: teamIds.length > 0,
    queryKey: ["team-att", teamIds, from, to],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_records")
        .select("*, employees(full_name, alias_name, employee_code)")
        .in("employee_id", teamIds)
        .gte("work_date", from)
        .lte("work_date", to)
        .order("work_date", { ascending: false })
        .order("login_at", { ascending: false, nullsFirst: false });
      return (data ?? []) as unknown as AttRow[];
    },
  });

  const { data: corrections } = useQuery({
    queryKey: ["corrections", teamIds],
    enabled: teamIds.length > 0 || canViewAll,
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_corrections")
        .select("*, employees:employees!attendance_corrections_employee_id_fkey(full_name, alias_name, employee_code)")
        .order("created_at", { ascending: false })
        .limit(100);
      return (data ?? []) as unknown as CorrRow[];
    },
  });

  const { data: leaves } = useQuery({
    queryKey: ["team-leaves", teamIds],
    enabled: teamIds.length > 0 || canViewAll,
    queryFn: async () => {
      const { data } = await supabase
        .from("leave_requests")
        .select("*, employees(full_name, alias_name, employee_code)")
        .order("created_at", { ascending: false })
        .limit(100);
      return (data ?? []) as unknown as LeaveRow[];
    },
  });

  if (!__guard.isLoading && !__guard.allowed)
    return <AccessDenied perm="attendance.view_team" label="team attendance" />;

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Team Attendance</h1>
        <p className="text-sm text-muted-foreground">
          {canViewAll ? "All employees" : "Your team"} — review attendance, corrections and leaves.
        </p>
      </div>

      <Tabs defaultValue="attendance">
        <TabsList>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="corrections">Corrections</TabsTrigger>
          <TabsTrigger value="leaves">Leaves</TabsTrigger>
        </TabsList>

        <TabsContent value="attendance" className="space-y-3">
          <Card>
            <CardContent className="p-4 flex flex-wrap gap-3 items-end">
              <div>
                <Label>Date range</Label>
                <div className="mt-1">
                  <DateRangePicker
                    value={{ from, to }}
                    onChange={(v) => {
                      setFrom(v.from);
                      setTo(v.to);
                    }}
                  />
                </div>
              </div>
              <div className="text-xs text-muted-foreground ml-auto">{rows?.length ?? 0} record(s)</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Login</TableHead>
                    <TableHead>Logout</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(rows ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{formatDate(r.work_date)}</TableCell>
                      <TableCell>
                        {r.employees?.alias_name || r.employees?.full_name}{" "}
                        <span className="text-xs text-muted-foreground font-mono">({r.employees?.employee_code})</span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.login_at ? new Date(r.login_at).toLocaleTimeString() : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.logout_at ? new Date(r.logout_at).toLocaleTimeString() : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.hours_worked ?? "—"}</TableCell>
                      <TableCell>{statusBadge(effectiveStatus(r))}</TableCell>
                      <TableCell>
                        {canRequestCorrection && (
                          <CorrectionDialog
                            record={r}
                            onChange={() => qc.invalidateQueries({ queryKey: ["corrections"] })}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {rows && rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No records in range
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="corrections">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Requested Login</TableHead>
                    <TableHead>Requested Logout</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(corrections ?? []).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{formatDate(c.work_date)}</TableCell>
                      <TableCell>{c.employees?.alias_name || c.employees?.full_name}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {c.requested_login_at ? formatDateTime(c.requested_login_at) : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {c.requested_logout_at ? formatDateTime(c.requested_logout_at) : "—"}
                      </TableCell>
                      <TableCell className="max-w-[240px] truncate" title={c.reason}>
                        {c.reason}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            c.status === "approved" ? "default" : c.status === "rejected" ? "destructive" : "secondary"
                          }
                        >
                          {c.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {canReview && c.status === "pending" && (
                          <ReviewButtons
                            kind="correction"
                            id={c.id}
                            extra={{ correction: c }}
                            onDone={() => {
                              qc.invalidateQueries({ queryKey: ["corrections"] });
                              qc.invalidateQueries({ queryKey: ["team-att"] });
                            }}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {corrections && corrections.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No correction requests
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leaves">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(leaves ?? []).map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>{l.employees?.alias_name || l.employees?.full_name}</TableCell>
                      <TableCell className="capitalize">{l.leave_type.replace("_", " ")}</TableCell>
                      <TableCell className="font-mono text-xs">{l.start_date}</TableCell>
                      <TableCell className="font-mono text-xs">{l.end_date}</TableCell>
                      <TableCell className="max-w-[240px] truncate" title={l.reason}>
                        {l.reason}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            l.status === "approved" ? "default" : l.status === "rejected" ? "destructive" : "secondary"
                          }
                        >
                          {l.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {canReview && l.status === "pending" && (
                          <ReviewButtons
                            kind="leave"
                            id={l.id}
                            onDone={() => qc.invalidateQueries({ queryKey: ["team-leaves"] })}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {leaves && leaves.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No leave requests
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CorrectionDialog({ record, onChange }: { record: AttRow; onChange: () => void }) {
  const { employee } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    requested_login_at: record.login_at ? record.login_at.slice(0, 16) : "",
    requested_logout_at: record.logout_at ? record.logout_at.slice(0, 16) : "",
    requested_status: "" as "" | "present" | "half_day" | "absent" | "leave" | "weekly_off" | "holiday",
    reason: "",
  });
  const submit = useMutation({
    mutationFn: async () => {
      if (!form.reason.trim()) throw new Error("Reason required");
      if (!employee?.id) throw new Error("No employee");
      const { error } = await supabase.from("attendance_corrections").insert({
        attendance_id: record.id,
        employee_id: record.employee_id,
        work_date: record.work_date,
        requested_login_at: form.requested_login_at ? new Date(form.requested_login_at).toISOString() : null,
        requested_logout_at: form.requested_logout_at ? new Date(form.requested_logout_at).toISOString() : null,
        requested_status: (form.requested_status || null) as
          | "present"
          | "half_day"
          | "absent"
          | "leave"
          | "weekly_off"
          | "holiday"
          | null,
        reason: form.reason.trim(),
        requested_by: employee.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Correction requested");
      setOpen(false);
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Request correction
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Correction for {record.employees?.alias_name || record.employees?.full_name} — {formatDate(record.work_date)}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Login</Label>
              <Input
                type="datetime-local"
                value={form.requested_login_at}
                onChange={(e) => setForm({ ...form, requested_login_at: e.target.value })}
              />
            </div>
            <div>
              <Label>Logout</Label>
              <Input
                type="datetime-local"
                value={form.requested_logout_at}
                onChange={(e) => setForm({ ...form, requested_logout_at: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>Override status (optional)</Label>
            <Select
              value={form.requested_status}
              onValueChange={(v) => setForm({ ...form, requested_status: v as typeof form.requested_status })}
            >
              <SelectTrigger>
                <SelectValue placeholder="(auto from hours)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="present">Present</SelectItem>
                <SelectItem value="half_day">Half day</SelectItem>
                <SelectItem value="absent">Absent</SelectItem>
                <SelectItem value="leave">Leave</SelectItem>
                <SelectItem value="weekly_off">Weekly off</SelectItem>
                <SelectItem value="holiday">Holiday</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Reason</Label>
            <Textarea
              rows={3}
              maxLength={1000}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewButtons({
  kind,
  id,
  extra,
  onDone,
}: {
  kind: "leave" | "correction";
  id: string;
  extra?: { correction?: CorrRow };
  onDone: () => void;
}) {
  const { employee } = useAuth();
  const [notes, setNotes] = useState("");
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<"approved" | "rejected">("approved");
  const submit = useMutation({
    mutationFn: async () => {
      const reviewer = employee?.id ?? null;
      const now = new Date().toISOString();
      if (kind === "leave") {
        const { error } = await supabase
          .from("leave_requests")
          .update({
            status: action,
            reviewed_by: reviewer,
            reviewed_at: now,
            review_notes: notes || null,
          })
          .eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("attendance_corrections")
          .update({
            status: action,
            reviewed_by: reviewer,
            reviewed_at: now,
            review_notes: notes || null,
          })
          .eq("id", id);
        if (error) throw error;
        // Apply correction to attendance record if approved
        if (action === "approved" && extra?.correction) {
          const c = extra.correction;
          const patch: Record<string, unknown> = { source: "correction" };
          if (c.requested_login_at) patch.login_at = c.requested_login_at;
          if (c.requested_logout_at) patch.logout_at = c.requested_logout_at;
          if (c.requested_status) patch.status = c.requested_status;
          const { error: upErr } = await supabase
            .from("attendance_records")
            .upsert(
              { employee_id: c.employee_id, work_date: c.work_date, ...patch },
              { onConflict: "employee_id,work_date" },
            );
          if (upErr) throw upErr;
        }
      }
    },
    onSuccess: () => {
      toast.success("Submitted");
      setOpen(false);
      setNotes("");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="flex gap-1">
        <Button
          size="sm"
          onClick={() => {
            setAction("approved");
            setOpen(true);
          }}
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => {
            setAction("rejected");
            setOpen(true);
          }}
        >
          Reject
        </Button>
      </div>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{action === "approved" ? "Approve" : "Reject"} request</DialogTitle>
        </DialogHeader>
        <Textarea
          placeholder="Review notes (optional)"
          rows={3}
          maxLength={500}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <DialogFooter>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
