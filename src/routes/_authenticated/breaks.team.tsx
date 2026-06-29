import { usePermissions } from "@/hooks/usePermissions";
import { createFileRoute } from "@tanstack/react-router";
import { useRouteGuard, AccessDenied } from "@/components/PermissionGate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/breaks/team")({
  head: () => ({ meta: [{ title: "Team Breaks — JD Connect" }] }),
  component: TeamBreaks,
});

function elapsedMin(startISO: string) {
  return Math.max(0, Math.round((Date.now() - new Date(startISO).getTime()) / 60000));
}

function statusBadge(s: string) {
  const map: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    active: "default",
    completed: "secondary",
    exceeded: "destructive",
    cancelled: "outline",
  };
  return (
    <Badge variant={map[s] ?? "outline"} className="capitalize">
      {s}
    </Badge>
  );
}

function TeamBreaks() {
  const __guard = useRouteGuard("breaks.view_team");
  const { employee, isAdmin, hasRole } = useAuth();
  const { can } = usePermissions();
  const qc = useQueryClient();
  // canManagePolicies: approve/reject break requests and manage break policy config
  const canManagePolicies = isAdmin || hasRole("manager") || can("breaks.policies_manage");

  const canViewAll = isAdmin || can("breaks.view_all");

  // Discover team employee ids visible to me (via RLS-allowed query)
  const { data: teamIds = [] } = useQuery({
    enabled: !!employee?.id,
    queryKey: ["my-team-ids", employee?.id, canViewAll],
    queryFn: async () => {
      if (canViewAll) {
        const { data } = await supabase.from("employees").select("id");
        return (data ?? []).map((e: any) => e.id as string);
      }
      const orFilter = `manager_id.eq.${employee!.id},team_leader_id.eq.${employee!.id}`;
      const { data } = await supabase.from("employees").select("id").or(orFilter);
      return (data ?? []).map((e: any) => e.id as string);
    },
  });

  const { data: active = [] } = useQuery({
    enabled: teamIds.length > 0,
    queryKey: ["team-active-breaks", teamIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("break_records")
        .select("*, employee:employees(id, full_name, alias_name, employee_code), break_type:break_types(name)")
        .in("employee_id", teamIds)
        .eq("status", "active")
        .order("start_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  const { data: history = [] } = useQuery({
    enabled: teamIds.length > 0,
    queryKey: ["team-break-history", teamIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("break_records")
        .select("*, employee:employees(id, full_name, alias_name, employee_code), break_type:break_types(name)")
        .in("employee_id", teamIds)
        .order("start_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: requests = [] } = useQuery({
    enabled: teamIds.length > 0,
    queryKey: ["team-break-requests", teamIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("break_requests")
        .select("*, employee:employees(id, full_name, alias_name, employee_code), break_type:break_types(name)")
        .in("employee_id", teamIds)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const exceeded = useMemo(() => history.filter((b: any) => b.status === "exceeded"), [history]);

  const review = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: "approved" | "rejected"; notes: string }) => {
      const { error } = await supabase
        .from("break_requests")
        .update({ status, reviewer_id: employee!.id, reviewed_at: new Date().toISOString(), review_notes: notes })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Request updated");
      qc.invalidateQueries({ queryKey: ["team-break-requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [reviewing, setReviewing] = useState<any>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  if (!__guard.isLoading && !__guard.allowed) return <AccessDenied perm="breaks.view_team" label="team breaks" />;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <h1 className="text-2xl font-semibold">Team Breaks</h1>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
          <TabsTrigger value="exceeded">Exceeded ({exceeded.length})</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="requests">
            Requests ({requests.filter((r: any) => r.status === "pending").length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Elapsed</TableHead>
                    <TableHead>Limit</TableHead>
                    <TableHead>Alert</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {active.map((b: any) => {
                    const el = elapsedMin(b.start_at);
                    const over = b.limit_minutes && el > b.limit_minutes;
                    return (
                      <TableRow key={b.id}>
                        <TableCell>
                          {b.employee?.alias_name || b.employee?.full_name}{" "}
                          <span className="text-muted-foreground text-xs">{b.employee?.employee_code}</span>
                        </TableCell>
                        <TableCell>{b.break_type?.name}</TableCell>
                        <TableCell>{new Date(b.start_at).toLocaleTimeString()}</TableCell>
                        <TableCell>{el} min</TableCell>
                        <TableCell>{b.limit_minutes ?? "—"}</TableCell>
                        <TableCell>
                          {over ? (
                            <Badge variant="destructive">Over limit</Badge>
                          ) : (
                            <Badge variant="secondary">OK</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {active.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                        No active breaks
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exceeded">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Limit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exceeded.map((b: any) => (
                    <TableRow key={b.id}>
                      <TableCell>{b.employee?.alias_name || b.employee?.full_name}</TableCell>
                      <TableCell>{b.break_type?.name}</TableCell>
                      <TableCell>{formatDateTime(b.start_at)}</TableCell>
                      <TableCell>{b.duration_minutes} min</TableCell>
                      <TableCell>{b.limit_minutes}</TableCell>
                    </TableRow>
                  ))}
                  {exceeded.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                        None
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((b: any) => (
                    <TableRow key={b.id}>
                      <TableCell>{b.employee?.alias_name || b.employee?.full_name}</TableCell>
                      <TableCell>{b.break_type?.name}</TableCell>
                      <TableCell>{formatDateTime(b.start_at)}</TableCell>
                      <TableCell>{b.duration_minutes ?? "—"}</TableCell>
                      <TableCell>{statusBadge(b.status)}</TableCell>
                    </TableRow>
                  ))}
                  {history.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                        No history
                      </TableCell>
                    </TableRow>
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
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Min</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.employee?.alias_name || r.employee?.full_name}</TableCell>
                      <TableCell>{r.break_type?.name ?? "—"}</TableCell>
                      <TableCell>{r.requested_minutes}</TableCell>
                      <TableCell className="max-w-xs truncate">{r.reason}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "pending" ? "secondary" : "outline"}>{r.status}</Badge>
                      </TableCell>
                      <TableCell>
                        {r.status === "pending" && canManagePolicies && (
                          <Dialog
                            onOpenChange={(o) => {
                              if (!o) {
                                setReviewing(null);
                                setReviewNotes("");
                              }
                            }}
                          >
                            <DialogTrigger asChild>
                              <Button size="sm" variant="outline" onClick={() => setReviewing(r)}>
                                Review
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Review Request</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-2">
                                <div className="text-sm">
                                  <b>{reviewing?.employee?.alias_name || reviewing?.employee?.full_name}</b> —{" "}
                                  {reviewing?.requested_minutes} min
                                </div>
                                <div className="text-sm text-muted-foreground">{reviewing?.reason}</div>
                                <Label>Notes</Label>
                                <Textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} />
                              </div>
                              <DialogFooter>
                                <Button
                                  variant="outline"
                                  onClick={() =>
                                    review.mutate({ id: reviewing.id, status: "rejected", notes: reviewNotes })
                                  }
                                >
                                  Reject
                                </Button>
                                <Button
                                  onClick={() =>
                                    review.mutate({ id: reviewing.id, status: "approved", notes: reviewNotes })
                                  }
                                >
                                  Approve
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {requests.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                        No requests
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
