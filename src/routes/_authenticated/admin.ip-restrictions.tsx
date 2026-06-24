import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { DeleteRowButton } from "@/components/DeleteRowButton";
import { Globe, Plus, ShieldAlert } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/ip-restrictions")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [ipAddress, setIpAddress] = useState("");
  const [description, setDescription] = useState("");

  const { data: allowedIps, isLoading } = useQuery({
    queryKey: ["allowed_ips"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("allowed_ips")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const trimmedIp = ipAddress.trim();
      if (!trimmedIp) throw new Error("IP Address is required.");
      
      // Simple IP validation (IPv4 or IPv6 format check)
      const ipv4Regex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
      
      if (!ipv4Regex.test(trimmedIp) && !ipv6Regex.test(trimmedIp)) {
        throw new Error("Please enter a valid IPv4 or IPv6 address.");
      }

      // Check current user session
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No authenticated user.");

      const { error } = await supabase.from("allowed_ips").insert({
        ip_address: trimmedIp,
        description: description.trim() || null,
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("IP address whitelisted successfully");
      setOpen(false);
      setIpAddress("");
      setDescription("");
      qc.invalidateQueries({ queryKey: ["allowed_ips"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Globe className="h-6 w-6 text-primary" />
            IP Restrictions Allowlist
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Explicitly set which network IP addresses can access the application. Non-admin users outside this whitelist will be blocked.
          </p>
        </div>
        
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" /> Add IP Address
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Whitelist New IP Address</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label htmlFor="ip-address">IP Address (IPv4 or IPv6)</Label>
                <Input 
                  id="ip-address"
                  value={ipAddress} 
                  onChange={(e) => setIpAddress(e.target.value)} 
                  placeholder="e.g. 103.163.224.78" 
                  maxLength={45} 
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="description">Description / Label</Label>
                <Input 
                  id="description"
                  value={description} 
                  onChange={(e) => setDescription(e.target.value)} 
                  placeholder="e.g. Main Office Router" 
                  maxLength={100} 
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending ? "Adding..." : "Add to Whitelist"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {allowedIps?.length === 0 && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-800">
              <span className="font-semibold">Security Warning: </span>
              The IP whitelist is currently empty. This means IP restrictions are <strong>inactive</strong> and employees can access the portal from any location. Once you add at least one IP address, the allowlist will instantly become active and block all non-admin users outside the listed networks.
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Allowed IP Address</TableHead>
                <TableHead>Label / Description</TableHead>
                <TableHead>Date Added</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                    Loading allowed IPs...
                  </TableCell>
                </TableRow>
              ) : allowedIps && allowedIps.length > 0 ? (
                allowedIps.map((ip) => (
                  <TableRow key={ip.id}>
                    <TableCell className="font-mono font-medium text-foreground">{ip.ip_address}</TableCell>
                    <TableCell className="text-muted-foreground">{ip.description ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{formatDateTime(ip.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <DeleteRowButton 
                        entity="allowed_ips" 
                        id={ip.id} 
                        label={ip.ip_address} 
                        invalidateKeys={[["allowed_ips"]]} 
                      />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No whitelisted IP addresses found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
