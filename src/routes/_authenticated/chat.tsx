import { createFileRoute, Outlet, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Send, Search, MessageSquarePlus, Circle, Check, CheckCheck, User, Info, ArrowLeft, Pencil, X as XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { MentionInput, renderMessageBody } from "@/components/MentionInput";
import { MessageReactions } from "@/components/MessageReactions";
import { AttachmentPicker, AttachmentList, PendingAttachmentList, type ChatAttachment, uploadFiles } from "@/components/ChatAttachments";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({ meta: [{ title: "Messages — JD Connect" }] }),
  component: () => <Outlet />,
});

type Conversation = {
  id: string;
  type: "direct" | "group";
  title: string | null;
  last_message_at: string | null;
  participants: { employee_id: string; last_read_at: string | null; employees: { id: string; full_name: string; alias_name: string | null; employee_code: string } | null }[];
};

type PublicProfile = { id: string; full_name: string; alias_name: string | null; employee_code: string };
type LastMsg = { body: string; sender_id: string; created_at: string };
type MessageMeta = { lastMessages: Record<string, LastMsg>; unreadCounts: Record<string, number> };

type Message = {
  id: string;
  body: string;
  sender_id: string;
  created_at: string;
  status: string;
  edited_at?: string | null;
  attachments?: any;
};

function initials(n: string) {
  return n.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
}

