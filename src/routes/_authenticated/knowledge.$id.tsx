import { formatDate, formatDateTime } from "@/lib/utils";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft, Download as DownloadIcon, Star, History, Archive, ArchiveRestore,
  Upload, Eye, FileText,
} from "lucide-react";
import { fmtBytes, previewable, signedDocUrl, validateFile } from "@/lib/knowledge";

export const Route = createFileRoute("/_authenticated/knowledge/$id")({
  head: () => ({ meta: [{ title: "Document — JD Connect" }] }),
  component: DocDetail,
});

function DocDetail() {
  const { id } = useParams({ from: "/_authenticated/knowledge/$id" });
  const { employee, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const { data: doc, isLoading } = useQuery({
    queryKey: ["document", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select(
          "id, title, description, status, visibility, download_allowed, views_count, downloads_count, keywords, category_id, department_id, current_version_id, uploaded_by, created_at, updated_at, document_categories(name), departments(name), employees(full_name, alias_name, employee_code)",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: versions = [] } = useQuery({
    queryKey: ["doc-versions", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_versions")
        .select("id, version_label, file_path, file_name, file_size, mime_type, change_notes, created_at, employees(full_name, alias_name)")
        .eq("document_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: fav } = useQuery({
    queryKey: ["doc-fav", id, employee?.id],
    enabled: !!employee?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_favorites")
        .select("id")
        .eq("document_id", id)
        .eq("employee_id", employee!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const currentVer = versions.find((v: { id: string }) => v.id === doc?.current_version_id) ?? versions[0];
  const canManage = isAdmin || (employee?.id && doc?.uploaded_by === employee.id);

  // Record view + load preview when document loads
  useEffect(() => {
    if (!doc?.id || !employee?.id) return;
    void (async () => {
      await supabase.from("document_views").insert({ document_id: doc.id, employee_id: employee.id });
      await supabase.rpc("knowledge_dashboard"); // no-op cache touch
      await supabase.from("documents").update({ views_count: (doc.views_count ?? 0) + 1 }).eq("id", doc.id);
      await supabase.rpc("log_document_action", {
        _document_id: doc.id, _action: "view", _metadata: null,
      });
    })();
  }, [doc?.id, employee?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!currentVer) { setPreviewUrl(null); return; }
    const kind = previewable(currentVer.mime_type, currentVer.file_name);
    if (!kind) { setPreviewUrl(null); return; }
    let alive = true;
    void signedDocUrl(currentVer.file_path).then((u) => { if (alive) setPreviewUrl(u); }).catch(() => {});
    return () => { alive = false; };
  }, [currentVer?.file_path, currentVer?.mime_type, currentVer?.file_name]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleFav = useMutation({
    mutationFn: async () => {
      if (!employee?.id) return;
      if (fav) {
        await supabase.from("document_favorites").delete().eq("id", fav.id);
      } else {
        await supabase.from("document_favorites").insert({ document_id: id, employee_id: employee.id });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doc-fav", id] }),
  });

  const download = async (versionId: string, path: string) => {
    if (!doc?.download_allowed && !canManage) return toast.error("Downloads disabled for this document");
    try {
      const url = await signedDocUrl(path, true);
      window.open(url, "_blank");
      if (employee?.id) {
        await supabase.from("document_downloads").insert({
          document_id: id, version_id: versionId, employee_id: employee.id,
        });
        await supabase.from("documents").update({
          downloads_count: (doc?.downloads_count ?? 0) + 1,
        }).eq("id", id);
        await supabase.rpc("log_document_action", {
          _document_id: id, _action: "download", _metadata: { version_id: versionId },
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    }
  };

  const archive = useMutation({
    mutationFn: async () => {
      const next = doc?.status === "archived" ? "active" : "archived";
      const { error } = await supabase.from("documents").update({ status: next }).eq("id", id);
      if (error) throw error;
      await supabase.rpc("log_document_action", {
        _document_id: id,
        _action: next === "archived" ? "archive" : "restore",
        _metadata: null,
      });
    },
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["document", id] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!doc) return <div className="p-6">Not found.</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/knowledge"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
          </Button>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <FileText className="h-6 w-6" /> {doc.title}
          </h1>
          <Badge variant={doc.status === "active" ? "default" : doc.status === "draft" ? "secondary" : "outline"}>
            {doc.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => toggleFav.mutate()}>
            <Star className={`h-4 w-4 mr-1 ${fav ? "fill-amber-400 text-amber-400" : ""}`} />
            {fav ? "Favorited" : "Favorite"}
          </Button>
          {canManage && (
            <NewVersionDialog documentId={id} onDone={() => qc.invalidateQueries({ queryKey: ["doc-versions", id] })} />
          )}
          {canManage && (
            <Button size="sm" variant="outline" onClick={() => archive.mutate()}>
              {doc.status === "archived"
                ? (<><ArchiveRestore className="h-4 w-4 mr-1" /> Restore</>)
                : (<><Archive className="h-4 w-4 mr-1" /> Archive</>)}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-base">Preview</CardTitle></CardHeader>
          <CardContent>
            {currentVer ? (
              <>
                {previewUrl && previewable(currentVer.mime_type, currentVer.file_name) === "pdf" && (
                  <iframe src={previewUrl} className="w-full h-[600px] border rounded" title="PDF preview" />
                )}
                {previewUrl && previewable(currentVer.mime_type, currentVer.file_name) === "image" && (
                  <img src={previewUrl} alt={currentVer.file_name} className="max-w-full rounded border" />
                )}
                {!previewable(currentVer.mime_type, currentVer.file_name) && (
                  <p className="text-sm text-muted-foreground">No inline preview available. Use download.</p>
                )}
                {(doc.download_allowed || canManage) && (
                  <div className="mt-3">
                    <Button size="sm" onClick={() => download(currentVer.id, currentVer.file_path)}>
                      <DownloadIcon className="h-4 w-4 mr-1" /> Download current version
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No file uploaded yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row k="Description" v={doc.description || "—"} />
            <Row k="Category" v={doc.document_categories?.name ?? "—"} />
            <Row k="Department" v={doc.departments?.name ?? "—"} />
            <Row k="Visibility" v={doc.visibility} />
            <Row k="Downloads allowed" v={doc.download_allowed ? "Yes" : "No"} />
            <Row k="Uploaded by" v={(doc.employees as { full_name?: string; alias_name?: string | null } | null)?.alias_name || doc.employees?.full_name || "—"} />
            <Row k="Uploaded" v={formatDateTime(doc.created_at)} />
            <Row k="Updated" v={formatDateTime(doc.updated_at)} />
            <Row k="Views" v={String(doc.views_count ?? 0)} icon={<Eye className="h-3 w-3" />} />
            <Row k="Downloads" v={String(doc.downloads_count ?? 0)} icon={<DownloadIcon className="h-3 w-3" />} />
            {doc.keywords?.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Keywords</div>
                <div className="flex flex-wrap gap-1">
                  {doc.keywords.map((k: string) => <Badge key={k} variant="outline">{k}</Badge>)}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" /> Version history ({versions.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>By</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {versions.map((v: {
                id: string; version_label: string; file_path: string; file_name: string;
                file_size: number; change_notes: string | null; created_at: string;
                employees: { full_name: string; alias_name?: string | null } | null;
              }) => (
                <TableRow key={v.id}>
                  <TableCell className="font-mono text-xs">
                    {v.version_label}
                    {v.id === doc.current_version_id && <Badge className="ml-2" variant="secondary">current</Badge>}
                  </TableCell>
                  <TableCell className="text-xs">{v.file_name}</TableCell>
                  <TableCell className="text-xs">{fmtBytes(v.file_size)}</TableCell>
                  <TableCell className="text-xs">{v.employees?.alias_name || v.employees?.full_name || "—"}</TableCell>
                  <TableCell className="text-xs">{formatDateTime(v.created_at)}</TableCell>
                  <TableCell className="text-xs">{v.change_notes ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    {(doc.download_allowed || canManage) && (
                      <Button size="sm" variant="ghost" onClick={() => download(v.id, v.file_path)}>
                        <DownloadIcon className="h-3 w-3" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {versions.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No versions</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ k, v, icon }: { k: string; v: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-muted-foreground flex items-center gap-1">{icon}{k}</span>
      <span className="text-right break-words max-w-[60%]">{v}</span>
    </div>
  );
}

function NewVersionDialog({ documentId, onDone }: { documentId: string; onDone: () => void }) {
  const { employee } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [setCurrent, setSetCurrent] = useState(true);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!employee?.id) return;
    if (!file) return toast.error("Select a file");
    if (!version.trim()) return toast.error("Version label required (e.g. 1.1)");
    const err = validateFile(file);
    if (err) return toast.error(err);
    setBusy(true);
    try {
      const verId = crypto.randomUUID();
      const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
      const path = `${documentId}/${verId}__${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("documents")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { error: vErr } = await supabase.from("document_versions").insert({
        id: verId, document_id: documentId, version_label: version.trim(),
        file_path: path, file_name: file.name, file_size: file.size,
        mime_type: file.type || null, change_notes: notes.trim() || null, uploaded_by: employee.id,
      });
      if (vErr) throw vErr;
      if (setCurrent) {
        await supabase.from("documents").update({ current_version_id: verId }).eq("id", documentId);
      }
      await supabase.rpc("log_document_action", {
        _document_id: documentId,
        _action: "version",
        _metadata: { version_label: version, file_name: file.name },
      });
      toast.success("New version uploaded");
      setOpen(false); setVersion(""); setNotes(""); setFile(null);
      onDone();
      qc.invalidateQueries({ queryKey: ["document", documentId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Upload className="h-4 w-4 mr-1" /> New version</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Upload new version</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Version label *</Label>
            <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="e.g. 1.1 or 2.0" />
          </div>
          <div className="space-y-1">
            <Label>Change notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>File *</Label>
            <Input
              type="file"
              accept=".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.zip"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && <p className="text-xs text-muted-foreground">{file.name} ({fmtBytes(file.size)})</p>}
          </div>
          <div className="flex items-center justify-between text-sm">
            <Label>Make current version</Label>
            <Select value={setCurrent ? "y" : "n"} onValueChange={(v) => setSetCurrent(v === "y")}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="y">Yes</SelectItem>
                <SelectItem value="n">No</SelectItem>
              </SelectContent>
            </Select>
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