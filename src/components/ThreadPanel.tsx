import { formatDate, formatDateTime } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { X, Send } from "lucide-react";
import { MessageReactions } from "@/components/MessageReactions";
import { AttachmentList, type ChatAttachment } from "@/components/ChatAttachments";
import { renderMessageBody } from "@/components/MentionInput";
import { toast } from "sonner";

type ReplyMsg = {
  id: string;
  body: string;
  sender_id: string;
  created_at: string;
  attachments: ChatAttachment[] | null;
  employees: { full_name: string } | null;
};

export function ThreadPanel({ parentId, channelId, onClose }: { parentId: string; channelId: string; onClose: () => void }) {
  const { employee } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: parent } = useQuery({
    queryKey: ["thread-parent", parentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, body, sender_id, created_at, attachments, employees!messages_sender_id_fkey(full_name)")
        .eq("id", parentId).maybeSingle();
      if (error) throw error;
      return data as unknown as ReplyMsg | null;
    },
  });

  const { data: replies = [] } = useQuery({
    queryKey: ["thread-replies", parentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, body, sender_id, created_at, attachments, employees!messages_sender_id_fkey(full_name)")
        .eq("parent_message_id", parentId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ReplyMsg[];
    },
  });

  useEffect(() => {
    const ch = supabase.channel(`thread-${parentId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `parent_message_id=eq.${parentId}` }, () => {
        qc.invalidateQueries({ queryKey: ["thread-replies", parentId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [parentId, qc]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [replies.length]);

  const send = async () => {
    const text = body.trim();
    if (!text || !employee?.id) return;
    setBody("");
    const { error } = await supabase.from("messages").insert({
      channel_id: channelId,
      sender_id: employee.id,
      body: text,
      parent_message_id: parentId,
    });
    if (error) { toast.error(error.message); setBody(text); }
  };

  return (
    <div className="w-80 border-l bg-background flex flex-col h-full">
      <div className="flex items-center justify-between border-b p-3">
        <div className="text-sm font-semibold">Thread · {replies.length} {replies.length === 1 ? "reply" : "replies"}</div>
        <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto p-3 space-y-3">
        {parent && <MessageRow m={parent} />}
        {replies.length > 0 && <div className="border-b text-[10px] text-muted-foreground uppercase tracking-wider py-1">Replies</div>}
        {replies.map((m) => <MessageRow key={m.id} m={m} />)}
      </div>
      <div className="border-t p-2 space-y-2">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Reply…" rows={2} maxLength={4000}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <div className="flex justify-end">
          <Button size="sm" onClick={send} disabled={!body.trim()}><Send className="h-3 w-3 mr-1" />Reply</Button>
        </div>
      </div>
    </div>
  );
}

function MessageRow({ m }: { m: ReplyMsg }) {
  return (
    <div className="text-sm group">
      <div className="flex items-baseline gap-2">
        <span className="font-medium">{m.employees?.full_name ?? "—"}</span>
        <span className="text-[10px] text-muted-foreground">{formatDateTime(m.created_at)}</span>
      </div>
      <div className="whitespace-pre-wrap">{renderMessageBody(m.body)}</div>
      <AttachmentList attachments={(m.attachments ?? []) as ChatAttachment[]} />
      <MessageReactions messageId={m.id} />
    </div>
  );
}