import { formatDate, formatDateTime } from "@/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { DeleteRowButton } from "@/components/DeleteRowButton";

export const Route = createFileRoute("/_authenticated/admin/breaks")({
  head: () => ({ meta: [{ title: "Break Management — JD Connect" }] }),
  component: AdminBreaks,
});

type BreakType = {
  id: string; key: string; name: string; description: string | null;
  default_limit_minutes: number | null; tl_alert_minutes: number | null;
  manager_alert_minutes: number | null; is_active: boolean;
};

function AdminBreaks() {
  const { isAdmin, hasRole } = useAuth();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const canManage = isAdmin || hasRole("manager") || can("breaks.policies_manage");

  const { data: types = [] } = useQuery({
    queryKey: ["admin-break-types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("break_types").select("*").order("name");
      if (error) throw error;
      return data as BreakType[];
    },
  });

  const { data: violations = [] } = useQuery({
    queryKey: ["admin-violations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("break_records")
        .select("*, employee:employees(full_name, alias_name, employee_code), break_type:break_types(name)")
        .eq("status", "exceeded")
        .order("start_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: trends = [] } = useQuery({
    queryKey: ["admin-trends"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("break_records")
        .select("break_type_id, status, duration_minutes, break_type:break_types(name)")
        .gte("start_at", new Date(Date.now() - 30 * 86400_000).toISOString());
      if (error) throw error;
      const map = new Map<string, { name: string; total: number; count: number; exceeded: number }>();
      for (const r of data ?? []) {
        const name = (r as any).break_type?.name ?? "—";
        const k = map.get(name) ?? { name, total: 0, count: 0, exceeded: 0 };
        k.count += 1;
        k.total += Number((r as any).duration_minutes ?? 0);
        if ((r as any).status === "exceeded") k.exceeded += 1;
        map.set(name, k);
      }
      return Array.from(map.values());
    },
  });

  const [editing, setEditing] = useState<Partial<BreakType> | null>(null);
  const [openEdit, setOpenEdit] = useState(false);

  const upsert = useMutation({
    mutationFn: async (t: Partial<BreakType>) => {
      if (t.id) {
        const { error } = await supabase.from("break_types").update({
          name: t.name, description: t.description ?? null,
          default_limit_minutes: t.default_limit_minutes,
          tl_alert_minutes: t.tl_alert_minutes,
          manager_alert_minutes: t.manager_alert_minutes,
          is_active: t.is_active ?? true,
        }).eq("id", t.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("break_types").insert({
          key: t.key!, name: t.name!, description: t.description ?? null,
          default_limit_minutes: t.default_limit_minutes ?? null,
          tl_alert_minutes: t.tl_alert_minutes ?? null,
          manager_alert_minutes: t.manager_alert_minutes ?? null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["admin-break-types"] });
      qc.invalidateQueries({ queryKey: ["break-types-active"] });
      setOpenEdit(false); setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async (t: BreakType) => {
      const { error } = await supabase.from("break_types").update({ is_active: !t.is_active }).eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-break-types"] }),
  });

  if (!canManage) {
    return <div className="p-6 text-muted-foreground">You don't have access to manage break policies.</div>;
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Break Management</h1>
        {isAdmin && (
          <Dialog open={openEdit} onOpenChange={(o) => { setOpenEdit(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditing({ is_active: true })}>New Break Type</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing?.id ? "Edit" : "New"} Break Type</DialogTitle></DialogHeader>
              <div className="space-y-3">
                {!editing?.id && (
                  <div className="space-y-1">
                    <Label>Key (unique, lowercase)</Label>
                    <Input value={editing?.key ?? ""} onChange={(e) => setEditing({ ...editing, key: e.target.value })} />
                  </div>
                )}
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input value={editing?.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label>Limit (min)</Label>
                    <Input type="number" value={editing?.default_limit_minutes ?? ""} onChange={(e) => setEditing({ ...editing, default_limit_minutes: e.target.value ? parseInt(e.target.value) : null })} />
                  </div>
                  <div className="space-y-1">
                    <Label>TL Alert</Label>
                    <Input type="number" value={editing?.tl_alert_minutes ?? ""} onChange={(e) => setEditing({ ...editing, tl_alert_minutes: e.target.value ? parseInt(e.target.value) : null })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Mgr Alert</Label>
                    <Input type="number" value={editing?.manager_alert_minutes ?? ""} onChange={(e) => setEditing({ ...editing, manager_alert_minutes: e.target.value ? parseInt(e.target.value) : null })} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => upsert.mutate(editing!)} disabled={!editing?.name || (!editing?.id && !editing?.key)}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Tabs defaultValue="types">
        <TabsList>
          <TabsTrigger value="types">Break Types & Policies</TabsTrigger>
          <TabsTrigger value="violations">Violations</TabsTrigger>
          <TabsTrigger value="trends">Trends (30d)</TabsTrigger>
        </TabsList>

        <TabsContent value="types">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Name</TableHead><TableHead>Key</TableHead><TableHead>Limit</TableHead>
                <TableHead>TL Alert</TableHead><TableHead>Mgr Alert</TableHead>
                <TableHead>Status</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {types.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="text-muted-foreground">{t.key}</TableCell>
                    <TableCell>{t.default_limit_minutes ?? "—"}</TableCell>
                    <TableCell>{t.tl_alert_minutes ?? "—"}</TableCell>
                    <TableCell>{t.manager_alert_minutes ?? "—"}</TableCell>
                    <TableCell>{t.is_active ? <Badge>Active</Badge> : <Badge variant="outline">Disabled</Badge>}</TableCell>
                    <TableCell className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => { setEditing(t); setOpenEdit(true); }}>Edit</Button>
                      {isAdmin && (
                        <Button size="sm" variant="ghost" onClick={() => toggleActive.mutate(t)}>
                          {t.is_active ? "Disable" : "Enable"}
                        </Button>
                      )}
                      <DeleteRowButton entity="break_type" id={t.id} label={t.name} invalidateKeys={[["admin-break-types"], ["break-types-active"]]} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="violations">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Employee</TableHead><TableHead>Type</TableHead><TableHead>Date</TableHead>
                <TableHead>Duration</TableHead><TableHead>Limit</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {violations.map((b: any) => (
                  <TableRow key={b.id}>
                    <TableCell>{(b.employee as { full_name?: string; alias_name?: string | null })?.alias_name || b.employee?.full_name} <span className="text-xs text-muted-foreground">{b.employee?.employee_code}</span></TableCell>
                    <TableCell>{b.break_type?.name}</TableCell>
                    <TableCell>{formatDateTime(b.start_at)}</TableCell>
                    <TableCell>{b.duration_minutes} min</TableCell>
                    <TableCell>{b.limit_minutes}</TableCell>
                  </TableRow>
                ))}
                {violations.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No violations</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="trends">
          <div className="grid gap-4 md:grid-cols-3">
            {trends.map((t) => (
              <Card key={t.name}>
                <CardHeader className="pb-2"><CardTitle className="text-sm">{t.name}</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold">{t.count}</div>
                  <div className="text-xs text-muted-foreground">breaks</div>
                  <div className="mt-2 text-sm">Avg: {t.count ? Math.round(t.total / t.count) : 0} min</div>
                  <div className="text-sm">Exceeded: {t.exceeded}</div>
                </CardContent>
              </Card>
            ))}
            {trends.length === 0 && <div className="text-muted-foreground">No data yet.</div>}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}