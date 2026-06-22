import { useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Hash, MessageSquare, X } from "lucide-react";
// Tauri notification plugin is optional (desktop only). Load dynamically
// so the web build doesn't fail when the package isn't installed.


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
  return n
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
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
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_participants",
          filter: `employee_id=eq.${employee.id}`,
        },
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

  // Request browser/Tauri notification permission on mount
  useEffect(() => {
    const requestPerms = async () => {
      const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
      if (isTauri) {
        try {
          const { requestPermission, isPermissionGranted } = await import("@tauri-apps/plugin-notification");
          let hasPerm = await isPermissionGranted();
          if (!hasPerm) {
            await requestPermission();
          }
        } catch (err) {
          console.error("Failed to request Tauri notification permission", err);
        }
      } else if (typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "default") {
          void Notification.requestPermission();
        }
      }
    };
    void requestPerms();
  }, []);

  // Listen for native Tauri notification clicks
  useEffect(() => {
    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (!isTauri) return;

    let active = true;
    let cleanup: (() => void) | undefined;

    const setup = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const { onAction } = await import("@tauri-apps/plugin-notification");
        if (!active) return;

        // Listener for Windows (triggered by custom Rust command wait_for_response)
        const unlistenCustom = await listen(
          "notification-clicked",
          async (event: { payload: { kind: string; target_id: string } }) => {
            const { kind, target_id } = event.payload;
            try {
              const { getCurrentWindow } = await import("@tauri-apps/api/window");
              const win = getCurrentWindow();
              await win.show();
              await win.unminimize();
              await win.setFocus();
            } catch {
              window.focus();
            }
            if (kind === "direct") {
              void navigate({ to: "/chat/$conversationId", params: { conversationId: target_id } });
            } else if (kind === "channel") {
              void navigate({ to: "/channels/$channelId", params: { channelId: target_id } });
            }
          }
        );

        // Listener for macOS (triggered by native Cocoa app delegate via tauri-plugin-notification)
        const actionListener = await onAction(async (event: any) => {
          const extra = event.notification?.extra;
          if (extra) {
            const { kind, targetId } = extra as { kind: string; targetId: string };
            try {
              const { getCurrentWindow } = await import("@tauri-apps/api/window");
              const win = getCurrentWindow();
              await win.show();
              await win.unminimize();
              await win.setFocus();
            } catch {
              window.focus();
            }
            if (kind === "direct") {
              void navigate({ to: "/chat/$conversationId", params: { conversationId: targetId } });
            } else if (kind === "channel") {
              void navigate({ to: "/channels/$channelId", params: { channelId: targetId } });
            }
          }
        });

        if (!active) {
          unlistenCustom();
          void actionListener.unregister();
        } else {
          cleanup = () => {
            unlistenCustom();
            void actionListener.unregister();
          };
        }
      } catch (err) {
        console.error("Failed to setup Tauri notification click listener", err);
      }
    };
    setup();

    return () => {
      active = false;
      if (cleanup) cleanup();
    };
  }, [navigate]);

  useEffect(() => {
    if (!employee?.id) return;
    const ch = supabase
      .channel("global-messages-" + employee.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async (payload) => {
        const m = payload.new as {
          id: string;
          conversation_id: string | null;
          channel_id: string | null;
          sender_id: string;
          body: string;
          created_at: string;
        };
        if (m.sender_id === employee.id) return;

        const isDirect = !!m.conversation_id;
        const targetId = m.conversation_id ?? m.channel_id;
        if (!targetId) return;
        if (isDirect && !myConvIds.current.has(targetId)) return;
        if (!isDirect && !myChannelIds.current.has(targetId)) return;

        // Suppress notifications ONLY if the chat is open AND the window is focused/visible
        const isPageActive = isDirect
          ? pathname.startsWith(`/chat/${targetId}`)
          : pathname.startsWith(`/channels/${targetId}`);
        const isAppFocused = typeof document !== "undefined" && document.hasFocus() && document.visibilityState === "visible";
        if (isPageActive && isAppFocused) return;

        const { data: sender } = await supabase
          .from("employees")
          .select("full_name, alias_name")
          .eq("id", m.sender_id)
          .maybeSingle();
        let senderName = (sender?.alias_name || sender?.full_name) ?? null;
        if (!senderName) {
          const { data: pub } = await supabase.rpc("get_employee_public_profile", { _id: m.sender_id });
          const row = Array.isArray(pub) ? pub[0] : pub;
          const r = row as { full_name?: string; alias_name?: string | null } | null;
          senderName = (r?.alias_name || r?.full_name) ?? "Someone";
        }
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

         void qc.invalidateQueries({ queryKey: ["notifications"] });
        void qc.invalidateQueries({ queryKey: ["comm-unread"] });
        if (incoming.kind === "direct") {
          void qc.invalidateQueries({ queryKey: ["messages", incoming.targetId] });
          void qc.invalidateQueries({ queryKey: ["conversations"] });
          void qc.invalidateQueries({ queryKey: ["chat-message-meta"] });
        } else {
          void qc.invalidateQueries({ queryKey: ["ch-messages", incoming.targetId] });
          void qc.invalidateQueries({ queryKey: ["channels"] });
        }

        // Trigger browser / Tauri notification
        const showSystemNotification = async () => {
          const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
          if (isTauri) {
            try {
              const isMac = navigator.userAgent.includes("Mac");
              if (isMac) {
                // Use standard tauri-plugin-notification on macOS for native app identity & automatic foreground focus on click
                const { sendNotification } = await import("@tauri-apps/plugin-notification");
                sendNotification({
                  title: incoming.title,
                  body: incoming.body,
                  extra: {
                    kind: incoming.kind,
                    targetId: incoming.targetId,
                  },
                });
              } else {
                // Use custom notify-rust native command on Windows to bypass foreground lock rules
                const { invoke } = await import("@tauri-apps/api/core");
                await invoke("send_native_notification", {
                  payload: {
                    title: incoming.title,
                    body: incoming.body,
                    kind: incoming.kind,
                    target_id: incoming.targetId,
                  },
                });
              }
              return;
            } catch (err) {
              console.error("Failed to send native Tauri notification, falling back to browser Notification", err);
            }
          }

          // Fallback to Web Notification API
          if (
            typeof window !== "undefined" &&
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            try {
              const notification = new Notification(incoming.title, {
                body: incoming.body,
              });
              notification.onclick = () => {
                window.focus();
                if (incoming.kind === "direct") {
                  void navigate({ to: "/chat/$conversationId", params: { conversationId: incoming.targetId } });
                } else {
                  void navigate({ to: "/channels/$channelId", params: { channelId: incoming.targetId } });
                }
              };
            } catch (err) {
              console.error("Failed to trigger browser notification", err);
            }
          }
        };
        void showSystemNotification();

        // Floating bottom-right popup (collapse to one per thread, most recent body)
        setPopups((prev) => {
          const without = prev.filter((p) => p.kind !== incoming.kind || p.targetId !== incoming.targetId);
          return [incoming, ...without].slice(0, 3);
        });
        window.setTimeout(() => {
          setPopups((prev) => prev.filter((p) => p.messageId !== incoming.messageId));
        }, 5000);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [employee?.id, pathname, navigate, qc]);

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
            <Avatar className="h-8 w-8">
              <AvatarFallback>
                {p.kind === "channel" ? <Hash className="h-4 w-4" /> : initials(p.senderName)}
              </AvatarFallback>
            </Avatar>
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
