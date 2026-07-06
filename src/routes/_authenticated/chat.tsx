import { createFileRoute, Outlet, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Send, Search, MessageSquarePlus, MessageSquare, Circle, Check, CheckCheck, User, Info, ArrowLeft, Pencil, X as XIcon, Smile, Trash2 } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { MentionInput, renderMessageBody, encodeQuote, stripQuote } from "@/components/MentionInput";
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
type MessageMeta = { lastMessages: Record<string, LastMsg>; unreadCounts: Record<string, number>; mentions: Record<string, boolean> };

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

export function ChatPage({ initialConversationId, initialMessageId }: { initialConversationId?: string; initialMessageId?: string } = {}) {
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
  const { data: messageMeta = { lastMessages: {}, unreadCounts: {}, mentions: {} } as MessageMeta } = useQuery<MessageMeta>({
    queryKey: [
      "chat-message-meta",
      employee?.username,
      convIds.join(","),
      mineConvs.map((c) => c.participants.find((p) => p.employee_id === employee?.id)?.last_read_at ?? "").join(","),
    ],
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
      const mentions: Record<string, boolean> = {};
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
            if (employee?.username && m.body?.includes(`@${employee.username}`)) {
              mentions[m.conversation_id] = true;
            }
          }
        }
      });
      return { lastMessages: map, unreadCounts, mentions };
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
            const hasMention = messageMeta.mentions?.[c.id];
            const preview = last
              ? `${last.sender_id === employee?.id ? "You: " : ""}${stripQuote(last.body)}`
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
                    {(unreadCount > 0 || hasMention) && (
                      <div className="flex items-center gap-1 shrink-0">
                        {hasMention && (
                          <span className="text-red-600 dark:text-red-500 font-extrabold text-lg mr-0.5 leading-none animate-pulse" title="Mentioned">
                            @
                          </span>
                        )}
                        {unreadCount > 0 && (
                          <Badge className="h-5 min-w-5 justify-center px-1.5 text-[10px]">
                            {unreadCount > 99 ? "99+" : unreadCount}
                          </Badge>
                        )}
                      </div>
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
          <ChatThread conversationId={activeId} onBack={handleBack} initialMessageId={initialMessageId} />
        ) : (
          <div className="flex-1 grid place-items-center text-muted-foreground text-sm">Select a conversation</div>
        )}
      </Card>

      {newChatOpen && <NewChatDialog onClose={() => setNewChatOpen(false)} onCreated={(id) => { openConversation(id); setNewChatOpen(false); qc.invalidateQueries({ queryKey: ["conversations"] }); }} />}
    </div>
  );
}

const DM_PAGE_SIZE = 100;

