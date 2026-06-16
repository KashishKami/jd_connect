import { createFileRoute, Link } from "@tanstack/react-router";
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
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  BookOpen, Plus, Search, Star, FileText, Eye, Download as DownloadIcon,
  Upload, Calendar,
} from "lucide-react";
import { fmtBytes, validateFile } from "@/lib/knowledge";

export const Route = createFileRoute("/_authenticated/knowledge/")({
  head: () => ({ meta: [{ title: "Knowledge Base — JD Connect" }] }),
  component: KnowledgePage,
});

function KnowledgePage() {
  const __guard = useRouteGuard("documents.view");
  const { can } = usePermissions();
  const { isAdmin } = useAuth();
  const canUpload = isAdmin || can("documents.upload");
  const { employee } = useAuth();
  const qc = useQueryClient();

  // Filters
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [departmentId, setDepartmentId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("active");

  const { data: categories = [] } = useQuery({
    queryKey: ["doc-categories", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_categories")
        .select("id, name, slug, is_active, sort_order")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: docs = [] } = useQuery({
    queryKey: ["documents", q, categoryId, departmentId, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("documents")
        .select(
          "id, title, description, status, visibility, download_allowed, views_count, downloads_count, updated_at, keywords, category_id, department_id, document_categories(name), departments(name)",
        )
        .order("updated_at", { ascending: false })
        .limit(200);
      if (statusFilter !== "all") query = query.eq("status", statusFilter as "active" | "draft" | "archived");
      if (categoryId !== "all") query = query.eq("category_id", categoryId);
      if (departmentId !== "all") query = query.eq("department_id", departmentId);
      if (q.trim()) {
        const term = `%${q.trim()}%`;
        query = query.or(`title.ilike.${term},description.ilike.${term}`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: favs = [] } = useQuery({
    queryKey: ["doc-favorites", employee?.id],
    enabled: !!employee?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_favorites")
        .select("document_id, documents(id, title, updated_at, document_categories(name))")
        .eq("employee_id", employee!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const favIds = useMemo(() => new Set(favs.map((f: { document_id: string }) => f.document_id)), [favs]);

  const { data: recent = [] } = useQuery({
    queryKey: ["recent-views", employee?.id],
    enabled: !!employee?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_views")
        .select("document_id, viewed_at, documents(id, title, document_categories(name))")
        .eq("employee_id", employee!.id)
        .order("viewed_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: dash } = useQuery({
    queryKey: ["knowledge-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("knowledge_dashboard");
      if (error) throw error;
      return (data?.[0] ?? null) as null | {
        total_documents: number; active_documents: number;
        draft_documents: number; archived_documents: number; total_storage_bytes: number;
      };
    },
  });

  const toggleFav = useMutation({
    mutationFn: async (docId: string) => {
      if (!employee?.id) return;
      if (favIds.has(docId)) {
        const { error } = await supabase.from("document_favorites").delete()
          .eq("document_id", docId).eq("employee_id", employee.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("document_favorites")
          .insert({ document_id: docId, employee_id: employee.id });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doc-favorites"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!__guard.isLoading && !__guard.allowed) return <AccessDenied perm="documents.view" label="the knowledge base" />;

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <BookOpen className="h-6 w-6" /> Knowledge Base
        </h1>
        {canUpload && (
          <UploadDialog
            categories={categories}
            departments={departments}
            onDone={() => qc.invalidateQueries({ queryKey: ["documents"] })}
          />
        )}
      </div>

      {/* Dashboard tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total" value={dash?.total_documents ?? 0} />
        <StatCard label="Active" value={dash?.active_documents ?? 0} />
        <StatCard label="Drafts" value={dash?.draft_documents ?? 0} />
        <StatCard label="Archived" value={dash?.archived_documents ?? 0} />
        <StatCard label="Storage" value={fmtBytes(dash?.total_storage_bytes ?? 0)} />
      </div>

      {/* Search & filters */}
      <Card>
        <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2 relative">
            <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search title, description, keywords…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.filter((c: { is_active: boolean }) => c.is_active).map((c: { id: string; name: string }) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={departmentId} onValueChange={setDepartmentId}>
            <SelectTrigger><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map((d: { id: string; name: string }) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Tabs defaultValue="browse">
        <TabsList>
          <TabsTrigger value="browse">Browse</TabsTrigger>
          <TabsTrigger value="favorites">Favorites ({favs.length})</TabsTrigger>
          <TabsTrigger value="recent">Recent</TabsTrigger>
        </TabsList>

        <TabsContent value="browse">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Documents</CardTitle>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="draft">Drafts</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead></TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right"><Eye className="h-4 w-4 inline" /></TableHead>
                    <TableHead className="text-right"><DownloadIcon className="h-4 w-4 inline" /></TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {docs.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No documents</TableCell></TableRow>
                  )}
                  {docs.map((d: {
                    id: string; title: string; status: string; views_count: number; downloads_count: number;
                    updated_at: string;
                    document_categories: { name: string } | null;
                    departments: { name: string } | null;
                  }) => (
                    <TableRow key={d.id}>
                      <TableCell className="w-8">
                        <button
                          onClick={() => toggleFav.mutate(d.id)}
                          className="text-muted-foreground hover:text-amber-500"
                          aria-label="Toggle favorite"
                        >
                          <Star className={`h-4 w-4 ${favIds.has(d.id) ? "fill-amber-400 text-amber-400" : ""}`} />
                        </button>
                      </TableCell>
                      <TableCell>
                        <Link to="/knowledge/$id" params={{ id: d.id }} className="font-medium hover:underline flex items-center gap-1">
                          <FileText className="h-4 w-4" /> {d.title}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs">{d.document_categories?.name ?? "—"}</TableCell>
                      <TableCell className="text-xs">{d.departments?.name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={d.status === "active" ? "default" : d.status === "draft" ? "secondary" : "outline"}>
                          {d.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs">{d.views_count}</TableCell>
                      <TableCell className="text-right text-xs">{d.downloads_count}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(d.updated_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="favorites">
          <Card>
            <CardContent className="pt-4">
              {favs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No favorites yet. Star a document to bookmark it.</p>
              ) : (
                <ul className="divide-y">
                  {favs.map((f: { document_id: string; documents: { id: string; title: string; updated_at: string; document_categories: { name: string } | null } | null }) => (
                    f.documents && (
                      <li key={f.document_id} className="py-2 flex items-center justify-between">
                        <Link to="/knowledge/$id" params={{ id: f.documents.id }} className="hover:underline flex items-center gap-2">
                          <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                          {f.documents.title}
                        </Link>
                        <span className="text-xs text-muted-foreground">{f.documents.document_categories?.name ?? ""}</span>
                      </li>
                    )
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recent">
          <Card>
            <CardContent className="pt-4">
              {recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent activity.</p>
              ) : (
                <ul className="divide-y">
                  {recent.map((r: { document_id: string; viewed_at: string; documents: { id: string; title: string; document_categories: { name: string } | null } | null }, i: number) => (
                    r.documents && (
                      <li key={`${r.document_id}-${i}`} className="py-2 flex items-center justify-between">
                        <Link to="/knowledge/$id" params={{ id: r.documents.id }} className="hover:underline flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          {r.documents.title}
                        </Link>
                        <span className="text-xs text-muted-foreground">{new Date(r.viewed_at).toLocaleString()}</span>
                      </li>
                    )
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function UploadDialog({
  categories, departments, onDone,
}: {
  categories: Array<{ id: string; name: string; is_active: boolean }>;
  departments: Array<{ id: string; name: string }>;
  onDone: () => void;
}) {
  const { employee } = useAuth();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [departmentId, setDepartmentId] = useState<string>("none");
  const [version, setVersion] = useState("1.0");
  const [status, setStatus] = useState<"draft" | "active">("active");
  const [visibility, setVisibility] = useState<"all" | "department">("all");
  const [downloadAllowed, setDownloadAllowed] = useState(true);
  const [keywords, setKeywords] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!employee?.id) return toast.error("Not signed in");
    if (!title.trim()) return toast.error("Title is required");
    if (!file) return toast.error("Select a file");
    const err = validateFile(file);
    if (err) return toast.error(err);

    setBusy(true);
    let docId: string | null = null;
    try {
      // 1. Create document row (draft so we can upload)
      const { data: doc, error: dErr } = await supabase
        .from("documents")
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          category_id: categoryId || null,
          department_id: departmentId !== "none" ? departmentId : null,
          status: "draft",
          visibility: visibility === "department" ? "department" : "all",
          download_allowed: downloadAllowed,
          keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean),
          uploaded_by: employee.id,
        })
        .select("id")
        .single();
      if (dErr) throw dErr;
      docId = doc.id;

      // 2. Upload file
      const verId = crypto.randomUUID();
      const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
      const path = `${docId}/${verId}__${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("documents")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      // 3. Insert version
      const { error: vErr } = await supabase.from("document_versions").insert({
        id: verId,
        document_id: docId,
        version_label: version.trim() || "1.0",
        file_path: path,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type || null,
        uploaded_by: employee.id,
      });
      if (vErr) throw vErr;

      // 4. Visibility permission (if department-scoped)
      if (visibility === "department" && departmentId !== "none") {
        await supabase.from("document_permissions").insert({
          document_id: docId, department_id: departmentId,
        });
      }

      // 5. Update doc with current_version + final status
      const { error: uErr } = await supabase.from("documents")
        .update({ current_version_id: verId, status })
        .eq("id", docId);
      if (uErr) throw uErr;

      // 6. Audit log (via SECURITY DEFINER helper)
      await supabase.rpc("log_document_action", {
        _document_id: docId,
        _action: "upload",
        _metadata: { file_name: file.name, file_size: file.size, version_label: version },
      });

      toast.success("Document uploaded");
      // Background: index for JD AI semantic search (don't block UI)
      void (async () => {
        try {
          const { indexDocumentVersion } = await import("@/lib/jdai.functions");
          await indexDocumentVersion({ data: { documentId: docId!, versionId: verId } });
        } catch (e) {
          console.error("[jdai] indexing failed", e);
        }
      })();
      setOpen(false);
      setTitle(""); setDescription(""); setKeywords(""); setFile(null);
      onDone();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      toast.error(msg);
      // Rollback doc row if file upload failed mid-flow
      if (docId) {
        await supabase.from("documents").delete().eq("id", docId);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Upload className="h-4 w-4 mr-1" /> Upload</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Upload document</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Description</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {categories.filter((c) => c.is_active).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Department</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Version</Label>
            <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0" />
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as "draft" | "active")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Visibility</Label>
            <Select value={visibility} onValueChange={(v) => setVisibility(v as "all" | "department")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All employees</SelectItem>
                <SelectItem value="department">Specific department</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded border p-2">
            <Label className="text-sm">Allow download</Label>
            <Switch checked={downloadAllowed} onCheckedChange={setDownloadAllowed} />
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Keywords (comma separated)</Label>
            <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="onboarding, hr, policy" />
          </div>
          <div className="col-span-2 space-y-1">
            <Label>File * <span className="text-xs text-muted-foreground">(PDF, DOCX, XLSX, PPTX, PNG, JPG, ZIP — max 50 MB)</span></Label>
            <Input
              type="file"
              accept=".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.zip"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && <p className="text-xs text-muted-foreground">{file.name} ({fmtBytes(file.size)})</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Uploading…" : "Upload"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}