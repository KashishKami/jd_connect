import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";

export function useRouteGuard(perm: string | string[]) {
  const { isAdmin } = useAuth();
  const { can, isLoading } = usePermissions();
  const keys = Array.isArray(perm) ? perm : [perm];
  const allowed = isAdmin || keys.some((k) => can(k));
  return { allowed, isLoading, keys };
}

export function AccessDenied({ perm, label }: { perm: string | string[]; label?: string }) {
  const keys = Array.isArray(perm) ? perm : [perm];
  return (
    <div className="max-w-2xl mx-auto py-12 text-center space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">Access denied</h1>
      <p className="text-sm text-muted-foreground">
        You don't have permission to view {label ?? "this page"}.
      </p>
      <p className="text-xs text-muted-foreground">
        Ask an admin to grant you{" "}
        {keys.map((k, i) => (
          <span key={k}>
            {i > 0 ? " or " : ""}
            <code className="px-1 py-0.5 rounded bg-muted">{k}</code>
          </span>
        ))}
        .
      </p>
    </div>
  );
}

export function PermissionGate({
  perm,
  label,
  children,
  fallback,
}: {
  perm: string | string[];
  label?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { allowed, isLoading } = useRouteGuard(perm);
  if (isLoading) return null;
  if (!allowed) return <>{fallback ?? <AccessDenied perm={perm} label={label} />}</>;
  return <>{children}</>;
}