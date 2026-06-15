import { createFileRoute } from "@tanstack/react-router";
import { ChatPage } from "./chat";

export const Route = createFileRoute("/_authenticated/chat/$conversationId")({
  head: () => ({ meta: [{ title: "Messages — JD Connect" }] }),
  component: RouteComponent,
});

function RouteComponent() {
  const { conversationId } = Route.useParams();
  return <ChatPage initialConversationId={conversationId} />;
}