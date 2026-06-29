import { createFileRoute } from "@tanstack/react-router";
import { useRouteGuard, AccessDenied } from "@/components/PermissionGate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { DeleteRowButton } from "@/components/DeleteRowButton";

// ── Time helpers ──────────────────────────────────────────────────────────────

/** "HH:MM" or "HH:MM:SS"  →  { h: "7", m: "30", ampm: "PM" } */
function to12h(time24: string): { h: string; m: string; ampm: "AM" | "PM" } {
  const [hStr, mStr] = time24.split(":");
  const h = parseInt(hStr, 10);
  return {
    h: String(h % 12 || 12),
    m: mStr.padStart(2, "0"),
    ampm: h >= 12 ? "PM" : "AM",
  };
}

/** "7", "30", "PM"  →  "19:30"  (24-hour string for the database) */
function to24h(h: string, m: string, ampm: string): string {
  let hour = parseInt(h, 10);
  if (ampm === "PM" && hour !== 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${m.padStart(2, "0")}`;
}

/** "19:30:00" or "19:30"  →  "7:30 PM" */
function fmt12h(time24: string): string {
  const { h, m, ampm } = to12h(time24);
  return `${h}:${m} ${ampm}`;
}

const HOURS   = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

// ── TimeInput12 — a clean 12-hour time picker ─────────────────────────────────
function TimeInput12({
  value,
  onChange,
}: {
  value: string; // 24-hour "HH:MM" — internal storage format
  onChange: (v24: string) => void;
}) {
  const parsed = to12h(value);

  const update = (h: string, m: string, ampm: string) =>
    onChange(to24h(h, m, ampm));

  return (
    <div className="flex items-center gap-1">
      {/* Hour */}
      <Select
        value={parsed.h}
        onValueChange={(h) => update(h, parsed.m, parsed.ampm)}
      >
        <SelectTrigger className="w-16">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {HOURS.map((h) => (
            <SelectItem key={h} value={h}>
              {h}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span className="text-muted-foreground font-semibold">:</span>

      {/* Minute */}
      <Select
        value={parsed.m}
        onValueChange={(m) => update(parsed.h, m, parsed.ampm)}
      >
        <SelectTrigger className="w-16">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MINUTES.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* AM / PM */}
      <Select
        value={parsed.ampm}
        onValueChange={(ampm) => update(parsed.h, parsed.m, ampm)}
      >
        <SelectTrigger className="w-16">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="AM">AM</SelectItem>
          <SelectItem value="PM">PM</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_authenticated/admin/shifts")({ component: Page });

function Page() {
  const __guard = useRouteGuard("admin.shifts");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [start, setStart] = useState("19:30"); // stored as 24-hour HH:MM
  const [end, setEnd]     = useState("04:30"); // stored as 24-hour HH:MM
  const [grace, setGrace] = useState(15);

  const { data } = useQuery({
    queryKey: ["shifts"],
    queryFn: async () => (await supabase.from("shifts").select("*").order("name")).data ?? [],
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("shifts").insert({
        name,
        start_time: start,
        end_time:   end,
        grace_minutes: grace,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Shift created");
      setOpen(false);
      setName("");
      setStart("19:30");
      setEnd("04:30");
      setGrace(15);
      qc.invalidateQueries({ queryKey: ["shifts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, v }: { id: string; v: boolean }) => {
      await supabase.from("shifts").update({ is_active: v }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shifts"] }),
  });

  if (!__guard.isLoading && !__guard.allowed) {
    return <AccessDenied perm="admin.shifts" label="shifts" />;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold">Shifts</h1>
          <p className="text-sm text-muted-foreground">Define working schedules and grace periods.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>Add Shift</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New shift</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Night Shift"
                  maxLength={50}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Start</Label>
                  <TimeInput12 value={start} onChange={setStart} />
                </div>
                <div className="space-y-1.5">
                  <Label>End</Label>
                  <TimeInput12 value={end} onChange={setEnd} />
                </div>
              </div>
              <div>
                <Label>Grace (minutes)</Label>
                <Input
                  type="number"
                  min={0}
                  max={120}
                  value={grace}
                  onChange={(e) => setGrace(Number(e.target.value))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card><CardContent className="p-0"><Table>
        <TableHeader><TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Start</TableHead>
          <TableHead>End</TableHead>
          <TableHead>Grace</TableHead>
          <TableHead>Active</TableHead>
          <TableHead />
        </TableRow></TableHeader>
        <TableBody>{data?.map((s) => (
          <TableRow key={s.id}>
            <TableCell className="font-medium">{s.name}</TableCell>
            <TableCell>{fmt12h(s.start_time)}</TableCell>
            <TableCell>{fmt12h(s.end_time)}</TableCell>
            <TableCell>{s.grace_minutes} min</TableCell>
            <TableCell><Switch checked={s.is_active} onCheckedChange={(v) => toggle.mutate({ id: s.id, v })} /></TableCell>
            <TableCell className="text-right">
              <DeleteRowButton entity="shift" id={s.id} label={s.name} invalidateKeys={[["shifts"]]} />
            </TableCell>
          </TableRow>
        ))}</TableBody>
      </Table></CardContent></Card>
    </div>
  );
}