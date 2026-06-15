import { createFileRoute } from "@tanstack/react-router";
import { ChannelsPage } from "./channels";

export const Route = createFileRoute("/_authenticated/channels/$channelId")({
  head: () => ({ meta: [{ title: "Channels — JD Connect" }] }),
  component: RouteComponent,
});

function RouteComponent() {
  const { channelId } = Route.useParams();
  return <ChannelsPage initialChannelId={channelId} />;
}