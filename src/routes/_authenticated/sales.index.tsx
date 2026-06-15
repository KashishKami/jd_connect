import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Download, TrendingUp } from "lucide-react";
import { downloadCSV, toCSV, fmtUSD } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/sales/")({
  head: () => ({ meta: [{ title: "My Sales — JD Connect" }] }),
  component: MySales,
});

type Period = "day" | "week" | "month" | "quarter" | "half" | "year";

function range(p: Period): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (p === "day") from.setDate(to.getDate());
  else if (p === "week") from.setDate(to.getDate() - 6);
  else if (p === "month") from.setMonth(to.getMonth() - 1);
  else if (p === "quarter") from.setMonth(to.getMonth() - 3);
  else if (p === "half") from.setMonth(to.getMonth() - 6);
  else from.setFullYear(to.getFullYear() - 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(to) };
}

function MySales() {
  const { employee } = useAuth();
  const [period, setPeriod] = useState<Period>("month");
  const { from, to } = useMemo(() => range(period), [period]);

  const { data: perf } = useQuery({
    queryKey: ["agent-perf", employee?.id, from, to],
    enabled: !!employee?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("agent_performance", {
        _employee_id: employee!.id, _from: from, _to: to,
      });
      if (error) throw error;
      return (data?.[0] ?? null) as null | {
        sales_count: number; gross_revenue: number; refunds: number;
        chargebacks: number; net_revenue: number; avg_sale: number;
      };
    },
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["my-sales-entries", employee?.id, from, to],
    enabled: !!employee?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_entries")
        .select("id, sale_date, sales_count, sales_amount_usd, notes, sales_sources(name)")
        .eq("employee_id", employee!.id)
        .gte("sale_date", from).lte("sale_date", to)
        .order("sale_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const exportCsv = () => {
    const rows = entries.map((e: any) => ({
      date: e.sale_date, source: e.sales_sources?.name ?? "",
      sales_count: e.sales_count, sales_amount_usd: e.sales_amount_usd, notes: e.notes ?? "",
    }));
    downloadCSV(`my-sales-${from}_to_${to}.csv`, toCSV(rows));
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-semibold flex items-center gap-2"><TrendingUp className="h-6 w-6" /> My Performance</h1>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Today</SelectItem>
              <SelectItem value="week">Last 7 days</SelectItem>
              <SelectItem value="month">Last 30 days</SelectItem>
              <SelectItem value="quarter">Last 3 months</SelectItem>
              <SelectItem value="half">Last 6 months</SelectItem>
              <SelectItem value="year">Last 12 months</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-1" /> Export</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Stat label="Sales" value={String(perf?.sales_count ?? 0)} />
        <Stat label="Gross" value={fmtUSD(perf?.gross_revenue ?? 0)} />
        <Stat label="Refunds" value={fmtUSD(perf?.refunds ?? 0)} />
        <Stat label="Chargebacks" value={fmtUSD(perf?.chargebacks ?? 0)} />
        <Stat label="Net" value={fmtUSD(perf?.net_revenue ?? 0)} highlight />
        <Stat label="Avg Sale" value={fmtUSD(perf?.avg_sale ?? 0)} />
      </div>

      <Card>
        <CardHeader><CardTitle>Entries ({entries.length})</CardTitle></CardHeader>
        <CardContent>
          {entries.length === 0 ? <p className="text-sm text-muted-foreground">No sales recorded in this period.</p> : (
            <div className="space-y-1 text-sm">
              {entries.map((e: any) => (
                <div key={e.id} className="flex items-center justify-between border-b py-2">
                  <div>
                    <div className="font-medium">{e.sale_date} · {e.sales_sources?.name ?? "—"}</div>
                    {e.notes && <div className="text-xs text-muted-foreground">{e.notes}</div>}
                  </div>
                  <div className="text-right">
                    <div>{e.sales_count} sales</div>
                    <div className="text-xs text-muted-foreground">{fmtUSD(e.sales_amount_usd)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-primary" : ""}>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}