import { formatDate, formatDateTime } from "@/lib/utils";
import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, LogOut, User as UserIcon, ChevronDown, CheckCheck } from "lucide-react";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NotificationItem = { id: string; type: string; title: string; body: string | null; link: string | null; is_read: boolean; created_at: string };

export function HeaderActions() {
  const { employee, roles, signOut } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: items = [] } = useQuery({
    queryKey: ["notifications", employee?.id],
    enabled: !!employee?.id,
    refetchInterval: 5 * 60_000,   // Realtime subscription below handles live updates
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, type, title, body, link, is_read, created_at")
        .eq("employee_id", employee!.id)
        .order("created_at", { ascending: false })
        .limit(30);
      return (data ?? []) as NotificationItem[];
    },
  });

  const unread = items.filter((n) => !n.is_read).length;

  useEffect(() => {
    if (!employee?.id) return;
    const ch = supabase
      .channel("notif-header-" + employee.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `employee_id=eq.${employee.id}` }, () => {
        qc.invalidateQueries({ queryKey: ["notifications"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [employee?.id, qc]);

  const markAllRead = async () => {
    if (!employee?.id) return;
    await supabase.from("notifications").update({ is_read: true }).eq("employee_id", employee.id).eq("is_read", false);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };
  const markOneRead = async (n: NotificationItem) => {
    if (n.link?.startsWith("/chat/")) {
      await supabase.rpc("mark_conversation_read", { _conversation_id: n.link.replace("/chat/", "") });
      void qc.invalidateQueries({ queryKey: ["conversations"] });
      void qc.invalidateQueries({ queryKey: ["chat-message-meta"] });
      void qc.invalidateQueries({ queryKey: ["comm-unread"] });
    } else if (n.link?.startsWith("/channels/")) {
      await supabase.rpc("mark_channel_read", { _channel_id: n.link.replace("/channels/", "") });
      void qc.invalidateQueries({ queryKey: ["channels"] });
      void qc.invalidateQueries({ queryKey: ["channel-unread-counts"] });
      void qc.invalidateQueries({ queryKey: ["comm-unread"] });
    } else {
      await supabase.from("notifications").update({ is_read: true }).eq("id", n.id);
      void qc.invalidateQueries({ queryKey: ["comm-unread"] });
    }
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };
  const openNotification = (link: string | null) => {
    if (!link) return;
    if (link.startsWith("/channels/")) {
      void navigate({ to: "/channels/$channelId", params: { channelId: link.replace("/channels/", "") } });
    } else if (link.startsWith("/chat/")) {
      void navigate({ to: "/chat/$conversationId", params: { conversationId: link.replace("/chat/", "") } });
    } else if (link === "/channels") {
      void navigate({ to: "/channels" });
    } else if (link === "/chat") {
      void navigate({ to: "/chat" });
    } else if (link === "/announcements") {
      void navigate({ to: "/announcements" });
    }
  };

  const initials = (employee?.alias_name || employee?.full_name || "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex items-center gap-1.5">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <Badge className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px]">
                {unread > 99 ? "99+" : unread}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[360px] p-0">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <div className="text-sm font-medium">Notifications {unread > 0 && <span className="text-xs text-muted-foreground">({unread} new)</span>}</div>
            {unread > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllRead}>
                <CheckCheck className="h-3 w-3 mr-1" /> Mark all read
              </Button>
            )}
          </div>
          <ScrollArea className="h-[min(380px,calc(100vh-10rem))]">
            {items.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">You're all caught up.</div>
            ) : (
              <ul className="divide-y">
                {items.map((n) => {
                  const content = (
                    <div className="flex items-start gap-2 px-3 py-2.5 hover:bg-secondary/50 transition-colors">
                      <span className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${n.is_read ? "bg-muted" : "bg-primary"}`} />
                      <div className="flex-1 min-w-0">
                        <div className={`text-xs ${n.is_read ? "text-muted-foreground" : "font-medium"}`}>{n.title}</div>
                        {n.body && <div className="text-[11px] text-muted-foreground truncate">{n.body}</div>}
                        <div className="text-[10px] text-muted-foreground/70 mt-0.5">{formatDateTime(n.created_at)}</div>
                      </div>
                    </div>
                  );
                  return (
                    <li key={n.id} onClick={() => { void markOneRead(n); openNotification(n.link); }} className="cursor-pointer">
                      {content}
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2 pl-1.5 pr-2">
            <span className="h-7 w-7 rounded-full bg-primary text-primary-foreground grid place-items-center text-[11px] font-semibold">
              {initials}
            </span>
            <span className="hidden sm:inline text-xs font-medium truncate max-w-[120px]">
              {employee?.alias_name || employee?.full_name || "—"}
            </span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-medium truncate">{employee?.alias_name || employee?.full_name || "—"}</span>
              <span className="text-[11px] text-muted-foreground truncate">
                {employee?.employee_code} · {roles[0]?.replace("_", " ") ?? "—"}
              </span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {employee?.id && (
            <DropdownMenuItem asChild>
              <Link to="/employees/$id" params={{ id: employee.id }} className="cursor-pointer">
                <UserIcon className="h-4 w-4 mr-2" /> My profile
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={signOut} className="cursor-pointer text-destructive focus:text-destructive">
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}