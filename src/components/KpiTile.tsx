import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

type LinkProps = ComponentProps<typeof Link>;

export function KpiTile({
  label, value, hint, highlight, linkProps,
}: {
  label: string;
  value: string | number;
  hint?: string;
  highlight?: boolean;
  linkProps?: LinkProps;
}) {
  const inner = (
    <CardContent className="p-3 sm:p-4">
      <div className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-lg sm:text-xl font-semibold tabular-nums mt-1 truncate">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-1 truncate">{hint}</div>}
    </CardContent>
  );
  const className = cn(
    highlight && "border-primary",
    linkProps && "cursor-pointer hover:bg-accent/40 active:bg-accent/60 transition-colors",
  );
  if (linkProps) {
    return (
      <Link {...linkProps} className="block">
        <Card className={className}>{inner}</Card>
      </Link>
    );
  }
  return <Card className={className}>{inner}</Card>;
}