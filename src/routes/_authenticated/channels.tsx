import { formatDate, formatDateTime } from "@/lib/utils";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Hash,
  Plus,
  Send,
  Archive,
  Pin,
  Pencil,
  Trash2,
  UserPlus,
  Inbox,
  Check,
  X,
  Lock,
  Users,
  MessageSquare,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { MentionInput, renderMessageBody } from "@/components/MentionInput";
import { MessageReactions } from "@/components/MessageReactions";
import { AttachmentPicker, AttachmentList, type ChatAttachment } from "@/components/ChatAttachments";
import { ThreadPanel } from "@/components/ThreadPanel";

export const Route = createFileRoute("/_authenticated/channels")({
  head: () => ({ meta: [{ title: "Channels — JD Connect" }] }),
  component: () => <Outlet />,
});

type Channel = {
  id: string;
  name: string;
  description: string | null;
  channel_type: "department" | "team" | "custom" | "announcement";
  is_archived: boolean;
  last_message_at: string | null;
  members: { employee_id: string; last_read_at: string | null }[];
};

type Msg = {
  id: string;
  body: string;
  sender_id: string;
  created_at: string;
  is_pinned: boolean;
  attachments?: ChatAttachment[] | null;
  parent_message_id?: string | null;
  reply_count?: number;
};

type JoinRequest = {
  id: string;
  channel_id: string;
  employee_id: string;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
};

