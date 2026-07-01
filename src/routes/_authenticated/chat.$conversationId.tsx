import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { ChatPage } from "./chat";

const searchSchema = z.object({
  messageId: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/chat/$conversationId")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({ meta: [{ title: "Messages — JD Connect" }] }),
  component: RouteComponent,
});

function RouteComponent() {
  const { conversationId } = Route.useParams();
  const { messageId } = Route.useSearch();
  return <ChatPage initialConversationId={conversationId} initialMessageId={messageId} />;
}