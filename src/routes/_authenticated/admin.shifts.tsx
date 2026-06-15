import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { DeleteRowButton } from "@/components/DeleteRowButton";

export const Route = createFileRoute("/_authenticated/admin/shifts")({ component: Page });
function Page() {
  const qc = useQueryClient(); const [open, setOpen] = useState(false);
  const [name, setName] = useState(""); const [start, setStart] = useState("19:30"); const [end, setEnd] = useState("04:30"); const [grace, setGrace] = useState(15);
  const { data } = useQuery({ queryKey: ["shifts"], queryFn: async () => (await supabase.from("shifts").select("*").order("name")).data ?? [] });
  const create = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("shifts").insert({ name, start_time: start, end_time: end, grace_minutes: grace }); if (error) throw error; },
    onSuccess: () => { toast.success("Shift created"); setOpen(false); setName(""); qc.invalidateQueries({ queryKey: ["shifts"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: async ({ id, v }: { id: string; v: boolean }) => { await supabase.from("shifts").update({ is_active: v }).eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shifts"] }),
  });
  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex justify-between items-center">
        <div><h1 className="text-2xl font-semibold">Shifts</h1><p className="text-sm text-muted-foreground">Define working schedules and grace periods.</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>Add Shift</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New shift</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Day Shift" maxLength={50} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Start</Label><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></div>
                <div><Label>End</Label><Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
              </div>
              <div><Label>Grace (minutes)</Label><Input type="number" min={0} max={120} value={grace} onChange={(e) => setGrace(Number(e.target.value))} /></div>
            </div>
            <DialogFooter><Button onClick={() => create.mutate()}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card><CardContent className="p-0"><Table>
        <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Start</TableHead><TableHead>End</TableHead><TableHead>Grace</TableHead><TableHead>Active</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>{data?.map((s) => (
          <TableRow key={s.id}>
            <TableCell className="font-medium">{s.name}</TableCell>
            <TableCell>{s.start_time}</TableCell>
            <TableCell>{s.end_time}</TableCell>
            <TableCell>{s.grace_minutes} min</TableCell>
            <TableCell><Switch checked={s.is_active} onCheckedChange={(v) => toggle.mutate({ id: s.id, v })} /></TableCell>
            <TableCell className="text-right"><DeleteRowButton entity="shift" id={s.id} label={s.name} invalidateKeys={[["shifts"]]} /></TableCell>
          </TableRow>
        ))}</TableBody>
      </Table></CardContent></Card>
    </div>
  );
}