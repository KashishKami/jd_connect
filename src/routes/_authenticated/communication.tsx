import { createFileRoute, useSearch } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { ChatPage } from "./chat";
import { ChannelsPage } from "./channels";
import { AnnouncementsPage } from "@/components/AnnouncementsPage";

const searchSchema = z.object({
  section: fallback(z.enum(["dm", "channels", "announcements"]), "dm").default("dm"),
});

export const Route = createFileRoute("/_authenticated/communication")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({ meta: [{ title: "Communication — JD Connect" }] }),
  component: CommunicationShell,
});

function CommunicationShell() {
  const { section } = useSearch({ from: "/_authenticated/communication" });

  return (
    <div className="h-[calc(100vh-7rem)] min-w-0">
      {section === "dm" && <ChatPage />}
      {section === "channels" && <ChannelsPage />}
      {section === "announcements" && (
        <div className="h-full overflow-auto">
          <AnnouncementsPage />
        </div>
      )}
    </div>
  );
}
