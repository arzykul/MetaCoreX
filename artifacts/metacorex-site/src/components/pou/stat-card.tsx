import type { ElementType, ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

/** Shared hero-metric stat card used across PoU analytics pages (dashboard, leaderboard, agent profile). */
export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  testId,
}: {
  icon: ElementType;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  testId: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground mb-1">{label}</div>
            <div className="text-2xl font-bold text-foreground truncate">{value}</div>
            {sub != null && <div className="mt-1 text-xs">{sub}</div>}
          </div>
          <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
