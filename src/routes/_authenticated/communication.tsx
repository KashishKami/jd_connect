import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo } from "react";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { ChatPage } from "./chat";
import { ChannelsPage } from "./channels";
import { AnnouncementsPage } from "@/components/AnnouncementsPage";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MessageSquare, Hash, Megaphone } from "lucide-react";
import { useCommUnread } from "@/components/useCommUnread";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  section: fallback(z.enum(["dm", "channels", "announcements"]), "dm").default("dm"),
});

export const Route = createFileRoute("/_authenticated/communication")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({ meta: [{ title: "Communication — JD Connect" }] }),
  component: CommunicationShell,
});

type Section = "dm" | "channels" | "announcements";

function CommunicationShell() {
  const { section } = useSearch({ from: "/_authenticated/communication" });
  const navigate = useNavigate({ from: "/_authenticated/communication" });
  const unread = useCommUnread();

  const items = useMemo(
    () => [
      { key: "dm" as Section, label: "Direct Messages", icon: MessageSquare, count: unread.dm },
      { key: "channels" as Section, label: "Channels", icon: Hash, count: unread.channels },
      { key: "announcements" as Section, label: "Announcements", icon: Megaphone, count: unread.announcements },
    ],
    [unread],
  );

  const setSection = (s: Section) => navigate({ search: { section: s } });

  return (
    <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4 h-[calc(100vh-7rem)]">
      <Card className="flex flex-col p-2 h-fit md:h-full">
        <div className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Communication
        </div>
        <nav className="space-y-1">
          {items.map(({ key, label, icon: Icon, count }) => {
            const active = section === key;
            return (
              <button
                key={key}
                onClick={() => setSection(key)}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm text-left transition-colors",
                  active ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{label}</span>
                {count > 0 && (
                  <Badge
                    variant={active ? "secondary" : "default"}
                    className="h-5 min-w-5 justify-center px-1.5 text-[10px] shrink-0"
                  >
                    {count > 99 ? "99+" : count}
                  </Badge>
                )}
              </button>
            );
          })}
        </nav>
      </Card>

      <div className="min-w-0">
        {section === "dm" && <ChatPage />}
        {section === "channels" && <ChannelsPage />}
        {section === "announcements" && (
          <div className="h-full overflow-auto">
            <AnnouncementsPage />
          </div>
        )}
      </div>
    </div>
  );
}
