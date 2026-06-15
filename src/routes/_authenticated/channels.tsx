import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Hash, Plus, Send, Archive, Pin, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/channels")({
  head: () => ({ meta: [{ title: "Channels — JD Connect" }] }),
  component: ChannelsPage,
});

type Channel = {
  id: string;
  name: string;
  description: string | null;
  channel_type: "department" | "team" | "custom" | "announcement";
  is_archived: boolean;
  last_message_at: string | null;
};

type Msg = { id: string; body: string; sender_id: string; created_at: string; is_pinned: boolean };

export function ChannelsPage({ initialChannelId }: { initialChannelId?: string } = {}) {
  const { employee, hasRole, isAdmin } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState<string | null>(initialChannelId ?? null);
  const canCreate = isAdmin || hasRole("manager");
  const canManage = isAdmin || hasRole("manager");

  useEffect(() => {
    if (initialChannelId) setActiveId(initialChannelId);
  }, [initialChannelId]);

  const { data: channels = [] } = useQuery({
    queryKey: ["channels", employee?.id],
    enabled: !!employee?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channels")
        .select("id, name, description, channel_type, is_archived, last_message_at")
        .order("is_archived", { ascending: true })
        .order("name");
      if (error) throw error;
      return (data ?? []) as Channel[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["channels"] });

  const openChannel = (id: string) => {
    setActiveId(id);
    void navigate({ to: "/channels/$channelId", params: { channelId: id } });
  };

  const archive = async (c: Channel) => {
    const { error } = await supabase
      .from("channels")
      .update({ is_archived: !c.is_archived })
      .eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success(c.is_archived ? "Channel restored" : "Channel archived");
    invalidate();
  };

  const remove = async (c: Channel) => {
    // Best-effort: delete messages + members first, then channel.
    await supabase.from("messages").delete().eq("channel_id", c.id);
    await supabase.from("channel_members").delete().eq("channel_id", c.id);
    const { error } = await supabase.from("channels").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Channel deleted");
    if (activeId === c.id) setActiveId(null);
    invalidate();
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-[2fr_3fr] gap-4 h-[calc(100vh-8rem)]">
      <Card className="flex flex-col">
        <div className="p-3 border-b flex items-center justify-between">
          <h2 className="font-semibold">Channels</h2>
          {canCreate && <CreateChannelDialog onCreated={() => qc.invalidateQueries({ queryKey: ["channels"] })} />}
        </div>
        <div className="flex-1 overflow-auto">
          {channels.map((c) => (
            <div key={c.id} className={`flex items-center gap-1 border-b ${activeId === c.id ? "bg-muted" : "hover:bg-muted/50"}`}>
              <button onClick={() => openChannel(c.id)} className="flex-1 flex items-center gap-2 p-3 text-left min-w-0">
                <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className={`flex-1 truncate text-sm min-w-0 ${c.is_archived ? "text-muted-foreground line-through" : ""}`} title={c.name}>{c.name}</span>
                <Badge variant="secondary" className="text-[10px] shrink-0">{c.channel_type}</Badge>
              </button>
              {canManage && (
                <div className="flex items-center pr-1 gap-0.5">
                  <EditChannelDialog channel={c} onSaved={invalidate} />
                  <Button size="icon" variant="ghost" className="h-7 w-7" title={c.is_archived ? "Restore" : "Archive"} onClick={() => archive(c)}>
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete #{c.name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete the channel and all its messages. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => remove(c)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </div>
          ))}
          {channels.length === 0 && <p className="p-4 text-sm text-muted-foreground">No channels.</p>}
        </div>
      </Card>
      <Card className="flex flex-col overflow-hidden">
        {activeId ? <ChannelThread channelId={activeId} /> : <div className="flex-1 grid place-items-center text-muted-foreground text-sm">Select a channel</div>}
      </Card>
    </div>
  );
}

function ChannelThread({ channelId }: { channelId: string }) {
  const { employee, isAdmin, hasRole } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const canModerate = isAdmin || hasRole("manager") || hasRole("team_leader");

  const { data: messages = [] } = useQuery({
    queryKey: ["ch-messages", channelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, body, sender_id, created_at, is_pinned")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Msg[];
    },
  });

  const { data: senders = {} } = useQuery({
    queryKey: ["ch-senders", channelId, messages.length],
    enabled: messages.length > 0,
    queryFn: async () => {
      const ids = Array.from(new Set(messages.map((m) => m.sender_id)));
      const { data } = await supabase.from("employees").select("id, full_name").in("id", ids);
      const map: Record<string, string> = {};
      (data ?? []).forEach((e: { id: string; full_name: string }) => { map[e.id] = e.full_name; });
      return map;
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("chan-" + channelId)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` }, () => {
        qc.invalidateQueries({ queryKey: ["ch-messages", channelId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [channelId, qc]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages.length]);

  // Auto-join if not member (best effort)
  useEffect(() => {
    if (!employee?.id) return;
    void supabase.from("channel_members").insert({ channel_id: channelId, employee_id: employee.id }).then(() => {});
  }, [channelId, employee?.id]);

  const send = async () => {
    const text = body.trim();
    if (!text || !employee?.id) return;
    setBody("");
    const { error } = await supabase.from("messages").insert({ channel_id: channelId, sender_id: employee.id, body: text });
    if (error) { toast.error(error.message); setBody(text); }
  };

  const togglePin = async (m: Msg) => {
    const { error } = await supabase.from("messages").update({ is_pinned: !m.is_pinned }).eq("id", m.id);
    if (error) toast.error(error.message);
  };

  const pinned = messages.filter((m) => m.is_pinned);

  return (
    <>
      {pinned.length > 0 && (
        <div className="border-b bg-muted/30 p-2 text-xs space-y-1">
          {pinned.map((m) => (
            <div key={m.id} className="flex items-center gap-1"><Pin className="h-3 w-3" /> {m.body.slice(0, 120)}</div>
          ))}
        </div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-3">
        {messages.map((m) => {
          const mine = m.sender_id === employee?.id;
          return (
            <div key={m.id} className="text-sm group">
              <div className="flex items-baseline gap-2">
                <span className="font-medium">{(senders as Record<string, string>)[m.sender_id] ?? "—"}</span>
                <span className="text-[10px] text-muted-foreground">{new Date(m.created_at).toLocaleString()}</span>
                {m.is_pinned && <Pin className="h-3 w-3 text-primary" />}
                {(mine || canModerate) && (
                  <button onClick={() => togglePin(m)} className="opacity-0 group-hover:opacity-100 text-[10px] text-muted-foreground">
                    {m.is_pinned ? "Unpin" : "Pin"}
                  </button>
                )}
              </div>
              <div className="whitespace-pre-wrap">{m.body}</div>
            </div>
          );
        })}
        {messages.length === 0 && <p className="text-center text-sm text-muted-foreground py-10">No messages yet.</p>}
      </div>
      <div className="border-t p-3 flex gap-2">
        <Input value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Message channel…" maxLength={4000} />
        <Button onClick={send} disabled={!body.trim()}><Send className="h-4 w-4" /></Button>
      </div>
    </>
  );
}

function CreateChannelDialog({ onCreated }: { onCreated: () => void }) {
  const { employee } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"custom" | "team">("custom");

  const create = async () => {
    if (!name.trim() || !employee?.id) return;
    const { data, error } = await supabase.from("channels").insert({
      name: name.trim().replace(/\s+/g, "-"),
      description: description.trim() || null,
      channel_type: type,
      created_by: employee.id,
    }).select().single();
    if (error || !data) { toast.error(error?.message ?? "Failed"); return; }
    await supabase.from("channel_members").insert({ channel_id: data.id, employee_id: employee.id, is_moderator: true });
    toast.success("Channel created");
    setOpen(false); setName(""); setDescription("");
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="ghost"><Plus className="h-4 w-4" /></Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create channel</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={64} /></div>
          <div><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={300} /></div>
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as "custom" | "team")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom</SelectItem>
                <SelectItem value="team">Team</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter><Button onClick={create}>Create</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditChannelDialog({ channel, onSaved }: { channel: Channel; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(channel.name);
  const [description, setDescription] = useState(channel.description ?? "");

  const save = async () => {
    if (!name.trim()) return;
    const { error } = await supabase
      .from("channels")
      .update({
        name: name.trim().replace(/\s+/g, "-"),
        description: description.trim() || null,
      })
      .eq("id", channel.id);
    if (error) return toast.error(error.message);
    toast.success("Channel updated");
    setOpen(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit channel</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={64} /></div>
          <div><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={300} /></div>
        </div>
        <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}