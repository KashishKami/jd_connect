import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export type PresenceStatus = "online" | "away" | "busy" | "offline" | "on_break";

type PresenceRow = { employee_id: string; status: string | null; last_seen_at: string | null };
type BreakRow = { employee_id: string };

type PresenceMap = Record<string, PresenceStatus>;

const STALE_MS = 5 * 60 * 1000;

export function usePresenceMap() {
  const qc = useQueryClient();

  const { data = {} as PresenceMap } = useQuery<PresenceMap>({
    queryKey: ["presence-map"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const [pres, brks] = await Promise.all([
        supabase.from("employee_presence").select("employee_id, status, last_seen_at"),
        supabase.from("break_records").select("employee_id").eq("status", "active"),
      ]);
      const onBreak = new Set<string>(((brks.data ?? []) as BreakRow[]).map((b) => b.employee_id));
      const now = Date.now();
      const map: PresenceMap = {};
      ((pres.data ?? []) as PresenceRow[]).forEach((r) => {
        let s: PresenceStatus = "offline";
        const seen = r.last_seen_at ? new Date(r.last_seen_at).getTime() : 0;
        const stale = !seen || now - seen > STALE_MS;
        if (stale) s = "offline";
        else if (r.status === "busy") s = "busy";
        else if (r.status === "away" || document.hidden) s = "away";
        else if (r.status === "online") s = "online";
        if (onBreak.has(r.employee_id)) s = "on_break";
        map[r.employee_id] = s;
      });
      // Anyone on break but with no presence row
      onBreak.forEach((id) => { if (!map[id]) map[id] = "on_break"; });
      return map;
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`presence-watch-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "employee_presence" }, () => {
        qc.invalidateQueries({ queryKey: ["presence-map"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "break_records" }, () => {
        qc.invalidateQueries({ queryKey: ["presence-map"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  return data;
}

const COLOR: Record<PresenceStatus, string> = {
  online: "bg-emerald-500",
  away: "bg-amber-400",
  busy: "bg-rose-500",
  offline: "bg-muted-foreground/50",
  on_break: "bg-orange-500",
};

const LABEL: Record<PresenceStatus, string> = {
  online: "Online",
  away: "Away",
  busy: "Busy",
  offline: "Offline",
  on_break: "On Break",
};

export function PresenceDot({
  employeeId,
  className,
  showLabel = false,
  size = "sm",
}: {
  employeeId?: string | null;
  className?: string;
  showLabel?: boolean;
  size?: "xs" | "sm" | "md";
}) {
  const map = usePresenceMap();
  if (!employeeId) return null;
  const status: PresenceStatus = map[employeeId] ?? "offline";
  const dim = size === "xs" ? "h-2 w-2" : size === "md" ? "h-3 w-3" : "h-2.5 w-2.5";
  if (showLabel) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-xs", className)} title={LABEL[status]}>
        <span className={cn("inline-block rounded-full ring-2 ring-background", dim, COLOR[status])} />
        <span className="text-muted-foreground">{LABEL[status]}</span>
      </span>
    );
  }
  return (
    <span
      title={LABEL[status]}
      aria-label={LABEL[status]}
      className={cn("inline-block rounded-full ring-2 ring-background", dim, COLOR[status], className)}
    />
  );
}
