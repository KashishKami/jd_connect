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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, BookOpen, HardDrive, BarChart3 } from "lucide-react";
import { fmtBytes } from "@/lib/knowledge";

export const Route = createFileRoute("/_authenticated/admin/knowledge")({
  head: () => ({ meta: [{ title: "Knowledge Admin — JD Connect" }] }),
  component: KnowledgeAdmin,
});

function KnowledgeAdmin() {
  const { isAdmin, loading } = useAuth();
  const { can } = usePermissions();
  const canManage = isAdmin || can("admin.knowledge");
  if (loading) return null;
  if (!canManage) return <Navigate to="/dashboard" />;
  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold flex items-center gap-2">
        <BookOpen className="h-6 w-6" /> Knowledge Base Admin
      </h1>
      <Tabs defaultValue="categories">
        <TabsList>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="storage">Storage</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>
        <TabsContent value="categories"><Categories /></TabsContent>
        <TabsContent value="storage"><Storage /></TabsContent>
        <TabsContent value="reports"><Reports /></TabsContent>
      </Tabs>
    </div>
  );
}

function Categories() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data: items = [] } = useQuery({
    queryKey: ["doc-categories-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_categories")
        .select("id, name, slug, description, is_active, sort_order")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      if (!slug) throw new Error("Name required");
      const { error } = await supabase.from("document_categories").insert({
        name: name.trim(), slug, description: description.trim() || null,
        sort_order: items.length + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Category created"); setOpen(false); setName(""); setDescription("");
      qc.invalidateQueries({ queryKey: ["doc-categories-admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rename = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("document_categories").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doc-categories-admin"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("document_categories").update({ is_active: active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doc-categories-admin"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Document categories</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> New</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New category</DialogTitle></DialogHeader>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
              <Label>Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Slug</TableHead><TableHead className="text-right">Active</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.map((c: { id: string; name: string; slug: string; is_active: boolean }) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Input defaultValue={c.name} onBlur={(e) => { if (e.target.value !== c.name) rename.mutate({ id: c.id, name: e.target.value }); }} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{c.slug}</TableCell>
                <TableCell className="text-right">
                  <Switch checked={c.is_active} onCheckedChange={(v) => toggle.mutate({ id: c.id, active: v })} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function Storage() {
  const { data: dash } = useQuery({
    queryKey: ["knowledge-dashboard-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("knowledge_dashboard");
      if (error) throw error;
      return data?.[0];
    },
  });
  const { data: byDept = [] } = useQuery({
    queryKey: ["storage-by-department"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("storage_by_department");
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><HardDrive className="h-4 w-4" /> Storage overview</CardTitle></CardHeader>
        <CardContent>
          <div className="text-3xl font-semibold">{fmtBytes(dash?.total_storage_bytes ?? 0)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            Across {dash?.total_documents ?? 0} documents
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">By department</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Department</TableHead><TableHead className="text-right">Docs</TableHead><TableHead className="text-right">Storage</TableHead></TableRow></TableHeader>
            <TableBody>
              {byDept.map((d: { department_id: string; department_name: string; document_count: number; bytes: number }) => (
                <TableRow key={d.department_id}>
                  <TableCell>{d.department_name}</TableCell>
                  <TableCell className="text-right">{d.document_count}</TableCell>
                  <TableCell className="text-right">{fmtBytes(d.bytes)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Reports() {
  const { data: top = [] } = useQuery({
    queryKey: ["most-accessed"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("most_accessed_documents", { _limit: 10 });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: bottom = [] } = useQuery({
    queryKey: ["least-accessed"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("least_accessed_documents", { _limit: 10 });
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Most accessed</CardTitle></CardHeader>
        <CardContent className="p-0">
          <ReportTable rows={top} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Least accessed (active)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <ReportTable rows={bottom} />
        </CardContent>
      </Card>
    </div>
  );
}

function ReportTable({ rows }: { rows: Array<{ document_id: string; title: string; views: number; downloads: number }> }) {
  return (
    <Table>
      <TableHeader>
        <TableRow><TableHead>Title</TableHead><TableHead className="text-right">Views</TableHead><TableHead className="text-right">Downloads</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && (
          <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-4">No data</TableCell></TableRow>
        )}
        {rows.map((r) => (
          <TableRow key={r.document_id}>
            <TableCell className="text-sm">{r.title}</TableCell>
            <TableCell className="text-right text-xs">{r.views}</TableCell>
            <TableCell className="text-right text-xs">{r.downloads}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}