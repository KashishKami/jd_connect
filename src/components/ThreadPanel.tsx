import { formatDateTime, formatChatDividerDate } from "@/lib/utils";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { X, Send, Pencil, Trash2, Smile, MessageSquare, Check } from "lucide-react";
import { MessageReactions } from "@/components/MessageReactions";
import { AttachmentList, type ChatAttachment } from "@/components/ChatAttachments";
import { renderMessageBody, MentionInput, MentionInputHandle, encodeQuote } from "@/components/MentionInput";
import { toast } from "sonner";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

type ReplyMsg = {
  id: string;
  body: string;
  sender_id: string;
  created_at: string;
  attachments: ChatAttachment[] | null;
  employees: { full_name: string; username: string | null } | null;
  edited_at?: string | null;
};

const THREAD_PAGE_SIZE = 100;

export function ThreadPanel({ parentId, channelId, onClose }: { parentId: string; channelId: string; onClose: () => void }) {
  const { employee } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<MentionInputHandle>(null);
  const prevScrollHeight = useRef<number>(0);
  const lastReplyIdRef = useRef<string | undefined>(undefined);
  const lastParentIdRef = useRef<string | null>(null);
  const [olderReplies, setOlderReplies] = useState<ReplyMsg[]>([]);
  const [hasMoreReplies, setHasMoreReplies] = useState(true);
  const [loadingOlderReplies, setLoadingOlderReplies] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; body: string; senderName: string } | null>(null);

  // Reset pagination when switching threads
  useEffect(() => {
    setOlderReplies([]);
    setHasMoreReplies(true);
    setReplyTo(null);
    lastParentIdRef.current = null;
  }, [parentId]);

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

  const { data: parent } = useQuery({
    queryKey: ["thread-parent", parentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, body, sender_id, created_at, attachments, edited_at, employees!messages_sender_id_fkey(full_name, username)")
        .eq("id", parentId).maybeSingle();
      if (error) throw error;
      return data as unknown as ReplyMsg | null;
    },
  });

  // Fetch newest THREAD_PAGE_SIZE replies (DESC), reverse for display
  const { data: latestReplies = [] } = useQuery({
    queryKey: ["thread-replies", parentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, body, sender_id, created_at, attachments, edited_at, employees!messages_sender_id_fkey(full_name, username)")
        .eq("parent_message_id", parentId)
        .order("created_at", { ascending: false })
        .limit(THREAD_PAGE_SIZE);
      if (error) throw error;
      return ((data ?? []) as unknown as ReplyMsg[]).reverse();
    },
  });

  // Combined view: older pages prepended before the live window
  const replies = [...olderReplies, ...latestReplies];

  // Group replies by day for sticky headers
  const replyGroups = useMemo(() => {
    const groups: { dateStr: string; replies: ReplyMsg[] }[] = [];
    replies.forEach((r) => {
      const dateStr = new Date(r.created_at).toDateString();
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.dateStr === dateStr) {
        lastGroup.replies.push(r);
      } else {
        groups.push({ dateStr, replies: [r] });
      }
    });
    return groups;
  }, [replies]);

  // Load older replies using a created_at cursor
  const loadOlderReplies = useCallback(async () => {
    const cursor = replies[0]?.created_at;
    if (!cursor || loadingOlderReplies) return;
    prevScrollHeight.current = scrollRef.current?.scrollHeight ?? 0;
    setLoadingOlderReplies(true);
    const { data, error } = await supabase
      .from("messages")
      .select("id, body, sender_id, created_at, attachments, edited_at, employees!messages_sender_id_fkey(full_name, username)")
      .eq("parent_message_id", parentId)
      .lt("created_at", cursor)
      .order("created_at", { ascending: false })
      .limit(THREAD_PAGE_SIZE);
    setLoadingOlderReplies(false);
    if (error) { toast.error(error.message); return; }
    const page = ((data ?? []) as unknown as ReplyMsg[]).reverse();
    if (page.length < THREAD_PAGE_SIZE) setHasMoreReplies(false);
    setOlderReplies((prev) => [...page, ...prev]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentId, loadingOlderReplies, replies[0]?.created_at]);

  // Restore scroll position after prepending older replies
  useEffect(() => {
    if (!scrollRef.current || prevScrollHeight.current === 0) return;
    const delta = scrollRef.current.scrollHeight - prevScrollHeight.current;
    scrollRef.current.scrollTop += delta;
    prevScrollHeight.current = 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [olderReplies.length]);

  useEffect(() => {
    const ch = supabase.channel(`thread-${parentId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `parent_message_id=eq.${parentId}` }, () => {
        qc.invalidateQueries({ queryKey: ["thread-replies", parentId] });
        qc.invalidateQueries({ queryKey: ["ch-messages", channelId] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `id=eq.${parentId}` }, () => {
        qc.invalidateQueries({ queryKey: ["thread-parent", parentId] });
        qc.invalidateQueries({ queryKey: ["ch-messages", channelId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [parentId, channelId, qc]);

  const lastReplyId = replies[replies.length - 1]?.id;

  useEffect(() => {
    if (!scrollRef.current) return;
    if (lastParentIdRef.current !== parentId) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "auto" });
      if (replies.length > 0) {
        lastParentIdRef.current = parentId;
        lastReplyIdRef.current = lastReplyId;
      }
    } else {
      if (lastReplyId && lastReplyId !== lastReplyIdRef.current) {
        scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
        lastReplyIdRef.current = lastReplyId;
      }
    }
  }, [replies.length, parentId, lastReplyId]);

  const send = async () => {
    const text = body.trim();
    if (!text || !employee?.id) return;
    setBody("");
    const finalBody = replyTo ? encodeQuote(replyTo.id, replyTo.senderName, replyTo.body) + text : text;
    setReplyTo(null);
    const { error } = await supabase.from("messages").insert({
      channel_id: channelId,
      sender_id: employee.id,
      body: finalBody,
      parent_message_id: parentId,
    });
    if (error) {
      toast.error(error.message);
      setBody(text);
    } else {
      void qc.invalidateQueries({ queryKey: ["thread-replies", parentId] });
    }
  };

  const startEdit = (m: ReplyMsg) => {
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
    qc.invalidateQueries({ queryKey: ["thread-parent", parentId] });
    qc.invalidateQueries({ queryKey: ["thread-replies", parentId] });
    qc.invalidateQueries({ queryKey: ["ch-messages", channelId] });
  };

  const deleteMessage = async (id: string) => {
    const { error } = await supabase
      .from("messages")
      .update({ body: "This message has been deleted.", attachments: [] })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Message deleted");
    qc.invalidateQueries({ queryKey: ["thread-parent", parentId] });
    qc.invalidateQueries({ queryKey: ["thread-replies", parentId] });
    qc.invalidateQueries({ queryKey: ["ch-messages", channelId] });
  };

  const handleReply = (username: string | null, fullName: string) => {
    const tag = username ? `@${username}` : `@${fullName}`;
    setBody((prev) => {
      const trimmed = prev.trim();
      return trimmed ? `${trimmed} ${tag} ` : `${tag} `;
    });
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  // Compile all images in the thread for the slideshow gallery
  const allChatImages = [
    ...(parent?.attachments ?? []),
    ...replies.flatMap((r) => r.attachments ?? []),
  ].filter((a) => a.type?.startsWith("image/"));

  return (
    <>
      {/* Mobile backdrop — tapping it closes the panel */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] md:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel — fixed slide-over on mobile, inline side-panel on desktop */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-[calc(100%-2.5rem)] max-w-sm flex-col border-l bg-background shadow-2xl transition-transform duration-300 ease-out md:relative md:inset-auto md:z-auto md:w-80 md:shadow-none md:translate-x-0">
        <div className="flex items-center justify-between border-b p-3">
          <div className="text-sm font-semibold">Thread · {replies.length} {replies.length === 1 ? "reply" : "replies"}</div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-auto p-3 space-y-4 bg-muted/20">
          {/* Load older replies button */}
          {hasMoreReplies && latestReplies.length >= THREAD_PAGE_SIZE && (
            <div className="flex justify-center pt-1 pb-1">
              <button
                onClick={() => void loadOlderReplies()}
                disabled={loadingOlderReplies}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground font-medium transition-colors disabled:opacity-50"
              >
                {loadingOlderReplies ? "Loading…" : "Load older replies"}
              </button>
            </div>
          )}
          {parent && (
            <div className="space-y-3 relative">
              <div className="sticky top-0 z-10 flex items-center justify-center py-1 w-full">
                <span className="mx-3 text-[10px] font-semibold text-muted-foreground bg-background/90 backdrop-blur-sm px-2.5 py-1 rounded-full shadow-sm border border-border/50 select-none">
                  {formatChatDividerDate(parent.created_at)}
                </span>
              </div>
              <MessageRow
                m={parent}
                mine={parent.sender_id === employee?.id}
                isEditing={editingId === parent.id}
                editBody={editBody}
                setEditBody={setEditBody}
                startEdit={startEdit}
                cancelEdit={cancelEdit}
                saveEdit={saveEdit}
                deleteMessage={deleteMessage}
                onReply={handleReply}
                onQuoteReply={(id, b, sender) => setReplyTo({ id, body: b, senderName: sender })}
                employeeId={employee?.id ?? ""}
                qc={qc}
                allChatImages={allChatImages}
              />
            </div>
          )}
          {replies.length > 0 && <div className="border-b text-[10px] text-muted-foreground uppercase tracking-wider py-1 font-semibold">Replies</div>}
          <div className="space-y-3">
            {replyGroups.map((group) => {
              const showDivider = !parent || new Date(parent.created_at).toDateString() !== group.dateStr;
              return (
                <div key={group.dateStr} className="space-y-3 relative">
                  {showDivider && (
                    <div className="sticky top-0 z-10 flex items-center justify-center py-1 w-full">
                      <span className="mx-3 text-[10px] font-semibold text-muted-foreground bg-background/90 backdrop-blur-sm px-2.5 py-1 rounded-full shadow-sm border border-border/50 select-none">
                        {formatChatDividerDate(group.dateStr)}
                      </span>
                    </div>
                  )}
                  {group.replies.map((m) => (
                    <MessageRow
                      key={m.id}
                      m={m}
                      mine={m.sender_id === employee?.id}
                      isEditing={editingId === m.id}
                      editBody={editBody}
                      setEditBody={setEditBody}
                      startEdit={startEdit}
                      cancelEdit={cancelEdit}
                      saveEdit={saveEdit}
                      deleteMessage={deleteMessage}
                      onReply={handleReply}
                      onQuoteReply={(id, b, sender) => setReplyTo({ id, body: b, senderName: sender })}
                      employeeId={employee?.id ?? ""}
                      qc={qc}
                      allChatImages={allChatImages}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
        <div className="border-t p-2 space-y-2">
          {replyTo && (
            <div className="flex items-center justify-between gap-2 px-3 py-1 text-xs bg-muted border-l-4 border-primary rounded-r-md">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[10px] text-primary uppercase">Replying to {replyTo.senderName}</div>
                <div className="truncate text-muted-foreground">{replyTo.body.replace(/\[QUOTE\|.*?\]\n?/g, "")}</div>
              </div>
              <button onClick={() => setReplyTo(null)} className="p-0.5 hover:bg-muted-foreground/10 rounded">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <div className="flex gap-2 items-center">
            <MentionInput
              ref={inputRef}
              value={body}
              onChange={setBody}
              onSubmit={send}
              placeholder="Reply…"
              maxLength={4000}
            />
            <Button size="sm" onClick={send} disabled={!body.trim()} className="shrink-0">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

function MessageRow({
  m,
  mine,
  isEditing,
  editBody,
  setEditBody,
  startEdit,
  cancelEdit,
  saveEdit,
  deleteMessage,
  onReply,
  onQuoteReply,
  employeeId,
  qc,
  allChatImages,
}: {
  m: ReplyMsg;
  mine: boolean;
  isEditing: boolean;
  editBody: string;
  setEditBody: (v: string) => void;
  startEdit: (m: ReplyMsg) => void;
  cancelEdit: () => void;
  saveEdit: (id: string) => Promise<void>;
  deleteMessage: (id: string) => Promise<void>;
  onReply: (username: string | null, fullName: string) => void;
  onQuoteReply: (id: string, body: string, senderName: string) => void;
  employeeId: string;
  qc: any;
  allChatImages: ChatAttachment[];
}) {
  const isDeleted = m.body === "This message has been deleted.";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"} text-sm group`}>
      <div className="flex flex-col max-w-[85%]">
        {!mine && (
          <div className="text-[10px] text-muted-foreground mb-0.5 px-1 flex items-center gap-2">
            <span className="font-semibold text-foreground/80">{m.employees?.full_name ?? "—"}</span>
            <span>{formatDateTime(m.created_at)}</span>
          </div>
        )}
        {mine && (
          <div className="text-[10px] text-muted-foreground mb-0.5 px-1 flex items-center justify-end gap-2">
            <span>{formatDateTime(m.created_at)}</span>
          </div>
        )}
        {isDeleted ? (
          <div 
            className={`relative rounded-2xl py-1.5 px-3 shadow-sm border ${
              mine
                ? "bg-primary/85 text-primary-foreground/85 border-primary/10 rounded-tr-none"
                : "bg-card text-muted-foreground/70 border-border/50 rounded-tl-none"
            }`}
          >
            <div className="leading-relaxed italic select-none">This message has been deleted.</div>
          </div>
        ) : (
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div
                className={`relative rounded-2xl py-1.5 px-3 shadow-sm border ${
                  mine
                    ? "bg-primary text-primary-foreground border-primary/20 rounded-tr-none"
                    : "bg-card text-card-foreground border-border/50 rounded-tl-none"
                }`}
              >
                {isEditing ? (
                  <div className="space-y-1.5 min-w-[180px]">
                    <textarea
                      className="w-full bg-primary-foreground/10 text-primary-foreground border border-primary-foreground/30 rounded-lg px-2 py-1 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary-foreground/50"
                      rows={2}
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Escape") cancelEdit();
                        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void saveEdit(m.id);
                      }}
                    />
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={cancelEdit}
                        className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground/80 transition-colors"
                      >
                        <X className="h-2.5 w-2.5" /> Cancel
                      </button>
                      <button
                        onClick={() => void saveEdit(m.id)}
                        disabled={!editBody.trim()}
                        className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground font-semibold disabled:opacity-40 transition-colors"
                      >
                        <Check className="h-2.5 w-2.5" /> Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="leading-relaxed break-words whitespace-pre-wrap">{renderMessageBody(m.body, mine)}</div>
                    {!mine && m.edited_at && (
                      <div className="text-[9px] italic opacity-60 mt-0.5">edited</div>
                    )}
                    {mine && m.edited_at && (
                      <div className="text-[9px] italic opacity-60 mt-0.5 text-right">edited</div>
                    )}
                  </>
                )}
                <AttachmentList attachments={(m.attachments ?? []) as ChatAttachment[]} allChatImages={allChatImages} />
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
                onSelect={() => onQuoteReply(m.id, m.body, m.employees?.full_name ?? "User")}
              >
                <MessageSquare className="h-4 w-4" />
                Reply to message
              </ContextMenuItem>
              <ContextMenuItem
                className="gap-2 cursor-pointer"
                onSelect={() => onReply(m.employees?.username ?? null, m.employees?.full_name ?? "User")}
              >
                <MessageSquare className="h-4 w-4" />
                Reply
              </ContextMenuItem>
              <ContextMenuSeparator />
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
                              .eq("employee_id", employeeId)
                              .eq("emoji", emoji)
                              .maybeSingle();
                            if (existing) {
                              await (supabase as any).from("message_reactions").delete().eq("id", existing.id);
                            } else {
                              await (supabase as any).from("message_reactions").insert({ message_id: m.id, employee_id: employeeId, emoji });
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
    </div>
  );
}