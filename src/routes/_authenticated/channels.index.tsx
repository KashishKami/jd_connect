import { createFileRoute } from "@tanstack/react-router";
import { ChannelsPage } from "./channels";

export const Route = createFileRoute("/_authenticated/channels/")({
  head: () => ({ meta: [{ title: "Channels — JD Connect" }] }),
  component: ChannelsPage,
});