export function ChannelsPage({ initialChannelId }: { initialChannelId?: string } = {}) {
  const { employee, hasRole, isAdmin, refresh } = useAuth();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState<string | null>(initialChannelId ?? null);
  const canCreate = isAdmin || hasRole("manager") || can("channels.create");
  const canManage = isAdmin || hasRole("manager") || can("channels.members_manage");

  useEffect(() => {
    if (initialChannelId) setActiveId(initialChannelId);
  }, [initialChannelId]);

  // Refresh roles on mount so a user just promoted to admin sees full
  // channel visibility without re-logging in.
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: channels = [] } = useQuery({
    queryKey: ["channels", employee?.id],
    enabled: !!employee?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channels")
        .select(
          "id, name, description, channel_type, is_archived, last_message_at, members:channel_members(employee_id, last_read_at)",
        )
        .order("is_archived", { ascending: true })
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Channel[];
    },
  });

  const channelIds = channels.map((c) => c.id).sort();
  const { data: channelUnreadCounts = {} } = useQuery<Record<string, number>>({
    queryKey: [
      "channel-unread-counts",
      employee?.id,
      channelIds.join(","),
      channels.map((c) => c.members.find((m) => m.employee_id === employee?.id)?.last_read_at ?? "").join(","),
    ],
    enabled: !!employee?.id && channelIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("channel_id, sender_id, created_at")
        .in("channel_id", channelIds)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const lastReadByChannel = new Map(
        channels.map((c) => [c.id, c.members.find((m) => m.employee_id === employee?.id)?.last_read_at ?? null]),
      );
      const counts: Record<string, number> = {};
      (data ?? []).forEach((m) => {
        if (!m.channel_id || m.sender_id === employee?.id) return;
        const lastReadAt = lastReadByChannel.get(m.channel_id);
        if (!lastReadAt || new Date(m.created_at).getTime() > new Date(lastReadAt).getTime()) {
          counts[m.channel_id] = (counts[m.channel_id] ?? 0) + 1;
        }
      });
      return counts;
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["channels"] });
    qc.invalidateQueries({ queryKey: ["channel-pending-requests"] });
  };

  const openChannel = (id: string) => {
    setActiveId(id);
    void navigate({ to: "/channels/$channelId", params: { channelId: id } });
  };

  const archive = async (c: Channel) => {
    const { error } = await supabase.from("channels").update({ is_archived: !c.is_archived }).eq("id", c.id);
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

  const myChannels = channels.filter((c) => c.members.some((m) => m.employee_id === employee?.id));
  const otherChannels = isAdmin
    ? channels.filter((c) => !c.members.some((m) => m.employee_id === employee?.id))
    : [];

  const renderChannelRow = (c: Channel) => {
    const unreadCount = channelUnreadCounts[c.id] ?? 0;
    return (
      <div
        key={c.id}
        className={`flex items-center gap-1 border-b ${activeId === c.id ? "bg-muted" : "hover:bg-muted/50"}`}
      >
        <button
          onClick={() => openChannel(c.id)}
          className="flex-1 flex items-center gap-2 p-3 text-left min-w-0"
        >
          <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
          <span
            className={`flex-1 truncate text-sm min-w-0 ${unreadCount ? "font-semibold" : ""} ${c.is_archived ? "text-muted-foreground line-through" : ""}`}
            title={c.name}
          >
            {c.name}
          </span>
          {unreadCount > 0 && (
            <Badge className="h-5 min-w-5 justify-center px-1.5 text-[10px] shrink-0">
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
          <Badge variant="secondary" className="text-[10px] shrink-0">
            {c.channel_type}
          </Badge>
        </button>
        {canManage && (
          <div className="flex items-center pr-1 gap-0.5">
            <EditChannelDialog channel={c} onSaved={invalidate} />
            <ManageMembersDialog channel={c} onChanged={invalidate} />
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              title={c.is_archived ? "Restore" : "Archive"}
              onClick={() => archive(c)}
            >
              <Archive className="h-3.5 w-3.5" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  title="Delete"
                >
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
                    onClick={() => remove(c)}
                    className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-[380px_1fr] gap-4 h-[calc(100vh-8rem)]">
      <Card className="flex flex-col">
        <div className="p-3 border-b flex items-center justify-between">
          <h2 className="font-semibold">Channels</h2>
          <div className="flex items-center gap-1">
            {canManage && <ManageJoinRequestsDialog />}
            {canCreate && <CreateChannelDialog onCreated={invalidate} />}
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {myChannels.length > 0 && (
            <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">My channels</div>
          )}
          {myChannels.map(renderChannelRow)}
          {myChannels.length === 0 && otherChannels.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">You're not in any channels yet. An admin can add you.</p>
          )}
          {isAdmin && otherChannels.length > 0 && (
            <>
              <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                All channels (admin)
              </div>
              {otherChannels.map(renderChannelRow)}
            </>
          )}
        </div>
      </Card>
      <Card className="flex flex-col overflow-hidden">
        {activeId ? (
          <ChannelThread channelId={activeId} />
        ) : (
          <div className="flex-1 grid place-items-center text-muted-foreground text-sm">Select a channel</div>
        )}
      </Card>
    </div>
  );
}

function ChannelThread({ channelId }: { channelId: string }) {
  const { employee, isAdmin, hasRole } = useAuth();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [threadParentId, setThreadParentId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canModerate = isAdmin || hasRole("manager") || hasRole("team_leader") || can("channels.moderate");

  // Membership check (drives whether messages render or a "request to join" panel)
  const { data: membership, isLoading: isMembershipLoading } = useQuery({
    queryKey: ["ch-membership", channelId, employee?.id],
    enabled: !!employee?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("channel_members")
        .select("employee_id")
        .eq("channel_id", channelId)
        .eq("employee_id", employee!.id)
        .maybeSingle();
      return !!data;
    },
  });

  const { data: channelMeta } = useQuery({
    queryKey: ["ch-meta", channelId],
    queryFn: async () => {
      const { data } = await supabase.from("channels").select("name, description, channel_type").eq("id", channelId).maybeSingle();
      return data;
    },
  });

  const { data: messages = [], isLoading: isMessagesLoading } = useQuery({
    queryKey: ["ch-messages", channelId],
    enabled: membership === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, body, sender_id, created_at, is_pinned, attachments, parent_message_id")
        .eq("channel_id", channelId)
        .is("parent_message_id", null)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Msg[];
    },
  });

  const isThreadLoading = isMembershipLoading || (membership === true && isMessagesLoading);

  const senderIds = Array.from(new Set(messages.map((m) => m.sender_id))).sort();
  const { data: senders = {} } = useQuery({
    queryKey: ["ch-senders", channelId, senderIds.join(",")],
    enabled: senderIds.length > 0,
    queryFn: async () => {
      const map: Record<string, string> = {};
      const { data } = await supabase.from("employees").select("id, full_name, alias_name").in("id", senderIds);
      (data ?? []).forEach((e: { id: string; full_name: string; alias_name: string | null }) => {
        map[e.id] = e.alias_name || e.full_name;
      });

      const missingIds = senderIds.filter((id) => !map[id]);
      const publicProfiles = await Promise.all(
        missingIds.map((id) => supabase.rpc("get_employee_public_profile", { _id: id })),
      );
      publicProfiles.forEach((result, index) => {
        const row = Array.isArray(result.data) ? result.data[0] : result.data;
        if (row?.full_name || row?.alias_name)
          map[missingIds[index]] =
            (row as { full_name?: string; alias_name?: string | null }).alias_name || row.full_name!;
      });

      return map;
    },
  });

  useEffect(() => {
    if (membership !== true) return;
    const ch = supabase
      .channel("chan-" + channelId)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["ch-messages", channelId] });
          qc.invalidateQueries({ queryKey: ["channel-unread-counts"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [channelId, qc, membership]);

  useEffect(() => {
    if (!employee?.id || membership !== true) return;

    const markRead = async () => {
      const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
      let isAppFocused = typeof document !== "undefined" && document.hasFocus() && document.visibilityState === "visible";
      
      if (isTauri) {
        try {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          const win = getCurrentWindow();
          const [focused, minimized] = await Promise.all([win.isFocused(), win.isMinimized()]);
          isAppFocused = focused && !minimized;
        } catch {}
      }

      if (isAppFocused) {
        void supabase.rpc("mark_channel_read", { _channel_id: channelId }).then(() => {
          void qc.invalidateQueries({ queryKey: ["notifications"] });
          void qc.invalidateQueries({ queryKey: ["channels"] });
          void qc.invalidateQueries({ queryKey: ["channel-unread-counts"] });
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
  }, [channelId, employee?.id, messages.length, qc, membership]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const send = async () => {
    const text = body.trim();
    if ((!text && attachments.length === 0) || !employee?.id || membership !== true) return;
    setBody("");
    const atts = attachments;
    setAttachments([]);
    const { error } = await supabase
      .from("messages")
      .insert({ channel_id: channelId, sender_id: employee.id, body: text, attachments: atts });
    if (error) {
      toast.error(error.message);
      setBody(text);
      setAttachments(atts);
    }
  };

  const togglePin = async (m: Msg) => {
    const { error } = await supabase.from("messages").update({ is_pinned: !m.is_pinned }).eq("id", m.id);
    if (error) toast.error(error.message);
  };

  if (membership === false) {
    return (
      <div className="flex-1 grid place-items-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="mx-auto h-12 w-12 rounded-full bg-muted grid place-items-center">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <div className="font-semibold">#{channelMeta?.name ?? "channel"}</div>
            {channelMeta?.description && (
              <p className="text-sm text-muted-foreground mt-1">{channelMeta.description}</p>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            You're not a member of this channel. An admin can add you if you need access.
          </p>
        </div>
      </div>
    );
  }

  const pinned = messages.filter((m) => m.is_pinned);

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Static header bar at the top */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-card text-card-foreground shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-full bg-primary/10 text-primary grid place-items-center shrink-0 border border-primary/20">
              <Hash className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">#{channelMeta?.name ?? "Loading..."}</div>
              {channelMeta?.description && (
                <div className="text-xs text-muted-foreground truncate">{channelMeta.description}</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ChannelDetailsDialog
              channelId={channelId}
              name={channelMeta?.name ?? ""}
              description={channelMeta?.description ?? ""}
              channelType={channelMeta?.channel_type}
            />
          </div>
        </div>

        {pinned.length > 0 && (
          <div className="border-b bg-muted/30 p-2 text-xs space-y-1">
            {pinned.map((m) => (
              <div key={m.id} className="flex items-center gap-1">
                <Pin className="h-3 w-3" /> {m.body.slice(0, 120)}
              </div>
            ))}
          </div>
        )}
        <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-4 bg-[#eef2f6] dark:bg-[#0b0f17]">
          {messages.map((m) => {
            const mine = m.sender_id === employee?.id;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className="flex flex-col max-w-[75%]">
                  {!mine && (
                    <div className="text-[11px] text-muted-foreground mb-1 px-1 flex items-center gap-2">
                      <span className="font-semibold text-foreground/80">{(senders as Record<string, string>)[m.sender_id] ?? "—"}</span>
                      <span>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  )}
                  {mine && (
                    <div className="text-[11px] text-muted-foreground mb-1 px-1 flex items-center justify-end gap-2">
                      <span>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  )}
                  
                  <div className={`group relative rounded-2xl py-2 px-3 text-sm shadow-sm border ${
                    mine
                      ? "bg-primary text-primary-foreground border-primary/20 rounded-tr-none"
                      : "bg-card text-card-foreground border-border/50 rounded-tl-none"
                  }`}>
                    <div className="leading-relaxed break-words">{renderMessageBody(m.body)}</div>
                    <AttachmentList attachments={(m.attachments ?? []) as ChatAttachment[]} />
                    <MessageReactions messageId={m.id} />
                    
                    {/* Hover Actions Bar */}
                    <div className={`absolute top-0 -translate-y-1/2 flex items-center gap-1.5 bg-background border shadow-sm px-1.5 py-0.5 rounded-full z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-150 ${
                      mine ? "left-2" : "right-2"
                    }`}>
                      {(mine || canModerate) && (
                        <>
                          <button
                            onClick={() => togglePin(m)}
                            className="text-[10px] text-muted-foreground hover:text-foreground font-medium cursor-pointer"
                          >
                            {m.is_pinned ? "Unpin" : "Pin"}
                          </button>
                          <span className="text-muted-foreground/30 text-[10px]">|</span>
                        </>
                      )}
                      <button
                        onClick={() => setThreadParentId(m.id)}
                        className="text-[10px] text-muted-foreground hover:text-foreground font-medium inline-flex items-center gap-0.5 cursor-pointer"
                      >
                        <MessageSquare className="h-3 w-3" />
                        Reply
                      </button>
                    </div>

                    {m.is_pinned && (
                      <div className={`absolute -bottom-1.5 ${mine ? "-left-1.5" : "-right-1.5"} bg-background border rounded-full p-0.5 shadow-sm`}>
                        <Pin className="h-3 w-3 text-primary fill-primary" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {!isThreadLoading && messages.length === 0 && <p className="text-center text-sm text-muted-foreground py-10">No messages yet.</p>}
        </div>
        <div className="border-t p-3 space-y-2 bg-card shadow-inner">
          {attachments.length > 0 && (
            <div className="px-1">
              <AttachmentList attachments={attachments} />
            </div>
          )}
          <div className="flex gap-2 items-end">
            <AttachmentPicker
              value={attachments}
              onChange={setAttachments}
              scope={{ kind: "channel", id: channelId }}
            />
            <MentionInput
              value={body}
              onChange={setBody}
              onSubmit={send}
              placeholder="Message channel… use @ to mention"
              maxLength={4000}
            />
            <Button onClick={send} disabled={!body.trim() && attachments.length === 0}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      {threadParentId && (
        <ThreadPanel parentId={threadParentId} channelId={channelId} onClose={() => setThreadParentId(null)} />
      )}
    </div>
  );
}

function ChannelDetailsDialog({ channelId, name, description, channelType }: { channelId: string; name: string; description: string; channelType?: string }) {
  const [open, setOpen] = useState(false);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["channel-members-details", channelId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channel_members")
        .select("employee_id, is_moderator")
        .eq("channel_id", channelId);
      if (error) throw error;
      return (data ?? []) as { employee_id: string; is_moderator: boolean }[];
    },
  });

  const memberIds = members.map((m) => m.employee_id);

  const { data: memberNames = {} } = useQuery({
    queryKey: ["channel-details-member-names", channelId, memberIds.sort().join(",")],
    enabled: open && memberIds.length > 0,
    queryFn: async () => {
      const map: Record<string, string> = {};
      const { data } = await supabase.from("employees").select("id, full_name, alias_name").in("id", memberIds);
      (data ?? []).forEach((e: { id: string; full_name: string; alias_name: string | null }) => {
        map[e.id] = e.alias_name || e.full_name;
      });
      const missing = memberIds.filter((id) => !map[id]);
      const fetched = await Promise.all(missing.map((id) => supabase.rpc("get_employee_public_profile", { _id: id })));
      fetched.forEach((r, i) => {
        const row = Array.isArray(r.data) ? r.data[0] : r.data;
        if (row?.full_name || row?.alias_name)
          map[missing[i]] = (row as { full_name?: string; alias_name?: string | null }).alias_name || row.full_name!;
      });
      return map;
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-8">
          <Info className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">View Details</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Hash className="h-5 w-5 text-primary shrink-0" />
            {name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {description && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Description</Label>
              <p className="text-sm bg-muted/30 p-2.5 rounded-md border text-card-foreground leading-relaxed break-words">{description}</p>
            </div>
          )}
          {channelType && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Channel Type</Label>
              <div>
                <Badge variant="secondary" className="capitalize">
                  {channelType}
                </Badge>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              Members ({members.length})
            </Label>
            <div className="max-h-48 overflow-auto border rounded-md divide-y bg-background">
              {isLoading && <p className="p-3 text-xs text-muted-foreground text-center">Loading members…</p>}
              {!isLoading && members.length === 0 && (
                <p className="p-3 text-xs text-muted-foreground text-center">No members found.</p>
              )}
              {!isLoading && members.map((m) => (
                <div key={m.employee_id} className="flex items-center gap-2 p-2.5 hover:bg-muted/30">
                  <div className="text-sm font-medium truncate flex-1">
                    {(memberNames as Record<string, string>)[m.employee_id] ?? m.employee_id}
                  </div>
                  {m.is_moderator && (
                    <Badge variant="secondary" className="text-[10px] scale-90 select-none">
                      Moderator
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="sm:justify-end pt-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="w-full sm:w-auto">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    const { data, error } = await supabase
      .from("channels")
      .insert({
        name: name.trim().replace(/\s+/g, "-"),
        description: description.trim() || null,
        channel_type: type,
        created_by: employee.id,
      })
      .select()
      .single();
    if (error || !data) {
      toast.error(error?.message ?? "Failed");
      return;
    }
    await supabase
      .from("channel_members")
      .insert({ channel_id: data.id, employee_id: employee.id, is_moderator: true });
    toast.success("Channel created");
    setOpen(false);
    setName("");
    setDescription("");
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create channel</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={64} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={300} />
          </div>
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as "custom" | "team")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom</SelectItem>
                <SelectItem value="team">Team</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={create}>Create</Button>
        </DialogFooter>
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
        <DialogHeader>
          <DialogTitle>Edit channel</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={64} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={300} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManageJoinRequestsDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["channel-pending-requests"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channel_join_requests")
        .select("id, channel_id, employee_id, status, requested_at")
        .eq("status", "pending")
        .order("requested_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as JoinRequest[];
    },
  });

  const channelIds = Array.from(new Set(requests.map((r) => r.channel_id)));
  const employeeIds = Array.from(new Set(requests.map((r) => r.employee_id)));

  const { data: channelNames = {} } = useQuery({
    queryKey: ["channel-names", channelIds.sort().join(",")],
    enabled: channelIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("channels").select("id, name").in("id", channelIds);
      const map: Record<string, string> = {};
      (data ?? []).forEach((c: { id: string; name: string }) => {
        map[c.id] = c.name;
      });
      return map;
    },
  });

  const { data: employeeNames = {} } = useQuery({
    queryKey: ["employee-names", employeeIds.sort().join(",")],
    enabled: employeeIds.length > 0,
    queryFn: async () => {
      const map: Record<string, string> = {};
      const { data } = await supabase.from("employees").select("id, full_name, alias_name").in("id", employeeIds);
      (data ?? []).forEach((e: { id: string; full_name: string; alias_name: string | null }) => {
        map[e.id] = e.alias_name || e.full_name;
      });
      const missing = employeeIds.filter((id) => !map[id]);
      const fetched = await Promise.all(missing.map((id) => supabase.rpc("get_employee_public_profile", { _id: id })));
      fetched.forEach((r, i) => {
        const row = Array.isArray(r.data) ? r.data[0] : r.data;
        if (row?.full_name || row?.alias_name)
          map[missing[i]] = (row as { full_name?: string; alias_name?: string | null }).alias_name || row.full_name!;
      });
      return map;
    },
  });

  const decide = async (id: string, action: "approve" | "reject") => {
    const fn = action === "approve" ? "approve_channel_join_request" : "reject_channel_join_request";
    const { error } = await supabase.rpc(fn, { _id: id });
    if (error) return toast.error(error.message);
    toast.success(action === "approve" ? "Member added" : "Request rejected");
    qc.invalidateQueries({ queryKey: ["channel-pending-requests"] });
    qc.invalidateQueries({ queryKey: ["channels"] });
    qc.invalidateQueries({ queryKey: ["my-channel-join-requests"] });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title="Join requests">
          <Inbox className="h-4 w-4" />
          {requests.length > 0 && open && <Badge className="ml-1 h-4 px-1 text-[10px]">{requests.length}</Badge>}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Channel join requests</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto divide-y">
          {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && requests.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No pending requests.</p>
          )}
          {requests.map((r) => (
            <div key={r.id} className="flex items-center gap-2 py-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">
                  {(employeeNames as Record<string, string>)[r.employee_id] ?? "Someone"}
                  <span className="text-muted-foreground"> → </span>
                  <span className="font-medium">
                    #{(channelNames as Record<string, string>)[r.channel_id] ?? "channel"}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground">{formatDateTime(r.requested_at)}</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => decide(r.id, "reject")}>
                <X className="h-3.5 w-3.5 mr-1" /> Reject
              </Button>
              <Button size="sm" onClick={() => decide(r.id, "approve")}>
                <Check className="h-3.5 w-3.5 mr-1" /> Approve
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ManageMembersDialog({ channel, onChanged }: { channel: Channel; onChanged: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: members = [] } = useQuery({
    queryKey: ["channel-members-manage", channel.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channel_members")
        .select("employee_id, is_moderator")
        .eq("channel_id", channel.id);
      if (error) throw error;
      return (data ?? []) as { employee_id: string; is_moderator: boolean }[];
    },
  });

  const memberIds = members.map((m) => m.employee_id);

  const { data: memberProfiles = [] } = useQuery({
    queryKey: ["channel-members-profiles", channel.id, memberIds.sort().join(",")],
    enabled: open && memberIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("employees").select("id, full_name, alias_name").in("id", memberIds);
      return (data ?? []) as { id: string; full_name: string; alias_name: string | null }[];
    },
  });
  const nameById = new Map(memberProfiles.map((e) => [e.id, e.alias_name || e.full_name]));

  const { data: allEmployees = [] } = useQuery({
    queryKey: ["all-employees-min"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("employees").select("id, full_name, alias_name").order("full_name");
      return (data ?? []) as { id: string; full_name: string; alias_name: string | null }[];
    },
  });

  const memberSet = new Set(memberIds);
  const candidates = allEmployees.filter(
    (e) =>
      !memberSet.has(e.id) &&
      ((e.alias_name || e.full_name).toLowerCase().includes(search.toLowerCase()) ||
        e.full_name.toLowerCase().includes(search.toLowerCase())),
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["channel-members-manage", channel.id] });
    qc.invalidateQueries({ queryKey: ["channels"] });
    onChanged();
  };

  const add = async (employeeId: string) => {
    const { error } = await supabase
      .from("channel_members")
      .insert({ channel_id: channel.id, employee_id: employeeId });
    if (error) return toast.error(error.message);
    toast.success("Member added");
    invalidate();
  };

  const remove = async (employeeId: string) => {
    const { error } = await supabase
      .from("channel_members")
      .delete()
      .eq("channel_id", channel.id)
      .eq("employee_id", employeeId);
    if (error) return toast.error(error.message);
    toast.success("Member removed");
    invalidate();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-7 w-7" title="Members">
          <Users className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Members of #{channel.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Current members ({members.length})
            </Label>
            <div className="max-h-48 overflow-auto divide-y border rounded mt-1">
              {members.length === 0 && <p className="p-3 text-sm text-muted-foreground">No members yet.</p>}
              {members.map((m) => (
                <div key={m.employee_id} className="flex items-center gap-2 p-2">
                  <div className="flex-1 text-sm truncate">
                    {nameById.get(m.employee_id) ?? m.employee_id}
                    {m.is_moderator && (
                      <Badge variant="secondary" className="ml-2 text-[10px]">
                        mod
                      </Badge>
                    )}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => remove(m.employee_id)}>
                    <X className="h-3.5 w-3.5 mr-1" /> Remove
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Add member</Label>
            <Input
              placeholder="Search employees…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mt-1"
            />
            <div className="max-h-48 overflow-auto divide-y border rounded mt-2">
              {candidates.length === 0 && <p className="p-3 text-sm text-muted-foreground">No matching employees.</p>}
              {candidates.slice(0, 50).map((e) => (
                <div key={e.id} className="flex items-center gap-2 p-2">
                  <div className="flex-1 text-sm truncate">{e.alias_name || e.full_name}</div>
                  <Button size="sm" onClick={() => add(e.id)}>
                    <UserPlus className="h-3.5 w-3.5 mr-1" /> Add
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
