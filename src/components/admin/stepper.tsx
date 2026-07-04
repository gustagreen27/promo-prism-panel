import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export type Step = { id: string; label: string; description?: string };

type Props = {
  steps: Step[];
  currentIndex: number;
  onStepClick?: (index: number) => void;
  className?: string;
};

export function Stepper({ steps, currentIndex, onStepClick, className }: Props) {
  return (
    <ol className={cn("flex w-full items-start gap-2 overflow-x-auto pb-2", className)}>
      {steps.map((s, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        const clickable = !!onStepClick && (done || active);
        return (
          <li key={s.id} className="flex min-w-0 flex-1 items-start gap-3">
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onStepClick?.(i)}
              className={cn(
                "group flex min-w-0 flex-1 items-start gap-3 rounded-lg p-2 text-left transition-colors",
                clickable && "hover:bg-muted/50",
                !clickable && "cursor-default",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                  done && "border-primary bg-primary text-primary-foreground",
                  active && "border-primary bg-primary/10 text-primary",
                  !done && !active && "border-border bg-muted text-muted-foreground",
                )}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span className={cn("truncate text-sm font-medium", active ? "text-foreground" : "text-muted-foreground")}>
                  {s.label}
                </span>
                {s.description && (
                  <span className="truncate text-xs text-muted-foreground">{s.description}</span>
                )}
              </span>
            </button>
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className={cn("mt-4 h-px flex-1 shrink-0", done ? "bg-primary" : "bg-border")}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
