import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { LogIn, LogOut } from "lucide-react";
import { formatDate } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/attendance/")({
  head: () => ({ meta: [{ title: "My Attendance — JD Connect" }] }),
  component: MyAttendance,
});

const today = () => new Date().toISOString().slice(0, 10);

type AttRow = {
  id: string; work_date: string; login_at: string | null; logout_at: string | null;
  hours_worked: number | null; status: string; is_late: boolean; notes: string | null; source: string;
};

function statusBadge(s: string) {
  const map: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    present: "default", half_day: "secondary", absent: "destructive", logged_in: "default",
    late: "secondary", leave: "outline", weekly_off: "outline", holiday: "outline",
  };
  return <Badge variant={map[s] ?? "outline"} className="capitalize">{s.replace(/_/g, " ")}</Badge>;
}

function effectiveStatus(r: { status: string; login_at: string | null; logout_at: string | null }) {
  if (r.login_at && !r.logout_at) return "logged_in";
  return r.status;
}

function MyAttendance() {
  const { employee } = useAuth();
  const qc = useQueryClient();
  const employeeId = employee?.id;

  const { data: todayRow } = useQuery({
    enabled: !!employeeId,
    queryKey: ["att-today", employeeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_records")
        .select("*")
        .eq("employee_id", employeeId!)
        .eq("work_date", today())
        .maybeSingle();
      return data as AttRow | null;
    },
  });

  const { data: history } = useQuery({
    enabled: !!employeeId,
    queryKey: ["att-history", employeeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_records")
        .select("*")
        .eq("employee_id", employeeId!)
        .order("work_date", { ascending: false })
        .limit(60);
      return (data ?? []) as AttRow[];
    },
  });

  const { data: leaves } = useQuery({
    enabled: !!employeeId,
    queryKey: ["my-leaves", employeeId],
    queryFn: async () => (await supabase.from("leave_requests").select("*").eq("employee_id", employeeId!).order("created_at", { ascending: false })).data ?? [],
  });

  const { data: holidays } = useQuery({
    queryKey: ["holidays-upcoming"],
    queryFn: async () => (await supabase.from("holidays").select("*").gte("holiday_date", today()).order("holiday_date").limit(20)).data ?? [],
  });

  const checkIn = useMutation({
    mutationFn: async () => {
      if (!employeeId) throw new Error("Not linked to an employee record");
      const now = new Date().toISOString();
      const { error } = await supabase.from("attendance_records").upsert(
        { employee_id: employeeId, work_date: today(), login_at: now, source: "auto" as const },
        { onConflict: "employee_id,work_date" },
      );
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Logged in"); qc.invalidateQueries({ queryKey: ["att-today"] }); qc.invalidateQueries({ queryKey: ["att-history"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const checkOut = useMutation({
    mutationFn: async () => {
      if (!todayRow) throw new Error("No login recorded today");
      const { error } = await supabase.from("attendance_records").update({ logout_at: new Date().toISOString() }).eq("id", todayRow.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Logged out"); qc.invalidateQueries({ queryKey: ["att-today"] }); qc.invalidateQueries({ queryKey: ["att-history"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const stats = useMemo(() => {
    const out = { present: 0, half_day: 0, absent: 0, leave: 0 };
    (history ?? []).forEach((r) => {
      if (r.status === "present") out.present++;
      else if (r.status === "half_day") out.half_day++;
      else if (r.status === "absent") out.absent++;
      else if (r.status === "leave") out.leave++;
    });
    return out;
  }, [history]);

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">My Attendance</h1>
        <p className="text-sm text-muted-foreground">Log in, log out, view your history and request leaves.</p>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Today — {formatDate(today())}</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-center gap-6">
          <div className="flex flex-col">
            <span className="text-xs uppercase text-muted-foreground">Status</span>
            <span>{todayRow ? statusBadge(effectiveStatus(todayRow)) : <Badge variant="outline">not logged in</Badge>}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs uppercase text-muted-foreground">Login</span>
            <span className="font-mono text-sm">{todayRow?.login_at ? new Date(todayRow.login_at).toLocaleTimeString() : "—"}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs uppercase text-muted-foreground">Logout</span>
            <span className="font-mono text-sm">{todayRow?.logout_at ? new Date(todayRow.logout_at).toLocaleTimeString() : "—"}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs uppercase text-muted-foreground">Hours</span>
            <span className="font-mono text-sm">{todayRow?.hours_worked ?? "—"}</span>
          </div>
          <div className="ml-auto flex gap-2">
            <Button onClick={() => checkIn.mutate()} disabled={!!todayRow?.login_at || checkIn.isPending}>
              <LogIn className="h-4 w-4 mr-1" /> Log in
            </Button>
            <Button variant="outline" onClick={() => checkOut.mutate()} disabled={!todayRow?.login_at || !!todayRow?.logout_at || checkOut.isPending}>
              <LogOut className="h-4 w-4 mr-1" /> Log out
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[["Present", stats.present], ["Half day", stats.half_day], ["Absent", stats.absent], ["Leave", stats.leave]].map(([l, v]) => (
          <Card key={l as string}><CardContent className="p-4">
            <div className="text-xs uppercase text-muted-foreground">{l}</div>
            <div className="text-2xl font-semibold">{v}</div>
          </CardContent></Card>
        ))}
      </div>

      <Tabs defaultValue="history">
        <TabsList>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="leaves">My Leaves</TabsTrigger>
          <TabsTrigger value="holidays">Holidays</TabsTrigger>
        </TabsList>
        <TabsContent value="history">
          <Card><CardContent className="p-0"><Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Login</TableHead><TableHead>Logout</TableHead>
              <TableHead>Hours</TableHead><TableHead>Status</TableHead><TableHead>Source</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(history ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{formatDate(r.work_date)}</TableCell>
                  <TableCell className="font-mono text-xs">{r.login_at ? new Date(r.login_at).toLocaleTimeString() : "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.logout_at ? new Date(r.logout_at).toLocaleTimeString() : "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.hours_worked ?? "—"}</TableCell>
                  <TableCell>{statusBadge(effectiveStatus(r))}</TableCell>
                  <TableCell className="text-xs text-muted-foreground capitalize">{r.source}</TableCell>
                </TableRow>
              ))}
              {history && history.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No attendance yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table></CardContent></Card>
        </TabsContent>
        <TabsContent value="leaves">
          <LeavesPanel employeeId={employeeId} leaves={(leaves ?? []) as LeaveRow[]} onChange={() => qc.invalidateQueries({ queryKey: ["my-leaves"] })} />
        </TabsContent>
        <TabsContent value="holidays">
          <Card><CardContent className="p-0"><Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Name</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
            <TableBody>
              {(holidays ?? []).map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="font-mono text-xs">{formatDate(h.holiday_date)}</TableCell>
                  <TableCell className="font-medium">{h.name}</TableCell>
                  <TableCell className="text-muted-foreground">{h.notes ?? "—"}</TableCell>
                </TableRow>
              ))}
              {holidays && holidays.length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No upcoming holidays</TableCell></TableRow>
              )}
            </TableBody>
          </Table></CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

