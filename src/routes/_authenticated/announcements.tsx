import { createFileRoute } from "@tanstack/react-router";
import { AnnouncementsPage } from "@/components/AnnouncementsPage";

export const Route = createFileRoute("/_authenticated/announcements")({
  head: () => ({ meta: [{ title: "Announcements — JD Connect" }] }),
  component: AnnouncementsPage,
});
