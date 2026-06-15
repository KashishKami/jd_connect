import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/roles")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["roles-perms"],
    queryFn: async () => {
      const [r, p, rp] = await Promise.all([
        supabase.from("roles").select("*").order("name"),
        supabase.from("permissions").select("*").order("key"),
        supabase.from("role_permissions").select("*"),
      ]);
      return { roles: r.data ?? [], perms: p.data ?? [], rp: rp.data ?? [] };
    },
  });
  const toggle = useMutation({
    mutationFn: async ({ role_id, permission_id, on }: { role_id: string; permission_id: string; on: boolean }) => {
      if (on) { const { error } = await supabase.from("role_permissions").insert({ role_id, permission_id }); if (error) throw error; }
      else { const { error } = await supabase.from("role_permissions").delete().eq("role_id", role_id).eq("permission_id", permission_id); if (error) throw error; }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles-perms"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const has = (rid: string, pid: string) => data?.rp.some((x) => x.role_id === rid && x.permission_id === pid) ?? false;
  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div><h1 className="text-2xl font-semibold">Roles &amp; Permissions</h1><p className="text-sm text-muted-foreground">Assign permissions to roles. Permissions are database-driven.</p></div>
      <Card><CardHeader><CardTitle>Permission matrix</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead><tr className="border-b">
              <th className="text-left p-2">Permission</th>
              {data?.roles.map((r) => <th key={r.id} className="p-2 text-center min-w-[100px]">{r.name}</th>)}
            </tr></thead>
            <tbody>{data?.perms.map((p) => (
              <tr key={p.id} className="border-b">
                <td className="p-2"><div className="font-mono text-xs">{p.key}</div><div className="text-xs text-muted-foreground">{p.description}</div></td>
                {data.roles.map((r) => (
                  <td key={r.id} className="p-2 text-center">
                    <Checkbox checked={has(r.id, p.id)} onCheckedChange={(v) => toggle.mutate({ role_id: r.id, permission_id: p.id, on: !!v })} />
                  </td>
                ))}
              </tr>
            ))}</tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}