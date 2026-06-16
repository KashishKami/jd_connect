import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Ref = { id: string; name: string };
type EmpRef = { id: string; full_name: string; alias_name: string | null; employee_code: string; roles: { key: string } | null };

export function ProfileCompletionDialog() {
  const qc = useQueryClient();
  const { data: me, isLoading } = useQuery({
    queryKey: ["me-profile-completion"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase
        .from("employees")
        .select("id, profile_completed, approval_status, department_id, centre_id, shift_id, team_leader_id, manager_id, joining_date")
        .eq("auth_user_id", u.user.id)
        .maybeSingle();
      const { data: contact } = await supabase.rpc("get_my_contact");
      const mobile = (contact?.[0]?.mobile as string | null | undefined) ?? null;
      return data ? { ...data, mobile } : null;
    },
  });

  const needs = !!me && me.approval_status === "approved" && me.profile_completed === false;

  const { data: refs } = useQuery({
    queryKey: ["profile-completion-refs"],
    enabled: needs,
    queryFn: async () => {
      const [d, c, s, e] = await Promise.all([
        supabase.from("departments").select("id, name").eq("is_active", true).order("name"),
        supabase.from("centres").select("id, name").eq("is_active", true).order("name"),
        supabase.from("shifts").select("id, name").eq("is_active", true).order("name"),
        supabase.from("employees").select("id, full_name, alias_name, employee_code, roles(key)").order("full_name"),
      ]);
      return {
        depts: (d.data ?? []) as Ref[],
        centres: (c.data ?? []) as Ref[],
        shifts: (s.data ?? []) as Ref[],
        emps: (e.data ?? []) as EmpRef[],
      };
    },
  });

  const [mobile, setMobile] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [centreId, setCentreId] = useState<string>("");
  const [shiftId, setShiftId] = useState<string>("");
  const [tlId, setTlId] = useState<string>("");
  const [mgrId, setMgrId] = useState<string>("");
  const [joiningDate, setJoiningDate] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (me) {
      setMobile(me.mobile ?? "");
      setDepartmentId(me.department_id ?? "");
      setCentreId(me.centre_id ?? "");
      setShiftId(me.shift_id ?? "");
      setTlId(me.team_leader_id ?? "");
      setMgrId(me.manager_id ?? "");
      setJoiningDate(me.joining_date ?? "");
    }
  }, [me]);

  if (isLoading || !needs) return null;

  const tls = refs?.emps.filter((x) => x.roles?.key === "team_leader") ?? [];
  const mgrs = refs?.emps.filter((x) => x.roles?.key === "manager") ?? [];

  const submit = async () => {
    if (!mobile.trim() || mobile.trim().length < 6) return toast.error("Please enter a valid mobile number");
    if (!departmentId) return toast.error("Please select a department");
    if (!centreId) return toast.error("Please select a centre");
    if (!shiftId) return toast.error("Please select a shift");
    if (!joiningDate) return toast.error("Please pick a joining date");
    setSaving(true);
    const { error } = await supabase.rpc("complete_self_profile", {
      _mobile: mobile.trim(),
      _department_id: departmentId,
      _centre_id: centreId,
      _shift_id: shiftId,
      _team_leader_id: (tlId || null) as unknown as string,
      _manager_id: (mgrId || null) as unknown as string,
      _joining_date: joiningDate,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profile completed");
    qc.invalidateQueries({ queryKey: ["me-profile-completion"] });
  };

  return (
    <Dialog open onOpenChange={() => { /* not dismissible */ }}>
      <DialogContent className="max-w-2xl" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Complete your profile</DialogTitle>
          <DialogDescription>Please fill in the details below to start using JD Connect.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Mobile *</Label>
            <Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="e.g. +91 9876543210" maxLength={20} />
          </div>
          <Picker label="Department *" value={departmentId} onChange={setDepartmentId} options={refs?.depts ?? []} />
          <Picker label="Centre *" value={centreId} onChange={setCentreId} options={refs?.centres ?? []} />
          <Picker label="Shift *" value={shiftId} onChange={setShiftId} options={refs?.shifts ?? []} />
          <div>
            <Label>Joining date *</Label>
            <Input type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} />
          </div>
          <Picker label="Team Leader" value={tlId} onChange={setTlId} options={tls.map((x) => ({ id: x.id, name: `${x.alias_name || x.full_name} (${x.employee_code})` }))} allowNone />
          <Picker label="Manager" value={mgrId} onChange={setMgrId} options={mgrs.map((x) => ({ id: x.id, name: `${x.alias_name || x.full_name} (${x.employee_code})` }))} allowNone />
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save & continue"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Picker({ label, value, onChange, options, allowNone = false }: { label: string; value: string; onChange: (v: string) => void; options: Ref[]; allowNone?: boolean }) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)}>
        <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value="none">—</SelectItem>}
          {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}