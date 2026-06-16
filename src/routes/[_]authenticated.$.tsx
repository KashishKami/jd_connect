import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/$")({
  beforeLoad: ({ location }) => {
    const raw = location.pathname.replace(/^\/_authenticated(?=\/|$)/, "") || "/dashboard";
    // Only allow internal absolute paths (single leading slash, no protocol-relative // or scheme).
    const targetPath = /^\/[^/\\]/.test(raw) ? raw : "/dashboard";
    throw redirect({ href: `${targetPath}${location.searchStr}${location.hash}` });
  },
});