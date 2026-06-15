import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { DeleteRowButton } from "@/components/DeleteRowButton";

export const Route = createFileRoute("/_authenticated/admin/centres")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(""); const [name, setName] = useState("");
  const { data } = useQuery({ queryKey: ["centres"], queryFn: async () => (await supabase.from("centres").select("*").order("code")).data ?? [] });
  const create = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("centres").insert({ code: code.toUpperCase(), name }); if (error) throw error; },
    onSuccess: () => { toast.success("Centre created"); setOpen(false); setCode(""); setName(""); qc.invalidateQueries({ queryKey: ["centres"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: async ({ id, v }: { id: string; v: boolean }) => { const { error } = await supabase.from("centres").update({ is_active: v }).eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["centres"] }),
  });
  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex justify-between items-center">
        <div><h1 className="text-2xl font-semibold">Centres</h1><p className="text-sm text-muted-foreground">Manage office locations.</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>Add Centre</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New centre</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="DBP" maxLength={10} /></div>
              <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Doon Business Park" maxLength={100} /></div>
            </div>
            <DialogFooter><Button onClick={() => create.mutate()}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card><CardContent className="p-0"><Table>
        <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Active</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>{data?.map((c) => (
          <TableRow key={c.id}>
            <TableCell className="font-mono">{c.code}</TableCell>
            <TableCell>{c.name}</TableCell>
            <TableCell><Switch checked={c.is_active} onCheckedChange={(v) => toggle.mutate({ id: c.id, v })} /></TableCell>
            <TableCell className="text-right"><DeleteRowButton entity="centre" id={c.id} label={c.name} invalidateKeys={[["centres"]]} /></TableCell>
          </TableRow>
        ))}</TableBody>
      </Table></CardContent></Card>
    </div>
  );
}