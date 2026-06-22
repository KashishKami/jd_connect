import { formatDate, formatDateTime } from "@/lib/utils";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Paperclip, FileText, ArrowLeft, Lock, Pencil, MessageSquare } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtUSD } from "@/lib/csv";
import { titleCase } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/employees/$id")({
  head: () => ({ meta: [{ title: "Employee Profile — JD Connect" }] }),
  component: ProfilePage,
});

const noteCategories = [
  { v: "coaching", l: "Coaching" },
  { v: "warning", l: "Warning" },
  { v: "appreciation", l: "Appreciation" },
  { v: "promotion_recommendation", l: "Promotion Recommendation" },
  { v: "performance_review", l: "Performance Review" },
  { v: "general", l: "General" },
] as const;

function ProfilePage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { isAdmin, employee: me } = useAuth();
  const isSelf = me?.id === id;
  const [editOpen, setEditOpen] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);

  const handleGoToChat = async () => {
    if (!me?.id) return;
    setChatLoading(true);
    try {
      const { data, error } = await supabase.rpc("start_direct_chat", { _other: id });
      if (error) throw error;
      if (!data) throw new Error("Could not start chat");
      void navigate({ to: "/chat/$conversationId", params: { conversationId: data as string } });
    } catch (err: any) {
      toast.error(err.message || "Failed to open chat");
    } finally {
      setChatLoading(false);
    }
  };

  const { data: emp, isLoading: empLoading } = useQuery({
    queryKey: ["employee", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select(`id, employee_code, full_name, alias_name, username, designation, employment_status, approval_status, profile_photo_url, joining_date, department_id, centre_id, role_id, shift_id, team_leader_id, manager_id, auth_user_id, profile_completed, created_at, updated_at,
                 departments(name), centres(code, name), roles(name, key), shifts(name),
                 tl:employees!team_leader_id(id, full_name, alias_name, employee_code),
                 mgr:employees!manager_id(id, full_name, alias_name, employee_code)`)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return data;
      // Fetch contact (email/mobile) via guarded RPC — only self or admins receive a row.
      const { data: contact } = await supabase.rpc("get_employee_contact", { _id: id });
      const c = (contact?.[0] ?? null) as { email: string | null; mobile: string | null } | null;
      return { ...data, email: c?.email ?? null, mobile: c?.mobile ?? null };
    },
  });

  // If RLS hides the full row, fall back to a safe directory-only public profile.
  const { data: pub, isLoading: pubLoading } = useQuery({
    queryKey: ["employee-public", id],
    enabled: !empLoading && !emp,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_employee_public_profile", { _id: id });
      if (error) throw error;
      return (data?.[0] ?? null) as null | {
        id: string; full_name: string; alias_name: string | null; employee_code: string;
        designation: string | null; profile_photo_url: string | null; employment_status: string;
        joining_date: string | null; department_name: string | null; centre_name: string | null;
        role_name: string | null; shift_name: string | null;
      };
    },
  });

  const { data: notes, error: notesError } = useQuery({
    queryKey: ["notes", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_notes")
        .select("*, employee_note_attachments(*)")
        .eq("employee_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const canSeeNotes = !notesError && !!emp;
  const limited = !emp && !!pub;

  if (empLoading || (!emp && pubLoading)) return <div className="text-muted-foreground">Loading…</div>;
  if (!emp && !pub) return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <Link to="/directory" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1">
        <ArrowLeft className="h-3 w-3" /> Back to directory
      </Link>
      <Card><CardContent className="p-10 text-center text-muted-foreground">
        <Lock className="mx-auto h-6 w-6 mb-2" />
        You don't have access to this employee's profile.
      </CardContent></Card>
    </div>
  );

  const view = ((emp ?? {
    id: pub!.id,
    full_name: pub!.full_name,
    alias_name: pub!.alias_name,
    employee_code: pub!.employee_code,
    designation: pub!.designation,
    profile_photo_url: pub!.profile_photo_url,
    employment_status: pub!.employment_status,
    joining_date: pub!.joining_date,
    email: null,
    mobile: null,
    departments: pub!.department_name ? { name: pub!.department_name } : null,
    centres: pub!.centre_name ? { name: pub!.centre_name } : null,
    roles: pub!.role_name ? { name: pub!.role_name } : null,
    shifts: pub!.shift_name ? { name: pub!.shift_name } : null,
    tl: null, mgr: null,
  }) as unknown) as {
    full_name: string; alias_name: string | null; username?: string | null; employee_code: string; employment_status: string;
    designation: string | null; email: string | null; mobile: string | null;
    joining_date: string | null;
    departments: { name: string } | null; centres: { name: string } | null;
    roles: { name: string } | null; shifts: { name: string } | null;
    tl: { full_name: string; alias_name: string | null } | { full_name: string; alias_name: string | null }[] | null;
    mgr: { full_name: string; alias_name: string | null } | { full_name: string; alias_name: string | null }[] | null;
  };

  const display = view.alias_name || view.full_name;
  const initials = display.split(" ").map((s: string) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <Link to="/directory" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1">
        <ArrowLeft className="h-3 w-3" /> Back to directory
      </Link>
      <Card>
        <CardContent className="p-6 flex flex-wrap items-start gap-6">
          <Avatar className="h-20 w-20">
            <AvatarFallback className="text-xl bg-primary text-primary-foreground">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-[240px]">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold">{display}</h1>
              {view.alias_name && view.full_name && view.alias_name.trim().toLowerCase() !== view.full_name.trim().toLowerCase() && (
                <span className="text-sm text-muted-foreground">({view.full_name})</span>
              )}
              <Badge>{view.employment_status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground font-mono">{view.employee_code}</p>
            {view.username && (
              <p className="text-sm text-primary font-medium mt-0.5">@{view.username}</p>
            )}
            <p className="text-sm mt-1">{view.designation ?? "—"}</p>
          </div>
          <div className="flex items-center gap-2">
            {!isSelf && (
              <Button variant="default" size="sm" onClick={handleGoToChat} disabled={chatLoading}>
                <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> Go to Chat
              </Button>
            )}
            {(isSelf || isAdmin) && (
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3 w-3 mr-1" /> Edit profile
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {isAdmin && emp ? (
        <AdminEditEmployeeDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          employee={emp}
          onSaved={() => qc.invalidateQueries({ queryKey: ["employee", id] })}
        />
      ) : isSelf && emp ? (
        <EditMyProfileDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          initial={emp as unknown as MyProfileInitial}
          onSaved={() => qc.invalidateQueries({ queryKey: ["employee", id] })}
        />
      ) : null}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {!limited && <TabsTrigger value="notes">Notes &amp; Coaching</TabsTrigger>}
          {!limited && <TabsTrigger value="attendance">Attendance</TabsTrigger>}
          {!limited && <TabsTrigger value="sales">Sales</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              {!limited && <Field label="Email" value={view.email ?? "—"} />}
              {!limited && <Field label="Mobile" value={view.mobile ?? "—"} />}
              <Field label="Department" value={view.departments?.name ?? "—"} />
              <Field label="Designation" value={view.designation ?? "—"} />
              <Field label="Centre" value={view.centres?.name ?? "—"} />
              <Field label="Shift" value={view.shifts?.name ?? "—"} />
              <Field label="Role" value={view.roles?.name ?? "—"} />
              <Field label="Joining Date" value={view.joining_date ?? "—"} />
              {!limited && (() => { const t = Array.isArray(view.tl) ? view.tl[0] : view.tl; return <Field label="Team Leader" value={(t?.alias_name || t?.full_name) ?? "—"} />; })()}
              {!limited && (() => { const m = Array.isArray(view.mgr) ? view.mgr[0] : view.mgr; return <Field label="Manager" value={(m?.alias_name || m?.full_name) ?? "—"} />; })()}
            </CardContent>
          </Card>
        </TabsContent>

        {!limited && <TabsContent value="notes">
          {!canSeeNotes ? (
            <Card><CardContent className="p-10 text-center text-muted-foreground">
              <Lock className="mx-auto h-6 w-6 mb-2" />
              You don't have access to this employee's notes.
            </CardContent></Card>
          ) : (
            <NotesSection employeeId={id} notes={notes ?? []} onChange={() => qc.invalidateQueries({ queryKey: ["notes", id] })} canManage={true} />
          )}
        </TabsContent>}

        {!limited && <TabsContent value="attendance">
          <EmployeeAttendance employeeId={id} />
        </TabsContent>}
        {!limited && <TabsContent value="sales">
          <EmployeeSales employeeId={id} />
        </TabsContent>}
      </Tabs>

      {/* Suppress unused warning */}
      <span className="sr-only">{isAdmin ? "" : ""}</span>
    </div>
  );
}

type MyProfileInitial = {
  mobile: string | null; profile_photo_url: string | null; alias_name: string | null;
  department_id: string | null; centre_id: string | null; shift_id: string | null;
  team_leader_id: string | null; manager_id: string | null; joining_date: string | null;
  designation: string | null;
};

function EditMyProfileDialog({
  open, onOpenChange, initial, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  initial: MyProfileInitial; onSaved: () => void;
}) {
  const [mobile, setMobile] = useState(initial.mobile ?? "");
  const [photo, setPhoto] = useState(initial.profile_photo_url ?? "");
  const [alias, setAlias] = useState(initial.alias_name ?? "");
  const [designation, setDesignation] = useState(initial.designation ?? "");
  const [departmentId, setDepartmentId] = useState<string | null>(initial.department_id);
  const [centreId, setCentreId] = useState<string | null>(initial.centre_id);
  const [shiftId, setShiftId] = useState<string | null>(initial.shift_id);
  const [tlId, setTlId] = useState<string | null>(initial.team_leader_id);
  const [mgrId, setMgrId] = useState<string | null>(initial.manager_id);
  const [joiningDate, setJoiningDate] = useState<string>(initial.joining_date ?? "");

  const { data: refs } = useQuery({
    queryKey: ["self-profile-refs"],
    enabled: open,
    queryFn: async () => {
      const [d, c, s, em] = await Promise.all([
        supabase.from("departments").select("id, name").eq("is_active", true).order("name"),
        supabase.from("centres").select("id, name").eq("is_active", true).order("name"),
        supabase.from("shifts").select("id, name").eq("is_active", true).order("name"),
        supabase.from("employees").select("id, full_name, alias_name, employee_code, roles(key)").order("full_name"),
      ]);
      return { depts: d.data ?? [], centres: c.data ?? [], shifts: s.data ?? [], emps: em.data ?? [] };
    },
  });
  const tls = (refs?.emps ?? []).filter((x) => (x.roles as { key: string } | null)?.key === "team_leader");
  const mgrs = (refs?.emps ?? []).filter((x) => (x.roles as { key: string } | null)?.key === "manager");

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("update_self_profile", {
        _mobile: mobile || undefined,
        _profile_photo_url: photo || undefined,
        _alias_name: alias || undefined,
        _designation: designation || undefined,
        _department_id: departmentId ?? undefined,
        _centre_id: centreId ?? undefined,
        _shift_id: shiftId ?? undefined,
        _team_leader_id: tlId ?? undefined,
        _manager_id: mgrId ?? undefined,
        _joining_date: joiningDate || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Profile updated"); onSaved(); onOpenChange(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Edit my profile</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">Update your personal details. Role, status, full name and email can only be changed by an admin.</p>
        <div className="grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1">
          <div className="col-span-2"><Label>Alias name <span className="text-xs text-muted-foreground">(shown across the platform)</span></Label><Input value={alias} onChange={(e) => setAlias(e.target.value)} maxLength={120} /></div>
          <div><Label>Mobile</Label><Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="e.g. 9876543210" /></div>
          <div><Label>Joining date</Label><Input type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} /></div>
          <div className="col-span-2"><Label>Job title</Label><Input value={designation} onChange={(e) => setDesignation(e.target.value)} maxLength={120} placeholder="e.g. Senior Sales Executive" /></div>
          <div className="col-span-2"><Label>Profile photo URL</Label><Input value={photo} onChange={(e) => setPhoto(e.target.value)} placeholder="https://…" /></div>
          <AdminRefSelect label="Department" value={departmentId} onChange={setDepartmentId} options={refs?.depts ?? []} />
          <AdminRefSelect label="Centre" value={centreId} onChange={setCentreId} options={refs?.centres ?? []} />
          <AdminRefSelect label="Shift" value={shiftId} onChange={setShiftId} options={refs?.shifts ?? []} />
          <div />
          <AdminRefSelect label="Team Leader" value={tlId} onChange={setTlId} options={tls.map((x) => ({ id: x.id, name: `${(x as { alias_name?: string | null }).alias_name || x.full_name} (${x.employee_code})` }))} />
          <AdminRefSelect label="Manager" value={mgrId} onChange={setMgrId} options={mgrs.map((x) => ({ id: x.id, name: `${(x as { alias_name?: string | null }).alias_name || x.full_name} (${x.employee_code})` }))} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type EmpStatus = "active" | "suspended" | "resigned" | "terminated";

function AdminEditEmployeeDialog({
  open, onOpenChange, employee, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  employee: Record<string, unknown>; onSaved: () => void;
}) {
  type Form = {
    full_name: string; alias_name: string; email: string; mobile: string;
    designation: string; joining_date: string; profile_photo_url: string;
    employment_status: EmpStatus;
    department_id: string | null; centre_id: string | null; role_id: string | null;
    shift_id: string | null; team_leader_id: string | null; manager_id: string | null;
  };
  const e = employee as Record<string, string | null | undefined>;
  const [form, setForm] = useState<Form>({
    full_name: (e.full_name as string) ?? "",
    alias_name: (e.alias_name as string) ?? "",
    email: (e.email as string) ?? "",
    mobile: (e.mobile as string) ?? "",
    designation: (e.designation as string) ?? "",
    joining_date: (e.joining_date as string) ?? "",
    profile_photo_url: (e.profile_photo_url as string) ?? "",
    employment_status: ((e.employment_status as EmpStatus) ?? "active"),
    department_id: (e.department_id as string) ?? null,
    centre_id: (e.centre_id as string) ?? null,
    role_id: (e.role_id as string) ?? null,
    shift_id: (e.shift_id as string) ?? null,
    team_leader_id: (e.team_leader_id as string) ?? null,
    manager_id: (e.manager_id as string) ?? null,
  });
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const { data: refs } = useQuery({
    queryKey: ["emp-edit-refs"],
    enabled: open,
    queryFn: async () => {
      const [d, c, r, s, em] = await Promise.all([
        supabase.from("departments").select("id, name").eq("is_active", true).order("name"),
        supabase.from("centres").select("id, name").eq("is_active", true).order("name"),
        supabase.from("roles").select("id, name").order("name"),
        supabase.from("shifts").select("id, name").eq("is_active", true).order("name"),
        supabase.from("employees").select("id, full_name, alias_name, employee_code, roles(key)").order("full_name"),
      ]);
      return { depts: d.data ?? [], centres: c.data ?? [], roles: r.data ?? [], shifts: s.data ?? [], emps: em.data ?? [] };
    },
  });
  const tls = (refs?.emps ?? []).filter((x) => (x.roles as { key: string } | null)?.key === "team_leader");
  const mgrs = (refs?.emps ?? []).filter((x) => (x.roles as { key: string } | null)?.key === "manager");

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        full_name: form.full_name.trim(),
        alias_name: form.alias_name.trim() || null,
        mobile: form.mobile.trim() || null,
        designation: form.designation.trim() || null,
        joining_date: form.joining_date || null,
        profile_photo_url: form.profile_photo_url.trim() || null,
        employment_status: form.employment_status,
        department_id: form.department_id,
        centre_id: form.centre_id,
        role_id: form.role_id,
        shift_id: form.shift_id,
        team_leader_id: form.team_leader_id,
        manager_id: form.manager_id,
      };
      const { error } = await supabase.from("employees").update(payload as never).eq("id", (e.id as string));
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Profile updated"); onSaved(); onOpenChange(false); },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Edit profile</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">As an admin you can update all personal and assignment details. Email is managed via the user's auth account.</p>
        <div className="grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1">
          <div className="col-span-2"><Label>Full name</Label><Input value={form.full_name} onChange={(ev) => set("full_name", ev.target.value)} /></div>
          <div className="col-span-2"><Label>Alias name <span className="text-xs text-muted-foreground">(shown across the platform)</span></Label><Input value={form.alias_name} onChange={(ev) => set("alias_name", ev.target.value)} /></div>
          <div><Label>Email</Label><Input value={form.email} disabled /></div>
          <div><Label>Mobile</Label><Input value={form.mobile} onChange={(ev) => set("mobile", ev.target.value)} /></div>
          <div><Label>Designation</Label><Input value={form.designation} onChange={(ev) => set("designation", ev.target.value)} /></div>
          <div><Label>Joining date</Label><Input type="date" value={form.joining_date} onChange={(ev) => set("joining_date", ev.target.value)} /></div>
          <div className="col-span-2"><Label>Profile photo URL</Label><Input value={form.profile_photo_url} onChange={(ev) => set("profile_photo_url", ev.target.value)} placeholder="https://…" /></div>
          <AdminRefSelect label="Department" value={form.department_id} onChange={(v) => set("department_id", v)} options={refs?.depts ?? []} />
          <AdminRefSelect label="Centre" value={form.centre_id} onChange={(v) => set("centre_id", v)} options={refs?.centres ?? []} />
          <AdminRefSelect label="Role" value={form.role_id} onChange={(v) => set("role_id", v)} options={refs?.roles ?? []} />
          <AdminRefSelect label="Shift" value={form.shift_id} onChange={(v) => set("shift_id", v)} options={refs?.shifts ?? []} />
          <AdminRefSelect label="Team Leader" value={form.team_leader_id} onChange={(v) => set("team_leader_id", v)} options={tls.map((x) => ({ id: x.id, name: `${(x as { alias_name?: string | null }).alias_name || x.full_name} (${x.employee_code})` }))} />
          <AdminRefSelect label="Manager" value={form.manager_id} onChange={(v) => set("manager_id", v)} options={mgrs.map((x) => ({ id: x.id, name: `${(x as { alias_name?: string | null }).alias_name || x.full_name} (${x.employee_code})` }))} />
          <div>
            <Label>Status</Label>
            <Select value={form.employment_status} onValueChange={(v) => set("employment_status", v as EmpStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="resigned">Resigned</SelectItem>
                <SelectItem value="terminated">Terminated</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdminRefSelect({ label, value, onChange, options }: { label: string; value: string | null; onChange: (v: string | null) => void; options: { id: string; name: string }[] }) {
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

type Note = {
  id: string;
  category: string;
  title: string;
  content: string;
  created_at: string;
  employee_note_attachments: { id: string; file_path: string; file_name: string }[];
};

function NotesSection({ employeeId, notes, onChange, canManage }: { employeeId: string; notes: Note[]; onChange: () => void; canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>("coaching");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const createNote = useMutation({
    mutationFn: async () => {
      if (!title.trim() || !content.trim()) throw new Error("Title and content are required");
      const { data: u } = await supabase.auth.getUser();
      const { data: noteRow, error } = await supabase
        .from("employee_notes")
        .insert({
          employee_id: employeeId,
          category: category as "coaching" | "warning" | "appreciation" | "promotion_recommendation" | "performance_review" | "general",
          title: title.trim(),
          content: content.trim(),
          created_by: u.user?.id ?? null,
        })
        .select().single();
      if (error) throw error;
      if (file) {
        const allowed = ["application/pdf", "image/png", "image/jpeg", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
        if (!allowed.includes(file.type)) throw new Error("Only PDF, DOCX, PNG, JPG allowed");
        const path = `${employeeId}/${noteRow.id}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("employee-notes").upload(path, file);
        if (upErr) throw upErr;
        await supabase.from("employee_note_attachments").insert({
          note_id: noteRow.id, file_path: path, file_name: file.name, mime_type: file.type, size_bytes: file.size, uploaded_by: u.user?.id ?? null,
        });
      }
    },
    onSuccess: () => {
      toast.success("Note added");
      setOpen(false); setTitle(""); setContent(""); setFile(null); setCategory("coaching");
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const downloadAttachment = async (path: string, name: string) => {
    const { data, error } = await supabase.storage.from("employee-notes").createSignedUrl(path, 60);
    if (error) return toast.error(error.message);
    const a = document.createElement("a");
    a.href = data.signedUrl; a.download = name; a.target = "_blank"; a.click();
  };

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button>Add Note</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New employee note</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {noteCategories.map((c) => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} /></div>
                <div><Label>Details</Label><Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={5} maxLength={5000} /></div>
                <div>
                  <Label>Attachment (PDF, DOCX, PNG, JPG)</Label>
                  <Input type="file" accept=".pdf,.docx,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => createNote.mutate()} disabled={createNote.isPending}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
      <div className="space-y-3">
        {notes.length === 0 && <Card><CardContent className="p-10 text-center text-muted-foreground">No notes yet.</CardContent></Card>}
        {notes.map((n) => (
          <Card key={n.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Badge variant="secondary">{n.category.replace(/_/g, " ")}</Badge>
                  <span>{n.title}</span>
                </CardTitle>
                <span className="text-xs text-muted-foreground">{formatDateTime(n.created_at)}</span>
              </div>
            </CardHeader>
            <CardContent className="text-sm whitespace-pre-wrap">{n.content}
              {n.employee_note_attachments?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {n.employee_note_attachments.map((a) => (
                    <button key={a.id} onClick={() => downloadAttachment(a.file_path, a.file_name)}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border hover:bg-secondary">
                      <Paperclip className="h-3 w-3" /> {a.file_name}
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <FileText className="hidden" />
    </div>
  );
}

function EmployeeAttendance({ employeeId }: { employeeId: string }) {
  const { data = [] } = useQuery({
    queryKey: ["emp-attendance", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("id, work_date, login_at, logout_at, status, hours_worked")
        .eq("employee_id", employeeId)
        .order("work_date", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Login</TableHead>
              <TableHead>Logout</TableHead>
              <TableHead className="text-right">Hours</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No attendance records.</TableCell></TableRow>}
            {data.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{formatDate(r.work_date)}</TableCell>
                <TableCell>{titleCase(r.status)}</TableCell>
                <TableCell>{r.login_at ? new Date(r.login_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</TableCell>
                <TableCell>{r.logout_at ? new Date(r.logout_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{r.hours_worked ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function EmployeeSales({ employeeId }: { employeeId: string }) {
  const { data = [] } = useQuery({
    queryKey: ["emp-sales", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_entries")
        .select("id, sale_date, sales_count, sales_amount_usd, source_id, notes, sales_sources(name)")
        .eq("employee_id", employeeId)
        .order("sale_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Count</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No sales records.</TableCell></TableRow>}
            {data.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.sale_date}</TableCell>
                <TableCell>{(r.sales_sources as { name: string } | null)?.name ?? "—"}</TableCell>
                <TableCell className="text-right">{r.sales_count}</TableCell>
                <TableCell className="text-right font-medium">{fmtUSD(Number(r.sales_amount_usd))}</TableCell>
                <TableCell className="text-muted-foreground truncate max-w-[300px]">{r.notes ?? ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}