import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

export interface EmptyStateProps {
  icon?: ReactNode;
  title?: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({
  icon,
  title = "Sem dados",
  description = "Nada por aqui ainda.",
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-muted/30 px-6 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <p className="mt-4 text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
