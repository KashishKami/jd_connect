import { createFileRoute } from "@tanstack/react-router";
import { useRouteGuard, AccessDenied } from "@/components/PermissionGate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { DeleteRowButton } from "@/components/DeleteRowButton";

export const Route = createFileRoute("/_authenticated/admin/holidays")({
  head: () => ({ meta: [{ title: "Holidays — JD Connect" }] }),
  component: HolidaysAdmin,
});

function HolidaysAdmin() {
  const __guard = useRouteGuard("admin.holidays");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ holiday_date: "", name: "", centre_id: "all", is_recurring: false, notes: "" });
  const { data: centres } = useQuery({ queryKey: ["centres-list"], queryFn: async () => (await supabase.from("centres").select("id, name, code").order("name")).data ?? [] });
  const { data: holidays } = useQuery({
    queryKey: ["holidays-all"],
    queryFn: async () => (await supabase.from("holidays").select("*, centres(code, name)").order("holiday_date", { ascending: false })).data ?? [],
  });
  const create = useMutation({
    mutationFn: async () => {
      if (!form.holiday_date || !form.name.trim()) throw new Error("Date and name are required");
      const { error } = await supabase.from("holidays").insert({
        holiday_date: form.holiday_date,
        name: form.name.trim(),
        centre_id: form.centre_id === "all" ? null : form.centre_id,
        is_recurring: form.is_recurring,
        notes: form.notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Holiday added"); setOpen(false); setForm({ holiday_date: "", name: "", centre_id: "all", is_recurring: false, notes: "" }); qc.invalidateQueries({ queryKey: ["holidays-all"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!__guard.isLoading && !__guard.allowed) {
    return <AccessDenied perm="admin.holidays" label="holidays" />;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex justify-between items-center">
        <div><h1 className="text-2xl font-semibold">Holidays</h1><p className="text-sm text-muted-foreground">Define company and centre-specific holidays.</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>Add Holiday</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New holiday</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Date</Label><Input type="date" value={form.holiday_date} onChange={(e) => setForm({ ...form, holiday_date: e.target.value })} /></div>
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={100} /></div>
              <div>
                <Label>Centre</Label>
                <Select value={form.centre_id} onValueChange={(v) => setForm({ ...form, centre_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All centres</SelectItem>
                    {(centres ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.code})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2"><Switch checked={form.is_recurring} onCheckedChange={(v) => setForm({ ...form, is_recurring: v })} /><Label>Recurring annually</Label></div>
              <div><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={200} /></div>
            </div>
            <DialogFooter><Button onClick={() => create.mutate()} disabled={create.isPending}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card><CardContent className="p-0"><Table>
        <TableHeader><TableRow>
          <TableHead>Date</TableHead><TableHead>Name</TableHead><TableHead>Centre</TableHead>
          <TableHead>Recurring</TableHead><TableHead>Notes</TableHead><TableHead></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {(holidays ?? []).map((h) => (
            <TableRow key={h.id}>
              <TableCell className="font-mono text-xs">{h.holiday_date}</TableCell>
              <TableCell className="font-medium">{h.name}</TableCell>
              <TableCell>{(h.centres as { code: string } | null)?.code ?? "All"}</TableCell>
              <TableCell>{h.is_recurring ? "Yes" : "No"}</TableCell>
              <TableCell className="text-muted-foreground">{h.notes ?? "—"}</TableCell>
              <TableCell className="text-right"><DeleteRowButton entity="holiday" id={h.id} label={h.name} invalidateKeys={[["holidays-all"]]} /></TableCell>
            </TableRow>
          ))}
          {holidays && holidays.length === 0 && (
            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No holidays defined</TableCell></TableRow>
          )}
        </TableBody>
      </Table></CardContent></Card>
    </div>
  );
}