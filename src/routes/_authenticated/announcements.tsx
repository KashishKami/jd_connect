import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Megaphone, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/announcements")({
  head: () => ({ meta: [{ title: "Announcements — JD Connect" }] }),
  component: AnnouncementsPage,
});

type Announcement = {
  id: string;
  title: string;
  body: string;
  priority: "normal" | "important" | "critical";
  requires_ack: boolean;
  created_at: string;
  acks: { employee_id: string; acknowledged_at: string }[];
};

function AnnouncementsPage() {
  const { employee, hasRole, isAdmin } = useAuth();
  const qc = useQueryClient();
  const canPost = isAdmin || hasRole("manager");

  const { data: items = [] } = useQuery({
    queryKey: ["announcements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcements")
        .select("id, title, body, priority, requires_ack, created_at, acks:announcement_acknowledgements(employee_id, acknowledged_at)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Announcement[];
    },
  });

  const ack = async (id: string) => {
    if (!employee?.id) return;
    const { error } = await supabase.from("announcement_acknowledgements").insert({ announcement_id: id, employee_id: employee.id });
    if (error) toast.error(error.message);
    else { toast.success("Acknowledged"); qc.invalidateQueries({ queryKey: ["announcements"] }); }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Megaphone className="h-6 w-6" /> Announcements</h1>
        {canPost && <NewAnnouncementDialog onCreated={() => qc.invalidateQueries({ queryKey: ["announcements"] })} />}
      </div>
      {items.length === 0 && <Card><CardContent className="p-10 text-center text-muted-foreground">No announcements yet.</CardContent></Card>}
      {items.map((a) => {
        const myAck = a.acks?.some((x) => x.employee_id === employee?.id);
        const priorityColor = a.priority === "critical" ? "destructive" : a.priority === "important" ? "default" : "secondary";
        return (
          <Card key={a.id} className={a.priority === "critical" ? "border-destructive" : ""}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  {a.priority === "critical" && <AlertTriangle className="h-4 w-4 text-destructive" />}
                  {a.title}
                </CardTitle>
                <Badge variant={priorityColor}>{a.priority}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm whitespace-pre-wrap">{a.body}</p>
              {a.requires_ack && (
                <div className="flex items-center justify-between border-t pt-3">
                  {myAck ? (
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" /> You've acknowledged this</span>
                  ) : (
                    <Button size="sm" onClick={() => ack(a.id)}>I Have Read This</Button>
                  )}
                  {canPost && <span className="text-xs text-muted-foreground">{a.acks?.length ?? 0} acknowledgement(s)</span>}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function NewAnnouncementDialog({ onCreated }: { onCreated: () => void }) {
  const { employee } = useAuth();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<"normal" | "important" | "critical">("normal");
  const [requiresAck, setRequiresAck] = useState(false);

  const submit = async () => {
    if (!title.trim() || !body.trim() || !employee?.id) return;
    const { error } = await supabase.from("announcements").insert({
      title: title.trim(), body: body.trim(), priority,
      requires_ack: priority === "critical" ? true : requiresAck,
      created_by: employee.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Announcement posted");
    setOpen(false); setTitle(""); setBody(""); setPriority("normal"); setRequiresAck(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button>New Announcement</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New announcement</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} /></div>
          <div><Label>Body</Label><Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={5000} /></div>
          <div>
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as "normal" | "important" | "critical")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="important">Important</SelectItem>
                <SelectItem value="critical">Critical (requires acknowledgement)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {priority !== "critical" && (
            <div className="flex items-center gap-2">
              <Checkbox id="ack" checked={requiresAck} onCheckedChange={(v) => setRequiresAck(!!v)} />
              <Label htmlFor="ack">Require acknowledgement</Label>
            </div>
          )}
        </div>
        <DialogFooter><Button onClick={submit}>Post</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}