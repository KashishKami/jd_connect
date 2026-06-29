import { createFileRoute } from "@tanstack/react-router";
import { useRouteGuard, AccessDenied } from "@/components/PermissionGate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Plus, Pencil, Trash2, Shield, Search, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/_authenticated/admin/roles")({ component: Page });

type RoleRow = { id: string; name: string; description: string | null; is_system: boolean; key_text: string | null; key: string | null };
type PermRow = { id: string; key: string; module: string | null; action: string | null; label: string | null; description: string | null; is_dangerous: boolean; sort_order: number };

const MODULE_LABELS: Record<string, string> = {
  employees: "Employees", attendance: "Attendance", breaks: "Breaks", sales: "Sales",
  documents: "Documents", channels: "Channels & Chat", announcements: "Announcements",
  reports: "Reports & Analytics", admin: "Admin & Settings",
};

function Page() {
  const __guard = useRouteGuard("admin.roles");
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<RoleRow | null>(null);

  const { data } = useQuery({
    queryKey: ["roles-perms"],
    queryFn: async () => {
      const [r, p, rp] = await Promise.all([
        supabase.from("roles").select("id, name, description, is_system, key_text, key").order("is_system", { ascending: false }).order("name"),
        supabase.from("permissions").select("id, key, module, action, label, description, is_dangerous, sort_order").order("sort_order"),
        supabase.from("role_permissions").select("role_id, permission_id"),
      ]);
      return {
        roles: (r.data ?? []) as RoleRow[],
        perms: (p.data ?? []) as PermRow[],
        rp: (rp.data ?? []) as { role_id: string; permission_id: string }[],
      };
    },
  });

  const selected = data?.roles.find((r) => r.id === selectedId) ?? data?.roles[0] ?? null;
  const currentRoleId = selected?.id ?? null;

  const granted = useMemo(() => {
    if (!currentRoleId || !data) return new Set<string>();
    return new Set(data.rp.filter((x) => x.role_id === currentRoleId).map((x) => x.permission_id));
  }, [currentRoleId, data]);

  const grouped = useMemo(() => {
    const filtered = (data?.perms ?? []).filter((p) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return p.key.toLowerCase().includes(s) || (p.label ?? "").toLowerCase().includes(s) || (p.description ?? "").toLowerCase().includes(s);
    });
    const map = new Map<string, PermRow[]>();
    filtered.forEach((p) => {
      const k = p.module ?? "other";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    });
    return Array.from(map.entries());
  }, [data, search]);

  const toggle = useMutation({
    mutationFn: async ({ permission_id, on }: { permission_id: string; on: boolean }) => {
      if (!currentRoleId) return;
      if (on) { const { error } = await supabase.from("role_permissions").insert({ role_id: currentRoleId, permission_id }); if (error) throw error; }
      else { const { error } = await supabase.from("role_permissions").delete().eq("role_id", currentRoleId).eq("permission_id", permission_id); if (error) throw error; }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles-perms"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleModule = useMutation({
    mutationFn: async ({ perms, on }: { perms: PermRow[]; on: boolean }) => {
      if (!currentRoleId) return;
      if (on) {
        const missing = perms.filter((p) => !granted.has(p.id)).map((p) => ({ role_id: currentRoleId, permission_id: p.id }));
        if (missing.length) { const { error } = await supabase.from("role_permissions").insert(missing); if (error) throw error; }
      } else {
        const ids = perms.map((p) => p.id);
        const { error } = await supabase.from("role_permissions").delete().eq("role_id", currentRoleId).in("permission_id", ids);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles-perms"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const createRole = useMutation({
    mutationFn: async (v: { key_text: string; name: string; description: string }) => {
      const { data, error } = await supabase.rpc("create_custom_role", { _key_text: v.key_text, _name: v.name, _description: v.description });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (id) => { toast.success("Role created"); setCreateOpen(false); setSelectedId(id); qc.invalidateQueries({ queryKey: ["roles-perms"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const renameRole = useMutation({
    mutationFn: async (v: { id: string; name: string; description: string }) => {
      const { error } = await supabase.rpc("rename_custom_role", { _role_id: v.id, _name: v.name, _description: v.description });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Role updated"); setEditing(null); qc.invalidateQueries({ queryKey: ["roles-perms"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteRole = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("delete_custom_role", { _role_id: id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Role deleted"); setSelectedId(null); qc.invalidateQueries({ queryKey: ["roles-perms"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!__guard.isLoading && !__guard.allowed) {
    return <AccessDenied perm="admin.roles" label="roles & permissions" />;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Roles &amp; Permissions</h1>
          <p className="text-sm text-muted-foreground">Pick a role, then toggle the specific abilities it grants. Admin and Super Admin always have full access.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New Role</Button></DialogTrigger>
          <CreateRoleDialog onSubmit={(v) => createRole.mutate(v)} />
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        {/* Roles list */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Roles</CardTitle></CardHeader>
          <CardContent className="p-2 space-y-1">
            {data?.roles.map((r) => {
              const count = data.rp.filter((x) => x.role_id === r.id).length;
              const active = r.id === currentRoleId;
              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={`w-full text-left px-3 py-2 rounded-md border transition-colors ${active ? "bg-accent border-accent-foreground/20" : "border-transparent hover:bg-muted"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Shield className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="font-medium truncate">{r.name}</span>
                    </div>
                    {r.is_system && <Badge variant="secondary" className="text-[10px]">system</Badge>}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">{count} permission{count === 1 ? "" : "s"}</div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        {/* Permission editor */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <CardTitle className="text-base flex items-center gap-2">
                  {selected?.name ?? "—"}
                  {selected?.is_system && <Badge variant="secondary">system role</Badge>}
                </CardTitle>
                {selected?.description && <p className="text-xs text-muted-foreground mt-1">{selected.description}</p>}
                {(selected?.key === "admin" || selected?.key === "super_admin") && (
                  <p className="text-xs text-amber-600 mt-2 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Admin roles bypass these checks — they always have full access.</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {selected && !selected.is_system && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setEditing(selected)}><Pencil className="h-3.5 w-3.5 mr-1" />Rename</Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button size="sm" variant="outline" className="text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete role "{selected.name}"?</AlertDialogTitle>
                          <AlertDialogDescription>Users assigned this role will lose its permissions. This cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteRole.mutate(selected.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
              </div>
            </div>
            <div className="relative mt-3">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search permissions…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
            </div>
          </CardHeader>
          <CardContent>
            {!selected ? (
              <div className="text-center text-sm text-muted-foreground py-12">Select a role to view its permissions.</div>
            ) : (
              <Accordion type="multiple" defaultValue={grouped.map(([m]) => m)} className="w-full">
                {grouped.map(([module, perms]) => {
                  const allOn = perms.every((p) => granted.has(p.id));
                  const someOn = perms.some((p) => granted.has(p.id));
                  return (
                    <AccordionItem key={module} value={module}>
                      <div className="flex items-center gap-2 pr-1">
                        <AccordionTrigger className="flex-1">
                          <div className="flex items-center gap-3">
                            <span className="font-medium">{MODULE_LABELS[module] ?? module}</span>
                            <Badge variant="outline" className="text-[10px]">{perms.filter((p) => granted.has(p.id)).length}/{perms.length}</Badge>
                          </div>
                        </AccordionTrigger>
                        <Button
                          size="sm" variant="ghost"
                          onClick={(e) => { e.stopPropagation(); toggleModule.mutate({ perms, on: !allOn }); }}
                          disabled={!currentRoleId}
                        >
                          {allOn ? "Clear all" : someOn ? "Select all" : "Select all"}
                        </Button>
                      </div>
                      <AccordionContent>
                        <div className="grid gap-2 pt-1">
                          {perms.map((p) => {
                            const on = granted.has(p.id);
                            return (
                              <label key={p.id} className="flex items-start gap-3 p-2 rounded-md border hover:bg-muted/40 cursor-pointer">
                                <Checkbox
                                  checked={on}
                                  onCheckedChange={(v) => toggle.mutate({ permission_id: p.id, on: !!v })}
                                  className="mt-0.5"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-medium">{p.label ?? p.key}</span>
                                    {p.is_dangerous && <Badge variant="destructive" className="text-[10px]">sensitive</Badge>}
                                    <code className="text-[10px] font-mono text-muted-foreground">{p.key}</code>
                                  </div>
                                  {p.description && <div className="text-xs text-muted-foreground mt-0.5">{p.description}</div>}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </CardContent>
        </Card>
      </div>

      {editing && (
        <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
          <EditRoleDialog role={editing} onSubmit={(v) => renameRole.mutate({ id: editing.id, ...v })} />
        </Dialog>
      )}
    </div>
  );
}

function CreateRoleDialog({ onSubmit }: { onSubmit: (v: { key_text: string; name: string; description: string }) => void }) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [desc, setDesc] = useState("");
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Create custom role</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium">Name</label>
          <Input value={name} onChange={(e) => { setName(e.target.value); if (!key) setKey(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "_")); }} placeholder="e.g. Sales Manager" />
        </div>
        <div>
          <label className="text-sm font-medium">Key</label>
          <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="sales_manager" className="font-mono text-sm" />
          <p className="text-[11px] text-muted-foreground mt-1">Used internally. Lowercase letters, numbers and underscores.</p>
        </div>
        <div>
          <label className="text-sm font-medium">Description</label>
          <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} />
        </div>
      </div>
      <DialogFooter>
        <Button disabled={!name || !key} onClick={() => onSubmit({ key_text: key, name, description: desc })}>Create role</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function EditRoleDialog({ role, onSubmit }: { role: RoleRow; onSubmit: (v: { name: string; description: string }) => void }) {
  const [name, setName] = useState(role.name);
  const [desc, setDesc] = useState(role.description ?? "");
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Edit role</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium">Description</label>
          <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} />
        </div>
      </div>
      <DialogFooter>
        <Button disabled={!name} onClick={() => onSubmit({ name, description: desc })}>Save</Button>
      </DialogFooter>
    </DialogContent>
  );
}