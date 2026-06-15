import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Send, Search, MessageSquarePlus, Circle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({ meta: [{ title: "Messages — JD Connect" }] }),
  component: ChatPage,
});

type Conversation = {
  id: string;
  type: "direct" | "group";
  title: string | null;
  last_message_at: string | null;
  participants: { employee_id: string; employees: { id: string; full_name: string; employee_code: string } | null }[];
};

type Message = {
  id: string;
  body: string;
  sender_id: string;
  created_at: string;
  status: string;
};

function initials(n: string) {
  return n.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
}

export function ChatPage({ initialConversationId }: { initialConversationId?: string } = {}) {
  const { employee } = useAuth();
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(initialConversationId ?? null);
  const [search, setSearch] = useState("");
  const [newChatOpen, setNewChatOpen] = useState(false);

  useEffect(() => {
    if (initialConversationId) setActiveId(initialConversationId);
  }, [initialConversationId]);

  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations", employee?.id],
    enabled: !!employee?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, type, title, last_message_at, participants:conversation_participants(employee_id, employees(id, full_name, employee_code))")
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as Conversation[];
    },
  });

  // Realtime: new conversation/message bumps invalidate the list
  useEffect(() => {
    if (!employee?.id) return;
    const ch = supabase
      .channel("conv-list-" + employee.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        qc.invalidateQueries({ queryKey: ["conversations"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [employee?.id, qc]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    // Only show conversations where I'm a participant (admins can see others' via RLS — hide them here)
    const mine = conversations.filter((c) => c.participants.some((p) => p.employee_id === employee?.id));
    if (!q) return mine;
    return mine.filter((c) =>
      (c.title ?? "").toLowerCase().includes(q) ||
      c.participants.some((p) => p.employees?.full_name.toLowerCase().includes(q) || p.employees?.employee_code.toLowerCase().includes(q))
    );
  }, [conversations, search, employee?.id]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-8rem)]">
      <Card className="flex flex-col">
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Messages</h2>
            <Button size="sm" variant="ghost" onClick={() => setNewChatOpen(true)}><MessageSquarePlus className="h-4 w-4" /></Button>
          </div>
          <div className="relative">
            <Search className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-7 h-8" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {filtered.length === 0 && <p className="p-4 text-sm text-muted-foreground">No conversations yet.</p>}
          {filtered.map((c) => {
            const others = c.participants.filter((p) => p.employee_id !== employee?.id);
            const label = c.title ?? (others.map((p) => p.employees?.full_name).filter(Boolean).join(", ") || "Conversation");
            return (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={`w-full flex items-center gap-3 p-3 border-b text-left hover:bg-muted/50 ${activeId === c.id ? "bg-muted" : ""}`}
              >
                <Avatar className="h-9 w-9"><AvatarFallback>{initials(label)}</AvatarFallback></Avatar>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{label}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.last_message_at ? new Date(c.last_message_at).toLocaleString() : "No messages"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="flex flex-col overflow-hidden">
        {activeId ? (
          <ChatThread conversationId={activeId} />
        ) : (
          <div className="flex-1 grid place-items-center text-muted-foreground text-sm">Select a conversation</div>
        )}
      </Card>

      {newChatOpen && <NewChatDialog onClose={() => setNewChatOpen(false)} onCreated={(id) => { setActiveId(id); setNewChatOpen(false); qc.invalidateQueries({ queryKey: ["conversations"] }); }} />}
    </div>
  );
}

function ChatThread({ conversationId }: { conversationId: string }) {
  const { employee } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages = [] } = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, body, sender_id, created_at, status")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      // Mark received messages as read
      const unread = (data ?? []).filter((m) => m.sender_id !== employee?.id && m.status !== "read").map((m) => m.id);
      if (unread.length) {
        await supabase.from("messages").update({ status: "read", read_at: new Date().toISOString() }).in("id", unread);
      }
      return (data ?? []) as Message[];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("conv-" + conversationId)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, () => {
        qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversationId, qc]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const send = async () => {
    const text = body.trim();
    if (!text || !employee?.id) return;
    setBody("");
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId, sender_id: employee.id, body: text, status: "sent",
    });
    if (error) { toast.error(error.message); setBody(text); }
  };

  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-2">
        {messages.map((m) => {
          const mine = m.sender_id === employee?.id;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                <div className="whitespace-pre-wrap">{m.body}</div>
                <div className="text-[10px] opacity-70 mt-1 flex items-center gap-1 justify-end">
                  {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {mine && <span>· {m.status}</span>}
                </div>
              </div>
            </div>
          );
        })}
        {messages.length === 0 && <p className="text-center text-sm text-muted-foreground py-10">Say hello 👋</p>}
      </div>
      <div className="border-t p-3 flex gap-2">
        <Input value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Type a message…" maxLength={4000} />
        <Button onClick={send} disabled={!body.trim()}><Send className="h-4 w-4" /></Button>
      </div>
    </>
  );
}

function NewChatDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { employee } = useAuth();
  const [q, setQ] = useState("");
  const { data: results = [] } = useQuery({
    queryKey: ["emp-search", q],
      queryFn: async () => {
      const { data, error } = await supabase.rpc("search_employee_directory", { _q: q || undefined, _limit: 20 });
      if (error) throw error;
      return data ?? [];
    },
  });

  const startChat = async (otherId: string) => {
    if (!employee?.id) return;
    const { data, error } = await supabase.rpc("start_direct_chat", { _other: otherId });
    if (error || !data) { toast.error(error?.message ?? "Failed to start chat"); return; }
    onCreated(data as string);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80" onClick={onClose}>
      <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <CardContent className="p-4 space-y-3">
          <h3 className="font-semibold">Start a chat</h3>
          <Input placeholder="Search by name, code, designation…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="max-h-80 overflow-auto space-y-1">
            {(results as { id: string; full_name: string; employee_code: string; designation: string | null; department_name: string | null }[])
              .filter((r) => r.id !== employee?.id)
              .map((r) => (
                <button key={r.id} onClick={() => startChat(r.id)} className="w-full flex items-center gap-3 p-2 rounded hover:bg-muted text-left">
                  <Avatar className="h-8 w-8"><AvatarFallback>{initials(r.full_name)}</AvatarFallback></Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.full_name}</div>
                    <div className="text-xs text-muted-foreground truncate">{r.employee_code} · {r.department_name ?? "—"}</div>
                  </div>
                  <Badge variant="secondary"><Circle className="h-2 w-2 mr-1 fill-current" />Chat</Badge>
                </button>
              ))}
          </div>
          <Button variant="ghost" onClick={onClose} className="w-full">Cancel</Button>
        </CardContent>
      </Card>
    </div>
  );
}