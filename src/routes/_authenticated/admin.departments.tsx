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

export const Route = createFileRoute("/_authenticated/admin/departments")({ component: Page });
function Page() {
  const qc = useQueryClient(); const [open, setOpen] = useState(false); const [name, setName] = useState(""); const [desc, setDesc] = useState("");
  const { data } = useQuery({ queryKey: ["departments"], queryFn: async () => (await supabase.from("departments").select("*").order("name")).data ?? [] });
  const create = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("departments").insert({ name, description: desc || null }); if (error) throw error; },
    onSuccess: () => { toast.success("Department created"); setOpen(false); setName(""); setDesc(""); qc.invalidateQueries({ queryKey: ["departments"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: async ({ id, v }: { id: string; v: boolean }) => { await supabase.from("departments").update({ is_active: v }).eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["departments"] }),
  });
  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex justify-between items-center">
        <div><h1 className="text-2xl font-semibold">Departments</h1><p className="text-sm text-muted-foreground">Organize teams.</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>Add Department</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New department</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></div>
              <div><Label>Description</Label><Input value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={250} /></div>
            </div>
            <DialogFooter><Button onClick={() => create.mutate()}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card><CardContent className="p-0"><Table>
        <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Description</TableHead><TableHead>Active</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>{data?.map((d) => (
          <TableRow key={d.id}>
            <TableCell className="font-medium">{d.name}</TableCell>
            <TableCell className="text-muted-foreground">{d.description ?? "—"}</TableCell>
            <TableCell><Switch checked={d.is_active} onCheckedChange={(v) => toggle.mutate({ id: d.id, v })} /></TableCell>
            <TableCell className="text-right"><DeleteRowButton entity="department" id={d.id} label={d.name} invalidateKeys={[["departments"]]} /></TableCell>
          </TableRow>
        ))}</TableBody>
      </Table></CardContent></Card>
    </div>
  );
}