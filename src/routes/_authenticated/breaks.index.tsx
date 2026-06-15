import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Coffee, Square, Activity } from "lucide-react";

export const Route = createFileRoute("/_authenticated/breaks/")({
  head: () => ({ meta: [{ title: "My Breaks — JD Connect" }] }),
  component: MyBreaks,
});

type BreakType = {
  id: string; key: string; name: string; is_active: boolean;
  default_limit_minutes: number | null;
};
type BreakRow = {
  id: string; employee_id: string; break_type_id: string;
  start_at: string; end_at: string | null; duration_minutes: number | null;
  status: "active" | "completed" | "exceeded" | "cancelled"; limit_minutes: number | null;
  break_type?: { name: string } | null;
};

function statusBadge(s: string) {
  const map: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    active: "default", completed: "secondary", exceeded: "destructive", cancelled: "outline",
  };
  return <Badge variant={map[s] ?? "outline"} className="capitalize">{s}</Badge>;
}

function elapsedMin(startISO: string) {
  return Math.max(0, Math.round((Date.now() - new Date(startISO).getTime()) / 60000));
}

function MyBreaks() {
  const { employee } = useAuth();
  const qc = useQueryClient();
  const empId = employee?.id;
  const [, force] = useState(0);
  useEffect(() => { const t = setInterval(() => force((n) => n + 1), 30_000); return () => clearInterval(t); }, []);

  const { data: types = [] } = useQuery({
    queryKey: ["break-types-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("break_types").select("*").eq("is_active", true).order("name");
      if (error) throw error;
      return data as BreakType[];
    },
  });

  const { data: active } = useQuery({
    enabled: !!empId,
    queryKey: ["my-active-break", empId],
    queryFn: async () => {
      const { data } = await supabase
        .from("break_records")
        .select("*, break_type:break_types(name)")
        .eq("employee_id", empId!)
        .eq("status", "active")
        .order("start_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as BreakRow | null;
    },
    refetchInterval: 30_000,
  });

  const { data: history = [] } = useQuery({
    enabled: !!empId,
    queryKey: ["my-break-history", empId],
    queryFn: async () => {
      const { data } = await supabase
        .from("break_records")
        .select("*, break_type:break_types(name)")
        .eq("employee_id", empId!)
        .order("start_at", { ascending: false })
        .limit(50);
      return (data ?? []) as BreakRow[];
    },
  });

  const { data: monitor } = useQuery({
    queryKey: ["workforce-monitor"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("workforce_monitor");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row as { logged_in: number; on_break: number; available: number };
    },
    refetchInterval: 30_000,
  });

  const [typeId, setTypeId] = useState<string>("");
  const [openStart, setOpenStart] = useState(false);
  const [openReq, setOpenReq] = useState(false);

  const start = useMutation({
    mutationFn: async (breakTypeId: string) => {
      if (!empId) throw new Error("No employee");
      // resolve effective limit
      const { data: lim } = await supabase.rpc("effective_break_limit", {
        _break_type_id: breakTypeId,
        _centre_id: employee?.centre_id ?? "00000000-0000-0000-0000-000000000000",
        _department_id: employee?.department_id ?? "00000000-0000-0000-0000-000000000000",
      });
      const row = Array.isArray(lim) ? lim[0] : lim;
      const { error } = await supabase.from("break_records").insert({
        employee_id: empId,
        break_type_id: breakTypeId,
        department_id: employee?.department_id ?? null,
        centre_id: employee?.centre_id ?? null,
        limit_minutes: row?.limit_minutes ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Break started");
      setOpenStart(false); setTypeId("");
      qc.invalidateQueries({ queryKey: ["my-active-break"] });
      qc.invalidateQueries({ queryKey: ["my-break-history"] });
      qc.invalidateQueries({ queryKey: ["workforce-monitor"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const end = useMutation({
    mutationFn: async () => {
      if (!active) return;
      const { error } = await supabase
        .from("break_records")
        .update({ end_at: new Date().toISOString() })
        .eq("id", active.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Break ended");
      qc.invalidateQueries({ queryKey: ["my-active-break"] });
      qc.invalidateQueries({ queryKey: ["my-break-history"] });
      qc.invalidateQueries({ queryKey: ["workforce-monitor"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalTodayMin = history
    .filter((b) => new Date(b.start_at).toDateString() === new Date().toDateString())
    .reduce((sum, b) => sum + Number(b.duration_minutes ?? (b.status === "active" ? elapsedMin(b.start_at) : 0)), 0);

  // Break request
  const [reqType, setReqType] = useState<string>("");
  const [reqMin, setReqMin] = useState<number>(30);
  const [reqReason, setReqReason] = useState("");
  const submitReq = useMutation({
    mutationFn: async () => {
      if (!empId) throw new Error("No employee");
      const { error } = await supabase.from("break_requests").insert({
        employee_id: empId,
        break_type_id: reqType || null,
        requested_minutes: reqMin,
        reason: reqReason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Request submitted");
      setOpenReq(false); setReqReason(""); setReqType(""); setReqMin(30);
      qc.invalidateQueries({ queryKey: ["my-requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: myReqs = [] } = useQuery({
    enabled: !!empId,
    queryKey: ["my-requests", empId],
    queryFn: async () => {
      const { data } = await supabase
        .from("break_requests")
        .select("*, break_type:break_types(name)")
        .eq("employee_id", empId!)
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My Breaks</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{active ? "ON BREAK" : "AVAILABLE"}</div>
            {active && (
              <div className="text-xs text-muted-foreground mt-1">
                {active.break_type?.name} · {elapsedMin(active.start_at)} min
                {active.limit_minutes ? ` / ${active.limit_minutes} min` : ""}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Today's Total</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{Math.round(totalTodayMin)} min</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1"><Activity className="h-4 w-4" />Logged In</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{monitor?.logged_in ?? 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">On Break / Available</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{monitor?.on_break ?? 0} / {monitor?.available ?? 0}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Break Controls</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {active ? (
            <Button onClick={() => end.mutate()} disabled={end.isPending} variant="destructive">
              <Square className="h-4 w-4" /> End Break
            </Button>
          ) : (
            <Dialog open={openStart} onOpenChange={setOpenStart}>
              <DialogTrigger asChild>
                <Button><Coffee className="h-4 w-4" /> Start Break</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Start a Break</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <Label>Break Type</Label>
                  <Select value={typeId} onValueChange={setTypeId}>
                    <SelectTrigger><SelectValue placeholder="Select break type" /></SelectTrigger>
                    <SelectContent>
                      {types.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}{t.default_limit_minutes ? ` (${t.default_limit_minutes} min)` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button disabled={!typeId || start.isPending} onClick={() => start.mutate(typeId)}>Start</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          <Dialog open={openReq} onOpenChange={setOpenReq}>
            <DialogTrigger asChild><Button variant="outline">Request Extended Break</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Request Extended Break</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Break Type (optional)</Label>
                  <Select value={reqType} onValueChange={setReqType}>
                    <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                    <SelectContent>
                      {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Requested Minutes</Label>
                  <Input type="number" min={1} value={reqMin} onChange={(e) => setReqMin(parseInt(e.target.value) || 0)} />
                </div>
                <div className="space-y-2">
                  <Label>Reason</Label>
                  <Textarea value={reqReason} onChange={(e) => setReqReason(e.target.value)} placeholder="Medical issue, emergency, etc." />
                </div>
              </div>
              <DialogFooter>
                <Button disabled={!reqReason || reqMin < 1 || submitReq.isPending} onClick={() => submitReq.mutate()}>Submit</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <Tabs defaultValue="history">
        <TabsList>
          <TabsTrigger value="history">Break History</TabsTrigger>
          <TabsTrigger value="requests">My Requests</TabsTrigger>
        </TabsList>
        <TabsContent value="history">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead><TableHead>Start</TableHead><TableHead>End</TableHead>
                    <TableHead>Duration</TableHead><TableHead>Limit</TableHead><TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>{b.break_type?.name ?? "—"}</TableCell>
                      <TableCell>{new Date(b.start_at).toLocaleString()}</TableCell>
                      <TableCell>{b.end_at ? new Date(b.end_at).toLocaleString() : "—"}</TableCell>
                      <TableCell>{b.duration_minutes ? `${b.duration_minutes} min` : (b.status === "active" ? `${elapsedMin(b.start_at)} min` : "—")}</TableCell>
                      <TableCell>{b.limit_minutes ?? "—"}</TableCell>
                      <TableCell>{statusBadge(b.status)}</TableCell>
                    </TableRow>
                  ))}
                  {history.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No breaks yet</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="requests">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Type</TableHead><TableHead>Minutes</TableHead><TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead><TableHead>Submitted</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {myReqs.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.break_type?.name ?? "—"}</TableCell>
                      <TableCell>{r.requested_minutes}</TableCell>
                      <TableCell className="max-w-xs truncate">{r.reason}</TableCell>
                      <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                      <TableCell>{new Date(r.created_at).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                  {myReqs.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No requests</TableCell></TableRow>
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