import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Tag } from "lucide-react";
import { DeleteRowButton } from "@/components/DeleteRowButton";

export const Route = createFileRoute("/_authenticated/admin/sales-sources")({
  head: () => ({ meta: [{ title: "Sales Sources — JD Connect" }] }),
  component: AdminSources,
});

function AdminSources() {
  const { isAdmin, loading } = useAuth();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const canManage = isAdmin || can("admin.sales_sources");
  const { data: items = [] } = useQuery({
    queryKey: ["sales-sources-all"],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase.from("sales_sources").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/(^_|_$)/g, "");
      if (!slug) throw new Error("Name required");
      const { error } = await supabase.from("sales_sources").insert({ name: name.trim(), slug });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Source created"); setOpen(false); setName(""); qc.invalidateQueries({ queryKey: ["sales-sources-all"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("sales_sources").update({ is_active: active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sales-sources-all"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const rename = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("sales_sources").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["sales-sources-all"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading) return null;
  if (!canManage) return <Navigate to="/dashboard" />;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Tag className="h-6 w-6" /> Sales Sources</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> New Source</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Sales Source</DialogTitle></DialogHeader>
            <div className="space-y-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card>
        <CardHeader><CardTitle>All sources</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Slug</TableHead><TableHead className="text-right">Active</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {items.map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Input defaultValue={s.name} onBlur={(e) => { if (e.target.value !== s.name) rename.mutate({ id: s.id, name: e.target.value }); }} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{s.slug}</TableCell>
                  <TableCell className="text-right">
                    <Switch checked={s.is_active} onCheckedChange={(v) => toggle.mutate({ id: s.id, active: v })} />
                  </TableCell>
                  <TableCell className="text-right"><DeleteRowButton entity="sales_source" id={s.id} label={s.name} invalidateKeys={[["sales-sources-all"]]} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}