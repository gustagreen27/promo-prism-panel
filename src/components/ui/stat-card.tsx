import type { ComponentType, ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type StatTone = "default" | "brand" | "success" | "warning" | "danger" | "info";

const toneRing: Record<StatTone, string> = {
  default: "bg-muted text-foreground/70",
  brand: "bg-brand-soft text-brand-dark",
  success: "bg-brand-soft text-brand-dark",
  warning: "bg-warning/15 text-warning",
  danger: "bg-destructive/10 text-destructive",
  info: "bg-info/10 text-info",
};

export function StatCard({
  label,
  value,
  hint,
  tooltip,
  icon: Icon,
  tone = "default",
  loading,
  footer,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tooltip?: string;
  icon?: ComponentType<{ className?: string }>;
  tone?: StatTone;
  loading?: boolean;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-4 shadow-[var(--shadow-sm)] transition hover:shadow-[var(--shadow-md)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          {tooltip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label="Mais informações" className="text-muted-foreground/60 hover:text-foreground">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{tooltip}</TooltipContent>
            </Tooltip>
          )}
        </div>
        {Icon && (
          <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-xl", toneRing[tone])}>
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className="mt-2">
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        )}
      </div>
      {hint && !loading && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {footer && <div className="mt-3">{footer}</div>}
    </div>
  );
}
