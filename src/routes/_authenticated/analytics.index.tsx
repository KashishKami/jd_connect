import { createFileRoute } from "@tanstack/react-router";
import { useRouteGuard, AccessDenied } from "@/components/PermissionGate";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BarChart3, Download } from "lucide-react";
import { downloadCSV, toCSV, fmtUSD } from "@/lib/csv";
import { Navigate } from "@tanstack/react-router";
import { DateRangePicker } from "@/components/DateRangePicker";

export const Route = createFileRoute("/_authenticated/analytics/")({
  head: () => ({ meta: [{ title: "Analytics — JD Connect" }] }),
  component: Analytics,
});

function Analytics() {
  const __guard = useRouteGuard("reports.dashboards");
  const { roles, isAdmin, loading } = useAuth();
  const { can } = usePermissions();
  // canView gates the data queries — must match the same permission as the route guard
  const canView = isAdmin || roles.includes("manager") || roles.includes("team_leader") || can("reports.dashboards");
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const lb = useQuery({
    queryKey: ["leaderboard", from, to],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("leaderboard", { _from: from, _to: to, _limit: 25 });
      if (error) throw error;
      return data ?? [];
    },
  });
  const src = useQuery({
    queryKey: ["src-analytics", from, to],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("source_analytics", { _from: from, _to: to });
      if (error) throw error;
      return data ?? [];
    },
  });
  const centres = useQuery({
    queryKey: ["centre-comparison", from, to],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("centre_comparison", { _from: from, _to: to });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (loading) return null;
  if (!canView) return <Navigate to="/dashboard" />;

  if (!__guard.isLoading && !__guard.allowed) return <AccessDenied perm="reports.dashboards" label="analytics" />;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <BarChart3 className="h-6 w-6" /> Workforce Analytics
        </h1>
        <DateRangePicker
          value={{ from, to }}
          onChange={(v) => {
            setFrom(v.from);
            setTo(v.to);
          }}
          align="end"
        />
      </div>

      <Tabs defaultValue="leaderboard">
        <TabsList>
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="sources">Sales Sources</TabsTrigger>
          <TabsTrigger value="centres">Centre Comparison</TabsTrigger>
        </TabsList>

        <TabsContent value="leaderboard">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Top Agents by Net Revenue</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadCSV(`leaderboard-${from}_to_${to}.csv`, toCSV(lb.data as any))}
              >
                <Download className="h-4 w-4 mr-1" /> Export
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Refunds</TableHead>
                    <TableHead className="text-right">Chargebacks</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(lb.data ?? []).map((r: any, i: number) => (
                    <TableRow key={r.employee_id}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell>
                        {r.full_name} <span className="text-xs text-muted-foreground">{r.employee_code}</span>
                      </TableCell>
                      <TableCell className="text-right">{r.sales_count}</TableCell>
                      <TableCell className="text-right">{fmtUSD(r.gross_revenue)}</TableCell>
                      <TableCell className="text-right">{fmtUSD(r.refunds)}</TableCell>
                      <TableCell className="text-right">{fmtUSD(r.chargebacks)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmtUSD(r.net_revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sources">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Sales Source Performance</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadCSV(`sources-${from}_to_${to}.csv`, toCSV(src.data as any))}
              >
                <Download className="h-4 w-4 mr-1" /> Export
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(src.data ?? []).map((r: any) => (
                    <TableRow key={r.source_id}>
                      <TableCell>{r.source_name}</TableCell>
                      <TableCell className="text-right">{r.sales_count}</TableCell>
                      <TableCell className="text-right">{fmtUSD(r.gross_revenue)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmtUSD(r.net_revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="centres">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Centre Comparison (DBP vs ITP)</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadCSV(`centres-${from}_to_${to}.csv`, toCSV(centres.data as any))}
              >
                <Download className="h-4 w-4 mr-1" /> Export
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Centre</TableHead>
                    <TableHead className="text-right">Present days</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Refunds</TableHead>
                    <TableHead className="text-right">Chargebacks</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(centres.data ?? []).map((r: any) => (
                    <TableRow key={r.centre_id}>
                      <TableCell className="font-medium">{r.centre_code}</TableCell>
                      <TableCell className="text-right">{r.present_days}</TableCell>
                      <TableCell className="text-right">{r.sales_count}</TableCell>
                      <TableCell className="text-right">{fmtUSD(r.gross_revenue)}</TableCell>
                      <TableCell className="text-right">{fmtUSD(r.refunds)}</TableCell>
                      <TableCell className="text-right">{fmtUSD(r.chargebacks)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmtUSD(r.net_revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
