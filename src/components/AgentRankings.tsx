import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { fmtUSD } from "@/lib/csv";

type Row = {
  employee_id: string;
  full_name: string;
  employee_code: string;
  centre_id: string | null;
  centre_code: string | null;
  sales_count: number;
  net_revenue: number;
  rank_position: "top" | "bottom";
};

export function AgentRankings({
  title, centreId, from, to, limit = 5,
}: {
  title: string;
  centreId: string | null;
  from: string;
  to: string;
  limit?: number;
}) {
  const { data = [] } = useQuery({
    queryKey: ["agent-rankings", centreId, from, to, limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("agent_rankings", {
        _from: from, _to: to, _centre_id: centreId ?? undefined, _limit: limit,
      });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const top = data.filter((r) => r.rank_position === "top");
  const bottom = data.filter((r) => r.rank_position === "bottom");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base sm:text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <RankList heading={`Top ${limit}`} rows={top} accent="text-emerald-600 dark:text-emerald-400" />
        <RankList heading={`Bottom ${limit}`} rows={bottom} accent="text-rose-600 dark:text-rose-400" />
      </CardContent>
    </Card>
  );
}

function RankList({ heading, rows, accent }: { heading: string; rows: Row[]; accent: string }) {
  return (
    <div>
      <div className={`text-xs font-semibold uppercase tracking-wide mb-2 ${accent}`}>{heading}</div>
      {rows.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2">No data in range.</div>
      ) : (
        <ol className="rounded-md border divide-y">
          {rows.map((r, i) => (
            <li key={r.employee_id}>
              <Link
                to="/employees/$id"
                params={{ id: r.employee_id }}
                className="flex items-center justify-between gap-2 px-2.5 py-2 hover:bg-accent/40 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-mono text-muted-foreground w-4 shrink-0">{i + 1}</span>
                  <span className="truncate text-sm">{r.full_name}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[11px] text-muted-foreground tabular-nums">{r.sales_count} sales</span>
                  <span className="text-sm tabular-nums font-medium">{fmtUSD(r.net_revenue)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
// Touch for HMR rebuild