import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteAdminEntity } from "@/lib/admin-delete.functions";
import { useAuth } from "@/hooks/useAuth";

type Entity =
  | "employee" | "centre" | "department" | "shift" | "holiday"
  | "sales_source" | "break_type" | "role" | "channel" | "allowed_ips";

export function DeleteRowButton({
  entity, id, label, invalidateKeys, size = "sm", alreadyTerminated = false,
}: {
  entity: Entity;
  id: string;
  label: string;
  invalidateKeys: string[][];
  size?: "sm" | "icon" | "default";
  alreadyTerminated?: boolean;
}) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const fn = useServerFn(deleteAdminEntity);
  const del = useMutation({
    mutationFn: () => fn({ data: { entity, id } }),
    onSuccess: (r) => {
      toast.success(r.soft ? "Marked as terminated" : "Permanently deleted");
      invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!isAdmin) return null;
  const isHardEmployeeDelete = entity === "employee" && alreadyTerminated;
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size={size} variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10">
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{isHardEmployeeDelete ? `Permanently delete ${label}?` : `Delete ${label}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {entity === "employee"
              ? (alreadyTerminated
                  ? "This employee is already terminated. This will permanently remove their record and related notes, attendance, breaks, sales, messages, and notifications. This cannot be undone."
                  : "This will mark the employee as terminated and revoke their login. Click delete again afterwards to permanently remove the record.")
              : "This will permanently delete the record. Linked data may block the delete."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => { e.preventDefault(); del.mutate(); }}
            disabled={del.isPending}
          >
            {del.isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}