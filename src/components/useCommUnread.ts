import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type CommUnread = { dm: number; channels: number; announcements: number; total: number };

export function useCommUnread(): CommUnread {
  const { employee } = useAuth();
  const qc = useQueryClient();
  const empId = employee?.id;

  const { data = { dm: 0, channels: 0, announcements: 0, total: 0 } as CommUnread } = useQuery<CommUnread>({
    queryKey: ["comm-unread", empId],
    enabled: !!empId,
    refetchInterval: 60_000,
    queryFn: async () => {
      if (!empId) return { dm: 0, channels: 0, announcements: 0, total: 0 };

      // Conversations
      const { data: parts } = await supabase
        .from("conversation_participants")
        .select("conversation_id, last_read_at")
        .eq("employee_id", empId);
      const convIds = (parts ?? []).map((p) => p.conversation_id);
      const lastReadConv = new Map((parts ?? []).map((p) => [p.conversation_id, p.last_read_at]));

      // Channels
      const { data: mems } = await supabase
        .from("channel_members")
        .select("channel_id, last_read_at")
        .eq("employee_id", empId);
      const chanIds = (mems ?? []).map((m) => m.channel_id);
      const lastReadChan = new Map((mems ?? []).map((m) => [m.channel_id, m.last_read_at]));

      const allMessageIds = [...convIds, ...chanIds];
      let dmCount = 0;
      let chanCount = 0;
      if (allMessageIds.length > 0) {
        const q = supabase
          .from("messages")
          .select("conversation_id, channel_id, sender_id, created_at, status")
          .neq("sender_id", empId)
          .order("created_at", { ascending: false })
          .limit(2000);
        if (convIds.length && chanIds.length) {
          q.or(
            `conversation_id.in.(${convIds.join(",")}),channel_id.in.(${chanIds.join(",")})`,
          );
        } else if (convIds.length) {
          q.in("conversation_id", convIds);
        } else {
          q.in("channel_id", chanIds);
        }
        const { data: msgs } = await q;
        (msgs ?? []).forEach((m) => {
          if (m.conversation_id) {
            const r = lastReadConv.get(m.conversation_id);
            const unread = r ? new Date(m.created_at).getTime() > new Date(r).getTime() : m.status !== "read";
            if (unread) dmCount++;
          } else if (m.channel_id) {
            const r = lastReadChan.get(m.channel_id);
            const unread = r ? new Date(m.created_at).getTime() > new Date(r).getTime() : true;
            if (unread) chanCount++;
          }
        });
      }

      // Announcements: count not-yet-acknowledged critical/important since joining
      const { data: anns } = await supabase
        .from("announcements")
        .select("id, requires_ack, created_at, acks:announcement_acknowledgements(employee_id)")
        .order("created_at", { ascending: false })
        .limit(100);
      let annCount = 0;
      (anns ?? []).forEach((a: { id: string; requires_ack: boolean; acks: { employee_id: string }[] }) => {
        if (!a.requires_ack) return;
        const acked = (a.acks ?? []).some((x) => x.employee_id === empId);
        if (!acked) annCount++;
      });

      const total = dmCount + chanCount + annCount;
      return { dm: dmCount, channels: chanCount, announcements: annCount, total };
    },
  });

  useEffect(() => {
    if (!empId) return;
    const ch = supabase
      .channel(`comm-unread-watch-${empId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        qc.invalidateQueries({ queryKey: ["comm-unread", empId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "channel_members" }, () => {
        qc.invalidateQueries({ queryKey: ["comm-unread", empId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_participants" }, () => {
        qc.invalidateQueries({ queryKey: ["comm-unread", empId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "announcement_acknowledgements" }, () => {
        qc.invalidateQueries({ queryKey: ["comm-unread", empId] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "announcements" }, () => {
        qc.invalidateQueries({ queryKey: ["comm-unread", empId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [empId, qc]);

  return data;
}