export function ChatPage({ initialConversationId }: { initialConversationId?: string } = {}) {
  const { employee } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
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
        .select("id, type, title, last_message_at, participants:conversation_participants(employee_id, last_read_at, employees(id, full_name, alias_name, employee_code))")
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as Conversation[];
    },
  });

  // Resolve names for participants whose employees row is hidden by RLS
  const mineConvs = useMemo(
    () => conversations.filter((c) => c.participants.some((p) => p.employee_id === employee?.id)),
    [conversations, employee?.id],
  );
  const missingIds = useMemo(() => {
    const s = new Set<string>();
    mineConvs.forEach((c) =>
      c.participants.forEach((p) => {
        if (p.employee_id !== employee?.id && !p.employees) s.add(p.employee_id);
      }),
    );
    return Array.from(s);
  }, [mineConvs, employee?.id]);

  const { data: publicProfiles = {} } = useQuery({
    queryKey: ["chat-public-profiles", missingIds.sort().join(",")],
    enabled: missingIds.length > 0,
    queryFn: async () => {
      const map: Record<string, PublicProfile> = {};
      const results = await Promise.all(
        missingIds.map((id) => supabase.rpc("get_employee_public_profile", { _id: id })),
      );
      results.forEach((r, i) => {
        const row = Array.isArray(r.data) ? r.data[0] : r.data;
        if (row) map[missingIds[i]] = { id: missingIds[i], full_name: row.full_name, alias_name: row.alias_name ?? null, employee_code: row.employee_code };
      });
      return map;
    },
  });

  const convIds = useMemo(() => mineConvs.map((c) => c.id), [mineConvs]);
  const { data: messageMeta = { lastMessages: {}, unreadCounts: {} } as MessageMeta } = useQuery<MessageMeta>({
    queryKey: ["chat-message-meta", convIds.join(","), mineConvs.map((c) => c.participants.find((p) => p.employee_id === employee?.id)?.last_read_at ?? "").join(",")],
    enabled: convIds.length > 0,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("conversation_id, body, sender_id, created_at, status")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const map: Record<string, LastMsg> = {};
      const unreadCounts: Record<string, number> = {};
      const lastReadByConversation = new Map(
        mineConvs.map((c) => [c.id, c.participants.find((p) => p.employee_id === employee?.id)?.last_read_at ?? null]),
      );
      (data ?? []).forEach((m) => {
        if (m.conversation_id && !map[m.conversation_id]) {
          map[m.conversation_id] = { body: m.body, sender_id: m.sender_id, created_at: m.created_at };
        }
        if (m.conversation_id && m.sender_id !== employee?.id) {
          const lastReadAt = lastReadByConversation.get(m.conversation_id);
          const isUnread = lastReadAt
            ? new Date(m.created_at).getTime() > new Date(lastReadAt).getTime()
            : m.status !== "read";
          if (isUnread) {
            unreadCounts[m.conversation_id] = (unreadCounts[m.conversation_id] ?? 0) + 1;
          }
        }
      });
      return { lastMessages: map, unreadCounts };
    },
  });

  const nameFor = (id: string): string | undefined => {
    const emp = mineConvs.flatMap((c) => c.participants).find((p) => p.employee_id === id)?.employees;
    const fromConv = emp ? (emp.alias_name || emp.full_name) : undefined;
    const pub = publicProfiles[id];
    return fromConv ?? (pub ? (pub.alias_name || pub.full_name) : undefined);
  };

  // Realtime: new conversation/message bumps invalidate the list
  useEffect(() => {
    if (!employee?.id) return;
    const ch = supabase
      .channel("conv-list-" + employee.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        qc.invalidateQueries({ queryKey: ["conversations"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        qc.invalidateQueries({ queryKey: ["chat-message-meta"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [employee?.id, qc]);

  const filtered = useMemo(() => {
    // Only show conversations that have at least one message
    const withMessages = mineConvs.filter(
      (c) => !!c.last_message_at || !!messageMeta.lastMessages[c.id] || c.id === activeId,
    );
    const q = search.toLowerCase().trim();
    if (!q) return withMessages;
    return withMessages.filter((c) => {
      if ((c.title ?? "").toLowerCase().includes(q)) return true;
      return c.participants.some((p) => {
        const emp = p.employees;
        const pub = publicProfiles[p.employee_id];
        const nm = (emp?.alias_name || emp?.full_name) ?? (pub?.alias_name || pub?.full_name) ?? "";
        const full = emp?.full_name ?? pub?.full_name ?? "";
        const code = emp?.employee_code ?? pub?.employee_code ?? "";
        return nm.toLowerCase().includes(q) || full.toLowerCase().includes(q) || code.toLowerCase().includes(q);
      });
    });
  }, [mineConvs, search, publicProfiles, messageMeta.lastMessages, activeId]);

  const openConversation = (conversationId: string) => {
    setActiveId(conversationId);
    void navigate({ to: "/chat/$conversationId", params: { conversationId } });
  };

  const handleBack = () => {
    setActiveId(null);
    void navigate({ to: "/communication", search: { section: "dm" } });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4 h-full">
      <Card className={cn("flex flex-col", activeId ? "hidden md:flex" : "flex")}>
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
            const label =
              c.title ??
              (others.map((p) => (p.employees?.alias_name || p.employees?.full_name) ?? nameFor(p.employee_id)).filter(Boolean).join(", ") || "Conversation");
            const last = messageMeta.lastMessages[c.id];
            const unreadCount = messageMeta.unreadCounts[c.id] ?? 0;
            const preview = last
              ? `${last.sender_id === employee?.id ? "You: " : ""}${last.body}`
              : null;
            return (
              <button
                key={c.id}
                onClick={() => openConversation(c.id)}
                className={`w-full flex items-center gap-3 p-3 border-b text-left hover:bg-muted/50 ${activeId === c.id ? "bg-muted" : ""}`}
              >
                <Avatar className="h-9 w-9"><AvatarFallback>{initials(label)}</AvatarFallback></Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-sm font-medium truncate">{label}</div>
                    {c.last_message_at && (
                      <div className="text-[10px] text-muted-foreground shrink-0">
                        {new Date(c.last_message_at).toLocaleDateString([], { day: "2-digit", month: "short" })}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className={`text-xs truncate ${unreadCount ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                      {preview ?? "No messages yet"}
                    </div>
                    {unreadCount > 0 && (
                      <Badge className="h-5 min-w-5 justify-center px-1.5 text-[10px] shrink-0">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className={cn("flex flex-col overflow-hidden", activeId ? "flex" : "hidden md:flex")}>
        {activeId ? (
          <ChatThread conversationId={activeId} onBack={handleBack} />
        ) : (
          <div className="flex-1 grid place-items-center text-muted-foreground text-sm">Select a conversation</div>
        )}
      </Card>

      {newChatOpen && <NewChatDialog onClose={() => setNewChatOpen(false)} onCreated={(id) => { openConversation(id); setNewChatOpen(false); qc.invalidateQueries({ queryKey: ["conversations"] }); }} />}
    </div>
  );
}

function ChatThread({ conversationId, onBack }: { conversationId: string; onBack?: () => void }) {
  const { employee } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastScrollConvId = useRef<string | null>(null);

  // Fetch conversation and participant metadata
  const { data: conversation } = useQuery({
    queryKey: ["conversation", conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, type, title, participants:conversation_participants(employee_id, employees:employees(id, full_name, alias_name, employee_code, designation))")
        .eq("id", conversationId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const otherParticipant = useMemo(() => {
    if (!conversation) return null;
    return conversation.participants.find((p) => p.employee_id !== employee?.id) || null;
  }, [conversation, employee?.id]);

  const otherId = otherParticipant?.employee_id;

  // Fallback public profile query for participants hidden by RLS
  const { data: otherPublicProfile } = useQuery({
    queryKey: ["chat-public-profile", otherId],
    enabled: !!otherId && !otherParticipant?.employees,
    queryFn: async () => {
      if (!otherId) return null;
      const { data } = await supabase.rpc("get_employee_public_profile", { _id: otherId });
      const row = Array.isArray(data) ? data[0] : data;
      return row as { full_name: string; alias_name: string | null; employee_code: string } | null;
    },
  });

  const chatTitle = useMemo(() => {
    if (!conversation) return "Loading...";
    if (conversation.type === "group") return conversation.title ?? "Group Chat";

    // Direct chat
    const emp = otherParticipant?.employees;
    if (emp) return emp.alias_name || emp.full_name;
    if (otherPublicProfile) return otherPublicProfile.alias_name || otherPublicProfile.full_name;
    return "Direct Chat";
  }, [conversation, otherParticipant, otherPublicProfile]);

  const chatSubtitle = useMemo(() => {
    if (!conversation) return "";
    if (conversation.type === "group") return "Group Conversation";

    // Direct chat
    const emp = otherParticipant?.employees;
    const code = emp?.employee_code || otherPublicProfile?.employee_code;
    const designation = emp?.designation;

    const parts = [code, designation].filter(Boolean);
    return parts.join(" · ");
  }, [conversation, otherParticipant, otherPublicProfile]);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, body, sender_id, created_at, status, attachments, edited_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Message[];
    },
  });

  useEffect(() => {
    if (!employee?.id) return;

    const markRead = async () => {
      const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
      let isAppFocused = typeof document !== "undefined" && document.hasFocus() && document.visibilityState === "visible";

      if (isTauri) {
        try {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          const win = getCurrentWindow();
          const [focused, minimized] = await Promise.all([win.isFocused(), win.isMinimized()]);
          isAppFocused = focused && !minimized;
        } catch { }
      }

      if (isAppFocused) {
        void supabase.rpc("mark_conversation_read", { _conversation_id: conversationId }).then(() => {
          void qc.invalidateQueries({ queryKey: ["notifications"] });
          void qc.invalidateQueries({ queryKey: ["conversations"] });
          void qc.invalidateQueries({ queryKey: ["chat-message-meta"] });
          void qc.invalidateQueries({ queryKey: ["comm-unread"] });
        });
      }
    };

    void markRead();

    window.addEventListener("focus", markRead);
    document.addEventListener("visibilitychange", markRead);

    return () => {
      window.removeEventListener("focus", markRead);
      document.removeEventListener("visibilitychange", markRead);
    };
  }, [conversationId, employee?.id, messages.length, qc]);

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
    if (!scrollRef.current) return;
    if (lastScrollConvId.current !== conversationId) {
      // Instant scroll on switching conversation
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "auto" });
      if (messages.length > 0) {
        lastScrollConvId.current = conversationId;
      }
    } else {
      // Smooth scroll for subsequent message updates (e.g. new message received/sent)
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length, conversationId]);

  const send = async () => {
    const text = body.trim();
    if ((!text && attachments.length === 0) || !employee?.id) return;
    setBody("");
    const atts = attachments;
    setAttachments([]);
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId, sender_id: employee.id, body: text, status: "sent", attachments: atts,
    });
    if (error) { toast.error(error.message); setBody(text); setAttachments(atts); }
  };

  const startEdit = (m: Message) => {
    setEditingId(m.id);
    setEditBody(m.body);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditBody("");
  };

  const saveEdit = async (id: string) => {
    const text = editBody.trim();
    if (!text) return;
    const { error } = await supabase
      .from("messages")
      .update({ body: text, edited_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    setEditingId(null);
    setEditBody("");
    qc.invalidateQueries({ queryKey: ["messages", conversationId] });
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length > 0) {
      e.preventDefault();
      const toastId = toast.loading("Uploading pasted file...");
      try {
        const uploaded = await uploadFiles(files, { kind: "conversation", id: conversationId });
        setAttachments((prev) => [...prev, ...uploaded]);
        toast.success("File uploaded", { id: toastId });
      } catch (err: any) {
        toast.error(err.message || "Upload failed", { id: toastId });
      }
    }
  };

  return (
    <>
      {/* Static header bar at the top */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card text-card-foreground shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 md:hidden shrink-0"
              onClick={onBack}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <Avatar className="h-9 w-9 border">
            <AvatarFallback className="bg-primary text-primary-foreground font-semibold">{initials(chatTitle)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{chatTitle}</div>
            {chatSubtitle && <div className="text-xs text-muted-foreground truncate">{chatSubtitle}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {conversation?.type === "direct" && otherId && (
            <Button variant="outline" size="sm" asChild className="gap-1.5 h-8">
              <Link to="/employees/$id" params={{ id: otherId }}>
                <User className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">View Profile</span>
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Messages viewport */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-3 bg-[#eef2f6] dark:bg-[#0b0f17]">
        {messages.map((m) => {
          const mine = m.sender_id === employee?.id;
          const isEditing = editingId === m.id;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`group relative max-w-[75%] rounded-2xl py-2 text-sm shadow-sm border ${
                mine
                  ? "bg-primary text-primary-foreground border-primary/20 rounded-tr-none pl-4 pr-2.5"
                  : "bg-card text-card-foreground border-border/50 rounded-tl-none pl-3 pr-4"
              }`}>
                {/* Hover action bar — only for own messages */}
                {mine && !isEditing && (
                  <div className="absolute top-0 -translate-y-1/2 left-2 flex items-center gap-1 bg-background border shadow-sm px-1.5 py-0.5 rounded-full z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                    <button
                      onClick={() => startEdit(m)}
                      className="text-[10px] text-muted-foreground hover:text-foreground font-medium inline-flex items-center gap-0.5 cursor-pointer"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </button>
                  </div>
                )}

                {/* Message body — normal or edit mode */}
                {isEditing ? (
                  <div className="space-y-1.5">
                    <textarea
                      className="w-full min-w-[200px] bg-primary-foreground/10 text-primary-foreground border border-primary-foreground/30 rounded-lg px-2 py-1.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary-foreground/50"
                      rows={3}
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Escape") cancelEdit();
                        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void saveEdit(m.id);
                      }}
                    />
                    <div className="flex items-center gap-1.5 justify-end">
                      <button
                        onClick={cancelEdit}
                        className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground/80 transition-colors"
                      >
                        <XIcon className="h-3 w-3" /> Cancel
                      </button>
                      <button
                        onClick={() => void saveEdit(m.id)}
                        disabled={!editBody.trim()}
                        className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground font-semibold disabled:opacity-40 transition-colors"
                      >
                        <Check className="h-3 w-3" /> Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="leading-relaxed">{renderMessageBody(m.body, mine)}</div>
                )}

                <AttachmentList attachments={(m.attachments ?? []) as ChatAttachment[]} />
                <div className="text-[10px] mt-1.5 flex items-center justify-end select-none gap-1 opacity-70">
                  {m.edited_at && (
                    <span className="italic opacity-80">edited ·</span>
                  )}
                  {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {mine && (
                    <span className="shrink-0">
                      {m.status === "read" ? (
                        <CheckCheck className="h-3.5 w-3.5 text-sky-300" />
                      ) : (
                        <Check className="h-3.5 w-3.5 text-primary-foreground/60" />
                      )}
                    </span>
                  )}
                </div>
                <MessageReactions messageId={m.id} />
              </div>
            </div>
          );
        })}
        {!isLoading && messages.length === 0 && <p className="text-center text-sm text-muted-foreground py-10">Say hello 👋</p>}
      </div>
      <div className="border-t p-3 space-y-2 bg-card shadow-inner" onPaste={handlePaste}>
        <PendingAttachmentList
          attachments={attachments}
          onRemove={async (att) => {
            await supabase.storage.from("chat-attachments").remove([att.path]);
            setAttachments((prev) => prev.filter((a) => a.path !== att.path));
          }}
        />
        <div className="flex gap-2 items-center">
          <MentionInput
            value={body}
            onChange={setBody}
            onSubmit={send}
            placeholder="Type a message… use @ to mention"
            maxLength={4000}
          />
          <AttachmentPicker
            value={attachments}
            onChange={setAttachments}
            scope={{ kind: "conversation", id: conversationId }}
          />
          <Button onClick={send} disabled={!body.trim() && attachments.length === 0} className="shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        </div>
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