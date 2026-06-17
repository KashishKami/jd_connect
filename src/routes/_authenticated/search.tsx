import { formatDate, formatDateTime } from "@/lib/utils";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, MessageSquare, Hash, Users, BookOpen, Megaphone } from "lucide-react";

export const Route = createFileRoute("/_authenticated/search")({
  head: () => ({ meta: [{ title: "Search — JD Connect" }] }),
  component: SearchPage,
});

function SearchPage() {
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");

  const { data, isFetching } = useQuery({
    queryKey: ["global-search", submitted],
    enabled: submitted.length >= 2,
    queryFn: async () => {
      const term = `%${submitted}%`;
      const [msgs, channels, employees, docs, anns] = await Promise.all([
        supabase.from("messages").select("id, body, created_at, channel_id, conversation_id, sender_id").ilike("body", term).order("created_at", { ascending: false }).limit(20),
        supabase.from("channels").select("id, name, description").or(`name.ilike.${term},description.ilike.${term}`).limit(10),
        supabase.rpc("search_employee_directory", { _q: submitted, _limit: 10 }),
        supabase.from("documents").select("id, title, description").or(`title.ilike.${term},description.ilike.${term}`).limit(10),
        supabase.from("announcements").select("id, title, body, priority").or(`title.ilike.${term},body.ilike.${term}`).limit(10),
      ]);
      return {
        messages: msgs.data ?? [],
        channels: channels.data ?? [],
        employees: employees.data ?? [],
        documents: docs.data ?? [],
        announcements: anns.data ?? [],
      };
    },
  });

  const total = data ? data.messages.length + data.channels.length + data.employees.length + data.documents.length + data.announcements.length : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Search</h1>
        <p className="text-sm text-muted-foreground">Search messages, channels, people, documents, and announcements.</p>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); setSubmitted(q.trim()); }} className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" autoFocus />
        <Button type="submit"><Search className="h-4 w-4 mr-2" />Search</Button>
      </form>

      {submitted && (
        <div className="text-xs text-muted-foreground">
          {isFetching ? "Searching…" : `${total} result${total === 1 ? "" : "s"} for "${submitted}"`}
        </div>
      )}

      {data && (
        <div className="space-y-4">
          {data.channels.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Hash className="h-4 w-4" />Channels</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {data.channels.map((c) => (
                  <Link key={c.id} to="/channels/$channelId" params={{ channelId: c.id }} className="block p-2 rounded hover:bg-muted">
                    <div className="font-medium text-sm">#{c.name}</div>
                    {c.description && <div className="text-xs text-muted-foreground line-clamp-1">{c.description}</div>}
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {data.employees.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" />People</CardTitle></CardHeader>
              <CardContent className="space-y-1">
                {data.employees.map((e) => (
                  <Link key={e.id} to="/employees/$id" params={{ id: e.id }} className="block p-2 rounded hover:bg-muted">
                    <div className="text-sm font-medium">{e.full_name} <span className="text-xs text-muted-foreground">· {e.employee_code}</span></div>
                    {e.designation && <div className="text-xs text-muted-foreground">{e.designation}</div>}
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {data.messages.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><MessageSquare className="h-4 w-4" />Messages</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {data.messages.map((m) => (
                  <div key={m.id} className="p-2 rounded hover:bg-muted">
                    <div className="text-xs text-muted-foreground mb-0.5">{formatDateTime(m.created_at)} {m.channel_id ? "· in channel" : "· direct message"}</div>
                    <div className="text-sm line-clamp-2">{m.body}</div>
                    {m.channel_id && (
                      <Link to="/channels/$channelId" params={{ channelId: m.channel_id }} className="text-xs text-primary hover:underline">Open channel →</Link>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {data.documents.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BookOpen className="h-4 w-4" />Knowledge Base</CardTitle></CardHeader>
              <CardContent className="space-y-1">
                {data.documents.map((d) => (
                  <Link key={d.id} to="/knowledge/$id" params={{ id: d.id }} className="block p-2 rounded hover:bg-muted">
                    <div className="text-sm font-medium">{d.title}</div>
                    {d.description && <div className="text-xs text-muted-foreground line-clamp-1">{d.description}</div>}
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {data.announcements.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Megaphone className="h-4 w-4" />Announcements</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {data.announcements.map((a) => (
                  <div key={a.id} className="p-2 rounded hover:bg-muted">
                    <div className="flex items-center gap-2"><span className="text-sm font-medium">{a.title}</span><Badge variant={a.priority === "critical" ? "destructive" : "secondary"}>{a.priority}</Badge></div>
                    <div className="text-xs text-muted-foreground line-clamp-2">{a.body}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {submitted && !isFetching && total === 0 && (
            <div className="text-center py-10 text-muted-foreground text-sm">No results found.</div>
          )}
        </div>
      )}
    </div>
  );
}