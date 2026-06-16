import { createFileRoute } from "@tanstack/react-router";
import { ChatPage } from "./chat";

export const Route = createFileRoute("/_authenticated/chat/")({
  head: () => ({ meta: [{ title: "Messages — JD Connect" }] }),
  component: ChatPage,
});