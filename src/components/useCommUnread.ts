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
    // Realtime subscription below handles live updates — this is just a safety-net poll
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      if (!empId) return { dm: 0, channels: 0, announcements: 0, total: 0 };

      // Single server-side RPC replaces the previous 2000-row client-side message scan.
      // The get_unread_counts() SQL function does all counting with indexed JOINs on the DB.
      const { data: counts, error } = await supabase.rpc("get_unread_counts", {
        _employee_id: empId,
      });

      if (error) {
        console.error("get_unread_counts RPC failed:", error);
        return { dm: 0, channels: 0, announcements: 0, total: 0 };
      }

      const c = counts as { dm: number; channels: number; announcements: number } | null;
      const dm = c?.dm ?? 0;
      const channels = c?.channels ?? 0;
      const announcements = c?.announcements ?? 0;
      return { dm, channels, announcements, total: dm + channels + announcements };
    },
  });

  // Realtime subscriptions keep the count fresh without polling the DB
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
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.error("useCommUnread subscription error for channel");
        }
      });
    return () => { supabase.removeChannel(ch); };
  }, [empId, qc]);

  return data;
}
