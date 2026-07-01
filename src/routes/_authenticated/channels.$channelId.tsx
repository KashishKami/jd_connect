import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { ChannelsPage } from "./channels";

const searchSchema = z.object({
  messageId: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/channels/$channelId")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({ meta: [{ title: "Channels — JD Connect" }] }),
  component: RouteComponent,
});

function RouteComponent() {
  const { channelId } = Route.useParams();
  const { messageId } = Route.useSearch();
  return <ChannelsPage initialChannelId={channelId} initialMessageId={messageId} />;
}