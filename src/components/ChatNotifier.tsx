import { useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Hash, MessageSquare, X } from "lucide-react";
import { toast } from "sonner";

type Incoming = {
  kind: "direct" | "channel";
  targetId: string;
  messageId: string;
  senderId: string;
  senderName: string;
  title: string;
  body: string;
  at: string;
};

function initials(n: string) {
  return n.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
}

/**
 * Global new-message notifier. Mounted once in the authenticated layout.
 * Subscribes to INSERTs on `messages`, plays a soft sound + shows a sonner toast,
 * and stacks bottom-right floating cards for unread chats not currently open.
 */
export function ChatNotifier() {
  const { employee } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [popups, setPopups] = useState<Incoming[]>([]);
  const myConvIds = useRef<Set<string>>(new Set());
  const myChannelIds = useRef<Set<string>>(new Set());
  const channelNames = useRef<Map<string, string>>(new Map());

  // Track which conversations and channels belong to me — used to filter realtime events.
  useEffect(() => {
    if (!employee?.id) return;
    let active = true;
    const load = async () => {
      const [{ data: convs }, { data: channels }] = await Promise.all([
        supabase.from("conversation_participants").select("conversation_id").eq("employee_id", employee.id),
        supabase.from("channel_members").select("channel_id, channels(name)").eq("employee_id", employee.id),
      ]);
      if (!active) return;
      myConvIds.current = new Set((convs ?? []).map((r) => r.conversation_id));
      myChannelIds.current = new Set((channels ?? []).map((r) => r.channel_id));
      channelNames.current = new Map(
        (channels ?? []).map((r) => [
          r.channel_id,
          ((r.channels as { name?: string } | null)?.name ?? "channel") as string,
        ]),
      );
    };
    load();
    const convChannel = supabase
      .channel("my-conv-membership-" + employee.id)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversation_participants", filter: `employee_id=eq.${employee.id}` },
        (payload) => {
          const cid = (payload.new as { conversation_id?: string })?.conversation_id;
          if (cid) myConvIds.current.add(cid);
        },
      )
      .subscribe();
    const membershipChannel = supabase
      .channel("my-channel-membership-" + employee.id)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "channel_members", filter: `employee_id=eq.${employee.id}` },
        async (payload) => {
          const channelId = (payload.new as { channel_id?: string })?.channel_id;
          if (!channelId) return;
          myChannelIds.current.add(channelId);
          const { data } = await supabase.from("channels").select("name").eq("id", channelId).maybeSingle();
          if (data?.name) channelNames.current.set(channelId, data.name);
          void qc.invalidateQueries({ queryKey: ["channels"] });
        },
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(convChannel);
      supabase.removeChannel(membershipChannel);
    };
  }, [employee?.id, qc]);

  useEffect(() => {
    if (!employee?.id) return;
    const ch = supabase
      .channel("global-messages-" + employee.id)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          const m = payload.new as { id: string; conversation_id: string | null; channel_id: string | null; sender_id: string; body: string; created_at: string };
          if (m.sender_id === employee.id) return;

          const isDirect = !!m.conversation_id;
          const targetId = m.conversation_id ?? m.channel_id;
          if (!targetId) return;
          if (isDirect && !myConvIds.current.has(targetId)) return;
          if (!isDirect && !myChannelIds.current.has(targetId)) return;
          if (isDirect && pathname.startsWith(`/chat/${targetId}`)) return;
          if (!isDirect && pathname.startsWith(`/channels/${targetId}`)) return;

          const { data: sender } = await supabase
            .from("employees")
            .select("full_name")
            .eq("id", m.sender_id)
            .maybeSingle();
          const senderName = sender?.full_name ?? "Someone";
          const channelName = !isDirect ? (channelNames.current.get(targetId) ?? "channel") : null;

          const incoming: Incoming = {
            kind: isDirect ? "direct" : "channel",
            targetId,
            messageId: m.id,
            senderId: m.sender_id,
            senderName,
            title: isDirect ? senderName : `#${channelName}`,
            body: m.body,
            at: m.created_at,
          };

          // Toast (top-right) — actionable
          toast(`${incoming.title}: ${m.body.slice(0, 80)}`, {
            action: {
              label: "Open",
              onClick: () => {
                if (incoming.kind === "direct") navigate({ to: "/chat/$conversationId", params: { conversationId: incoming.targetId } });
                else navigate({ to: "/channels/$channelId", params: { channelId: incoming.targetId } });
              },
            },
          });

          if (incoming.kind === "direct") void qc.invalidateQueries({ queryKey: ["messages", incoming.targetId] });
          else {
            void qc.invalidateQueries({ queryKey: ["ch-messages", incoming.targetId] });
            void qc.invalidateQueries({ queryKey: ["channels"] });
          }

          // Floating bottom-right popup (collapse to one per thread, most recent body)
          setPopups((prev) => {
            const without = prev.filter((p) => p.kind !== incoming.kind || p.targetId !== incoming.targetId);
            return [incoming, ...without].slice(0, 3);
          });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [employee?.id, pathname, navigate]);

  if (popups.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
      {popups.map((p) => (
        <Card
          key={`${p.kind}-${p.targetId}`}
          className="p-3 shadow-lg border-primary/30 cursor-pointer hover:bg-muted/40 transition"
          onClick={() => {
            if (p.kind === "direct") navigate({ to: "/chat/$conversationId", params: { conversationId: p.targetId } });
            else navigate({ to: "/channels/$channelId", params: { channelId: p.targetId } });
            setPopups((prev) => prev.filter((x) => x.kind !== p.kind || x.targetId !== p.targetId));
          }}
        >
          <div className="flex items-start gap-2">
            <Avatar className="h-8 w-8"><AvatarFallback>{p.kind === "channel" ? <Hash className="h-4 w-4" /> : initials(p.senderName)}</AvatarFallback></Avatar>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate flex items-center gap-1">
                {p.kind === "channel" ? <Hash className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />} {p.title}
              </div>
              <div className="text-[11px] text-muted-foreground truncate">{p.senderName}</div>
              <div className="text-xs text-muted-foreground line-clamp-2">{p.body}</div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                setPopups((prev) => prev.filter((x) => x.kind !== p.kind || x.targetId !== p.targetId));
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}