function ChatThread({ conversationId, onBack, initialMessageId }: { conversationId: string; onBack?: () => void; initialMessageId?: string }) {
  const { employee } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastScrollConvId = useRef<string | null>(null);
  const prevScrollHeight = useRef<number>(0);
  const [olderMessages, setOlderMessages] = useState<Message[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; body: string; senderName: string } | null>(null);

  // Reset pagination when switching conversations
  useEffect(() => {
    setOlderMessages([]);
    setHasMoreMessages(true);
    setReplyTo(null);
    lastScrollConvId.current = null;
  }, [conversationId]);

  // Handle escape key to cancel reply quote
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && replyTo) {
        setReplyTo(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [replyTo]);

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

  // Fetch newest DM_PAGE_SIZE messages (DESC), reverse for display
  const { data: latestMessages = [], isLoading } = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, body, sender_id, created_at, status, attachments, edited_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(DM_PAGE_SIZE);
      if (error) throw error;
      return ((data ?? []) as Message[]).reverse();
    },
  });

  // Combined view: older pages prepended before the live window
  const messages = [...olderMessages, ...latestMessages];
  const allChatImages = messages.flatMap((m) => m.attachments ?? []).filter((a) => a.type?.startsWith("image/"));

  const getSenderName = (senderId: string) => {
    if (senderId === employee?.id) return employee?.alias_name || employee?.full_name || "You";
    const part = conversation?.participants.find((p) => p.employee_id === senderId);
    if (part?.employees) return part.employees.alias_name || part.employees.full_name;
    if (senderId === otherId && otherPublicProfile) return otherPublicProfile.alias_name || otherPublicProfile.full_name;
    return "User";
  };

  // Load older messages using a created_at cursor
  const loadOlderMessages = useCallback(async () => {
    const cursor = messages[0]?.created_at;
    if (!cursor || loadingOlderMessages) return;
    prevScrollHeight.current = scrollRef.current?.scrollHeight ?? 0;
    setLoadingOlderMessages(true);
    const { data, error } = await supabase
      .from("messages")
      .select("id, body, sender_id, created_at, status, attachments, edited_at")
      .eq("conversation_id", conversationId)
      .lt("created_at", cursor)
      .order("created_at", { ascending: false })
      .limit(DM_PAGE_SIZE);
    setLoadingOlderMessages(false);
    if (error) { toast.error(error.message); return; }
    const page = ((data ?? []) as Message[]).reverse();
    if (page.length < DM_PAGE_SIZE) setHasMoreMessages(false);
    setOlderMessages((prev) => [...page, ...prev]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, loadingOlderMessages, messages[0]?.created_at]);

  // Restore scroll position after prepending older messages
  useEffect(() => {
    if (!scrollRef.current || prevScrollHeight.current === 0) return;
    const delta = scrollRef.current.scrollHeight - prevScrollHeight.current;
    scrollRef.current.scrollTop += delta;
    prevScrollHeight.current = 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [olderMessages.length]);

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

  // Highlight/scroll to targeted message
  useEffect(() => {
    if (initialMessageId && messages.some((m) => m.id === initialMessageId)) {
      const timer = setTimeout(() => {
        const el = document.getElementById(`message-${initialMessageId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          const oldBg = el.style.backgroundColor;
          const oldTransition = el.style.transition;
          el.style.transition = "background-color 0.2s ease-in-out";
          el.style.backgroundColor = "#fbbf24"; // Amber highlight
          const clearHighlight = setTimeout(() => {
            el.style.backgroundColor = oldBg;
            setTimeout(() => {
              el.style.transition = oldTransition;
            }, 300);
          }, 1000);
          return () => clearTimeout(clearHighlight);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [messages, conversationId, initialMessageId]);

  const send = async () => {
    const text = body.trim();
    if ((!text && attachments.length === 0) || !employee?.id) return;
    setBody("");
    const atts = attachments;
    setAttachments([]);
    const finalBody = replyTo ? encodeQuote(replyTo.id, replyTo.senderName, replyTo.body) + text : text;
    setReplyTo(null);
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId, sender_id: employee.id, body: finalBody, status: "sent", attachments: atts,
    });
    if (error) {
      toast.error(error.message);
      setBody(text);
      setAttachments(atts);
    } else {
      void qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      void qc.invalidateQueries({ queryKey: ["chat-message-meta"] });
    }
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

  const deleteMessage = async (id: string) => {
    const { error } = await supabase
      .from("messages")
      .update({ body: "This message has been deleted.", attachments: [] })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Message deleted");
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
        {/* Load older messages button */}
        {hasMoreMessages && latestMessages.length >= DM_PAGE_SIZE && (
          <div className="flex justify-center pt-1 pb-2">
            <button
              onClick={() => void loadOlderMessages()}
              disabled={loadingOlderMessages}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground font-medium transition-colors disabled:opacity-50"
            >
              {loadingOlderMessages ? "Loading…" : "Load older messages"}
            </button>
          </div>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === employee?.id;
          const isEditing = editingId === m.id;
          const isDeleted = m.body === "This message has been deleted.";
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              {isDeleted ? (
                <div 
                  id={`message-${m.id}`}
                  className={`relative max-w-[75%] rounded-2xl py-2 px-3 text-sm shadow-sm border ${
                    mine
                      ? "bg-primary/85 text-primary-foreground/85 border-primary/10 rounded-tr-none"
                      : "bg-card text-muted-foreground/70 border-border/50 rounded-tl-none"
                  }`}
                >
                  <div className="leading-relaxed italic select-none">This message has been deleted.</div>
                  <div className={`text-[10px] mt-1.5 flex items-center justify-end select-none opacity-60 ${
                    mine ? "text-primary-foreground/70" : "text-muted-foreground/70"
                  }`}>
                    {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              ) : (
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <div 
                      id={`message-${m.id}`}
                      className={`relative max-w-[75%] rounded-2xl py-2 text-sm shadow-sm border ${
                        mine
                          ? "bg-primary text-primary-foreground border-primary/20 rounded-tr-none pl-4 pr-2.5"
                          : "bg-card text-card-foreground border-border/50 rounded-tl-none pl-3 pr-4"
                      }`}
                    >
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

                      <AttachmentList attachments={(m.attachments ?? []) as ChatAttachment[]} allChatImages={allChatImages} />
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
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-48">
                    {mine && !isEditing && (
                      <>
                        <ContextMenuItem
                          className="gap-2 cursor-pointer"
                          onSelect={() => startEdit(m)}
                        >
                          <Pencil className="h-4 w-4" />
                          Edit message
                        </ContextMenuItem>
                        <ContextMenuItem
                          className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                          onSelect={() => void deleteMessage(m.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete message
                        </ContextMenuItem>
                      </>
                    )}
                    <ContextMenuItem
                      className="gap-2 cursor-pointer"
                      onSelect={() => {
                        const senderName = getSenderName(m.sender_id);
                        setReplyTo({ id: m.id, body: m.body, senderName });
                      }}
                    >
                      <MessageSquare className="h-4 w-4" />
                      Reply to message
                    </ContextMenuItem>
                    <ContextMenuSub>
                      <ContextMenuSubTrigger className="gap-2 cursor-pointer">
                        <Smile className="h-4 w-4" />
                        React
                      </ContextMenuSubTrigger>
                      <ContextMenuSubContent className="p-1">
                        <div className="flex flex-wrap gap-0.5 max-w-[160px]">
                          {["👍","❤️","😂","🎉","🙏","👀","🔥","✅"].map((emoji) => (
                            <ContextMenuItem
                              key={emoji}
                              className="text-lg p-1.5 rounded cursor-pointer hover:bg-muted justify-center"
                              onSelect={() => {
                                void (async () => {
                                  const { data: existing } = await (supabase as any)
                                    .from("message_reactions")
                                    .select("id")
                                    .eq("message_id", m.id)
                                    .eq("employee_id", employee?.id)
                                    .eq("emoji", emoji)
                                    .maybeSingle();
                                  if (existing) {
                                    await (supabase as any).from("message_reactions").delete().eq("id", existing.id);
                                  } else {
                                    await (supabase as any).from("message_reactions").insert({ message_id: m.id, employee_id: employee?.id, emoji });
                                  }
                                  void qc.invalidateQueries({ queryKey: ["reactions", m.id] });
                                })();
                              }}
                            >
                              {emoji}
                            </ContextMenuItem>
                          ))}
                        </div>
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                  </ContextMenuContent>
                </ContextMenu>
              )}
            </div>
          );
        })}
        {!isLoading && messages.length === 0 && <p className="text-center text-sm text-muted-foreground py-10">Say hello 👋</p>}
      </div>
      <div className="border-t p-3 space-y-2 bg-card shadow-inner" onPaste={handlePaste}>
        {replyTo && (
          <div className="flex items-center justify-between gap-2 px-3 py-1 text-xs bg-muted border-l-4 border-primary rounded-r-md">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[10px] text-primary uppercase">Replying to {replyTo.senderName}</div>
              <div className="truncate text-muted-foreground">{replyTo.body.replace(/\[QUOTE\|.*?\]\n?/g, "")}</div>
            </div>
            <button onClick={() => setReplyTo(null)} className="p-0.5 hover:bg-muted-foreground/10 rounded">
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
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