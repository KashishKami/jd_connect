import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PresenceDot } from "@/components/PresenceDot";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MessageSquare } from "lucide-react";

export const Route = createFileRoute("/_authenticated/directory")({
  head: () => ({ meta: [{ title: "Employee Directory — JD Connect" }] }),
  component: Directory,
});

function Directory() {
  const { isAdmin, employee: me } = useAuth();
  const navigate = useNavigate();
  const { can, isLoading: permsLoading } = usePermissions();
  const allowed = isAdmin || can("employees.view");
  const [q, setQ] = useState("");
  const [dept, setDept] = useState<string>("all");
  const [centre, setCentre] = useState<string>("all");
  const [role, setRole] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [chatLoadingId, setChatLoadingId] = useState<string | null>(null);

  const handleGoToChat = async (otherId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    if (!me?.id) return;
    setChatLoadingId(otherId);
    try {
      const { data, error } = await supabase.rpc("start_direct_chat", { _other: otherId });
      if (error) throw error;
      if (!data) throw new Error("Could not start chat");
      void navigate({ to: "/chat/$conversationId", params: { conversationId: data as string } });
    } catch (err: any) {
      toast.error(err.message || "Failed to open chat");
    } finally {
      setChatLoadingId(null);
    }
  };

  const { data: filters } = useQuery({
    queryKey: ["dir-filters"],
    queryFn: async () => {
      const [d, c, r] = await Promise.all([
        supabase.from("departments").select("id, name").order("name"),
        supabase.from("centres").select("id, name").order("name"),
        supabase.from("roles").select("id, name").order("name"),
      ]);
      return { departments: d.data ?? [], centres: c.data ?? [], roles: r.data ?? [] };
    },
  });

  const { data: rows } = useQuery({
    queryKey: ["directory", q, dept, centre, role, status],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_employee_directory", {
        _q: q.trim() || undefined,
        _department_id: dept === "all" ? undefined : dept,
        _centre_id: centre === "all" ? undefined : centre,
        _role_id: role === "all" ? undefined : role,
        _status: status === "all" ? undefined : (status as "active" | "suspended" | "resigned" | "terminated"),
        _limit: 500,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const statusColor = useMemo(() => ({
    active: "default", suspended: "secondary", resigned: "outline", terminated: "destructive",
  } as const), []);

  if (!permsLoading && !allowed) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Access denied</h1>
        <p className="text-sm text-muted-foreground">You don't have permission to view the employee directory. Ask an admin to grant you the <code>employees.view</code> permission.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Employee Directory</h1>
        <p className="text-sm text-muted-foreground">Search and filter the company directory.</p>
      </div>
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <Input className="md:col-span-2" placeholder="Search name, ID, email…" value={q} onChange={(e) => setQ(e.target.value)} />
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger><SelectValue placeholder="Department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {filters?.departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={centre} onValueChange={setCentre}>
              <SelectTrigger><SelectValue placeholder="Centre" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All centres</SelectItem>
                {filters?.centres.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue placeholder="Role" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {filters?.roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="resigned">Resigned</SelectItem>
                <SelectItem value="terminated">Terminated</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Centre</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center w-20">Chat</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows?.map((e) => (
                <TableRow key={e.id} className="cursor-pointer hover:bg-secondary/50">
                  <TableCell className="font-mono text-xs">
                    <Link to="/employees/$id" params={{ id: e.id }} className="text-primary hover:underline">{e.employee_code}</Link>
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link to="/employees/$id" params={{ id: e.id }} className="hover:underline inline-flex items-center gap-2">
                      <PresenceDot employeeId={e.id} size="sm" />
                      <span>{e.full_name}</span>
                    </Link>
                  </TableCell>
                  <TableCell>{e.designation ?? "—"}</TableCell>
                  <TableCell>{e.department_name ?? "—"}</TableCell>
                  <TableCell>{e.centre_code ?? "—"}</TableCell>
                  <TableCell>{e.role_name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={statusColor[e.employment_status as keyof typeof statusColor]}>{e.employment_status}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {me?.id !== e.id ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        title="Go to chat"
                        onClick={(ev) => handleGoToChat(e.id, ev)}
                        disabled={chatLoadingId === e.id}
                      >
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {rows && rows.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No employees found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}