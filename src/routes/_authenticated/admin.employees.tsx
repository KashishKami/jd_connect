import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { DeleteRowButton } from "@/components/DeleteRowButton";
import { usePermissions } from "@/hooks/usePermissions";

export const Route = createFileRoute("/_authenticated/admin/employees")({ component: Page });

type EmpStatus = "active" | "suspended" | "resigned" | "terminated";
type ApprovalStatus = "pending" | "approved" | "rejected";
type EmpRow = {
  id: string; employee_code: string; full_name: string; alias_name: string | null; email: string; mobile: string | null;
  designation: string | null; employment_status: EmpStatus;
  department_id: string | null; centre_id: string | null; role_id: string | null;
  team_leader_id: string | null; manager_id: string | null; shift_id: string | null;
  joining_date: string | null;
  approval_status?: ApprovalStatus;
};

function Page() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EmpRow | null>(null);
  const { can, canAny } = usePermissions();
  const canCreate = can("employees.create");
  const canEdit = canAny("employees.edit_profile", "employees.edit_employment", "employees.assign_role");
  const canApprove = can("employees.approve");
  const canDelete = can("employees.delete");

  const EMP_COLS = "id, employee_code, full_name, alias_name, username, designation, employment_status, approval_status, profile_photo_url, joining_date, department_id, centre_id, role_id, shift_id, team_leader_id, manager_id, auth_user_id, profile_completed, created_at, updated_at, departments(name), centres(code), roles(name)";
  const { data: emps } = useQuery({
    queryKey: ["admin-employees"],
    queryFn: async () => {
      const [{ data: rows }, { data: contacts }] = await Promise.all([
        supabase.from("employees").select(EMP_COLS).order("employee_code"),
        supabase.rpc("admin_list_employee_contacts"),
      ]);
      const map = new Map<string, { email: string | null; mobile: string | null }>();
      for (const c of (contacts ?? []) as Array<{ id: string; email: string | null; mobile: string | null }>) {
        map.set(c.id, { email: c.email, mobile: c.mobile });
      }
      return (rows ?? []).map((r) => {
        const c = map.get((r as { id: string }).id);
        return { ...r, email: c?.email ?? "", mobile: c?.mobile ?? null };
      });
    },
  });
  const { data: refs } = useQuery({
    queryKey: ["admin-emp-refs"],
    queryFn: async () => {
      const [d, c, r, s, e] = await Promise.all([
        supabase.from("departments").select("id, name").eq("is_active", true).order("name"),
        supabase.from("centres").select("id, name").eq("is_active", true).order("name"),
        supabase.from("roles").select("id, name").order("name"),
        supabase.from("shifts").select("id, name").eq("is_active", true).order("name"),
        supabase.from("employees").select("id, full_name, employee_code, role_id, roles(key)").order("full_name"),
      ]);
      return { depts: d.data ?? [], centres: c.data ?? [], roles: r.data ?? [], shifts: s.data ?? [], emps: e.data ?? [] };
    },
  });

  const save = useMutation({
    mutationFn: async (row: Partial<EmpRow>) => {
      if (editing) { const { error } = await supabase.from("employees").update(row as never).eq("id", editing.id); if (error) throw error; }
      else {
        const { error } = await supabase.from("employees").insert({ ...row, full_name: row.full_name!, email: row.email! } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Saved"); setOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["admin-employees"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("approve_employee", { _employee_id: id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Approved"); qc.invalidateQueries({ queryKey: ["admin-employees"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("reject_employee", { _employee_id: id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Rejected"); qc.invalidateQueries({ queryKey: ["admin-employees"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const pendingCount = emps?.filter((e) => (e as EmpRow).approval_status === "pending").length ?? 0;

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold">Employee Management</h1>
          <p className="text-sm text-muted-foreground">
            Create and edit employee records. IDs auto-generate (JD0001, JD0002…).
            {pendingCount > 0 && <span className="ml-2 inline-flex items-center rounded-full bg-amber-500/10 text-amber-700 px-2 py-0.5 text-xs font-medium">{pendingCount} awaiting approval</span>}
          </p>
        </div>
        {(canCreate || canEdit) && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            {canCreate && <DialogTrigger asChild><Button onClick={() => setEditing(null)}>Add Employee</Button></DialogTrigger>}
            <EmpDialog refs={refs} editing={editing} onSave={(r) => save.mutate(r)} />
          </Dialog>
        )}
      </div>
      <Card><CardContent className="p-0"><Table>
        <TableHeader><TableRow>
          <TableHead>ID</TableHead><TableHead>Name</TableHead><TableHead>Email</TableHead>
          <TableHead>Department</TableHead><TableHead>Centre</TableHead><TableHead>Role</TableHead>
          <TableHead>Status</TableHead><TableHead>Approval</TableHead><TableHead></TableHead>
        </TableRow></TableHeader>
        <TableBody>{emps?.map((e) => (
          <TableRow key={e.id}>
            <TableCell className="font-mono text-xs">{e.employee_code}</TableCell>
            <TableCell>
              <Link to="/employees/$id" params={{ id: e.id }} className="hover:underline font-medium">
                {e.alias_name || e.full_name}
              </Link>
              {e.alias_name && <div className="text-[10px] text-muted-foreground">{e.full_name}</div>}
            </TableCell>
            <TableCell className="text-xs">{e.email}</TableCell>
            <TableCell>{(e.departments as { name: string } | null)?.name ?? "—"}</TableCell>
            <TableCell>{(e.centres as { code: string } | null)?.code ?? "—"}</TableCell>
            <TableCell>{(e.roles as { name: string } | null)?.name ?? "—"}</TableCell>
            <TableCell className="capitalize">{e.employment_status}</TableCell>
            <TableCell>
              {(() => {
                const a = (e as EmpRow).approval_status ?? "approved";
                const cls = a === "approved" ? "bg-emerald-500/10 text-emerald-700"
                  : a === "pending" ? "bg-amber-500/10 text-amber-700"
                  : "bg-destructive/10 text-destructive";
                return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>{a}</span>;
              })()}
            </TableCell>
            <TableCell className="flex gap-1">
              {canApprove && (e as EmpRow).approval_status !== "approved" && (
                <Button size="sm" variant="default" onClick={() => approve.mutate(e.id)} disabled={approve.isPending}>Approve</Button>
              )}
              {canApprove && (e as EmpRow).approval_status === "pending" && (
                <Button size="sm" variant="outline" onClick={() => reject.mutate(e.id)} disabled={reject.isPending}>Reject</Button>
              )}
              {canEdit && <Button size="sm" variant="outline" onClick={() => { setEditing(e as EmpRow); setOpen(true); }}>Edit</Button>}
              {canDelete && <DeleteRowButton entity="employee" id={e.id} label={e.full_name} invalidateKeys={[["admin-employees"]]} alreadyTerminated={e.employment_status === "terminated"} />}
            </TableCell>
          </TableRow>
        ))}</TableBody>
      </Table></CardContent></Card>
    </div>
  );
}

function EmpDialog({ refs, editing, onSave }: {
 refs: { depts: { id: string; name: string }[]; centres: { id: string; name: string }[]; roles: { id: string; name: string }[]; shifts: { id: string; name: string }[]; emps: { id: string; full_name: string; employee_code: string; role_id: string | null; roles: { key: string | null } | null }[] } | undefined;
  editing: EmpRow | null;
  onSave: (row: Partial<EmpRow>) => void;
}) {
  const [form, setForm] = useState<Partial<EmpRow>>(editing ?? { employment_status: "active" });
  const set = <K extends keyof EmpRow>(k: K, v: EmpRow[K] | null) => setForm((f) => ({ ...f, [k]: v }));
  const tls = refs?.emps.filter((x) => (x.roles?.key === "team_leader")) ?? [];
  const mgrs = refs?.emps.filter((x) => (x.roles?.key === "manager")) ?? [];
  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>{editing ? "Edit employee" : "New employee"}</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Employee ID *</Label><Input value={form.employee_code ?? ""} onChange={(e) => set("employee_code", e.target.value)} placeholder="e.g. JD-0042" /></div>
        <div><Label>Full name *</Label><Input value={form.full_name ?? ""} onChange={(e) => set("full_name", e.target.value)} /></div>
        <div className="col-span-2"><Label>Alias name <span className="text-xs text-muted-foreground">(shown across the platform)</span></Label><Input value={form.alias_name ?? ""} onChange={(e) => set("alias_name", e.target.value)} placeholder="e.g. Alex Thomas" /></div>
        <div><Label>Email *</Label><Input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} disabled={!!editing} /></div>
        <div><Label>Mobile</Label><Input value={form.mobile ?? ""} onChange={(e) => set("mobile", e.target.value)} /></div>
        <div><Label>Designation</Label><Input value={form.designation ?? ""} onChange={(e) => set("designation", e.target.value)} /></div>
        <div><Label>Joining date</Label><Input type="date" value={form.joining_date ?? ""} onChange={(e) => set("joining_date", e.target.value)} /></div>
        <RefSelect label="Department" value={form.department_id} onChange={(v) => set("department_id", v)} options={refs?.depts ?? []} />
        <RefSelect label="Centre" value={form.centre_id} onChange={(v) => set("centre_id", v)} options={refs?.centres ?? []} />
        <RefSelect label="Role" value={form.role_id} onChange={(v) => set("role_id", v)} options={refs?.roles ?? []} />
        <RefSelect label="Shift" value={form.shift_id} onChange={(v) => set("shift_id", v)} options={refs?.shifts ?? []} />
        <RefSelect label="Team Leader" value={form.team_leader_id} onChange={(v) => set("team_leader_id", v)} options={tls.map((x) => ({ id: x.id, name: `${x.full_name} (${x.employee_code})` }))} />
        <RefSelect label="Manager" value={form.manager_id} onChange={(v) => set("manager_id", v)} options={mgrs.map((x) => ({ id: x.id, name: `${x.full_name} (${x.employee_code})` }))} />
        <div>
          <Label>Status</Label>
          <Select value={form.employment_status ?? "active"} onValueChange={(v) => set("employment_status", v as EmpStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem><SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="resigned">Resigned</SelectItem><SelectItem value="terminated">Terminated</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {!editing && <p className="text-xs text-muted-foreground">After creation, the user signs up with this email — their account will link automatically.</p>}
      <DialogFooter><Button onClick={() => onSave(form)}>Save</Button></DialogFooter>
    </DialogContent>
  );
}

function RefSelect({ label, value, onChange, options }: { label: string; value: string | null | undefined; onChange: (v: string | null) => void; options: { id: string; name: string }[] }) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value ?? "none"} onValueChange={(v) => onChange(v === "none" ? null : v)}>
        <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">—</SelectItem>
          {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}