type LeaveRow = {
  id: string; leave_type: string; start_date: string; end_date: string; reason: string;
  status: string; review_notes: string | null;
};

function LeavesPanel({ employeeId, leaves, onChange }: { employeeId: string | undefined; leaves: LeaveRow[]; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ leave_type: "casual", start_date: today(), end_date: today(), reason: "" });
  const create = useMutation({
    mutationFn: async () => {
      if (!employeeId) throw new Error("No employee");
      if (!form.reason.trim()) throw new Error("Reason required");
      const { error } = await supabase.from("leave_requests").insert({
        employee_id: employeeId,
        leave_type: form.leave_type as "casual" | "sick" | "earned" | "unpaid" | "comp_off" | "other",
        start_date: form.start_date,
        end_date: form.end_date,
        reason: form.reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Leave requested"); setOpen(false); setForm({ leave_type: "casual", start_date: today(), end_date: today(), reason: "" }); onChange(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>Request Leave</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New leave request</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Type</Label>
                <Select value={form.leave_type} onValueChange={(v) => setForm({ ...form, leave_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["casual", "sick", "earned", "unpaid", "comp_off", "other"].map((t) => <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Start</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
                <div><Label>End</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
              </div>
              <div><Label>Reason</Label><Textarea rows={3} maxLength={1000} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={() => create.mutate()} disabled={create.isPending}>Submit</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card><CardContent className="p-0"><Table>
        <TableHeader><TableRow>
          <TableHead>Type</TableHead><TableHead>From</TableHead><TableHead>To</TableHead>
          <TableHead>Reason</TableHead><TableHead>Status</TableHead><TableHead>Notes</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {leaves.map((l) => (
            <TableRow key={l.id}>
              <TableCell className="capitalize">{l.leave_type.replace("_", " ")}</TableCell>
              <TableCell className="font-mono text-xs">{formatDate(l.start_date)}</TableCell>
              <TableCell className="font-mono text-xs">{formatDate(l.end_date)}</TableCell>
              <TableCell className="max-w-[260px] truncate" title={l.reason}>{l.reason}</TableCell>
              <TableCell><Badge variant={l.status === "approved" ? "default" : l.status === "rejected" ? "destructive" : "secondary"}>{l.status}</Badge></TableCell>
              <TableCell className="text-xs text-muted-foreground">{l.review_notes ?? "—"}</TableCell>
            </TableRow>
          ))}
          {leaves.length === 0 && (
            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No leave requests</TableCell></TableRow>
          )}
        </TableBody>
      </Table></CardContent></Card>
    </div>
  );
}