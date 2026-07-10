import { Check, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type WizardStep = {
  id: number;
  label: string;
  short?: string;
  icon?: LucideIcon;
};

export function Stepper({
  steps,
  current,
  onGoTo,
  maxReached,
}: {
  steps: WizardStep[];
  current: number;
  onGoTo: (id: number) => void;
  maxReached: number;
}) {
  return (
    <div className="w-full">
      <div className="relative flex items-center justify-between">
        <div className="absolute left-4 right-4 top-4 -z-0 h-0.5 bg-border" />
        <div
          className="absolute left-4 top-4 -z-0 h-0.5 bg-primary transition-all"
          style={{
            width: `calc(${((current - 1) / (steps.length - 1)) * 100}% - ${((current - 1) / (steps.length - 1)) * 32}px)`,
          }}
        />
        {steps.map((s) => {
          const done = s.id < current;
          const active = s.id === current;
          const reachable = s.id <= maxReached;
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => reachable && onGoTo(s.id)}
              disabled={!reachable}
              className={cn(
                "relative z-10 flex flex-col items-center gap-1.5",
                reachable ? "cursor-pointer" : "cursor-not-allowed"
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors",
                  done && "border-primary bg-primary text-primary-foreground",
                  active && "border-primary bg-primary text-primary-foreground ring-4 ring-primary/15",
                  !done && !active && "border-border bg-background text-muted-foreground"
                )}
              >
                {done ? <Check className="h-4 w-4" /> : Icon ? <Icon className="h-4 w-4" /> : s.id}
              </span>
              <span
                className={cn(
                  "hidden text-[11px] font-medium sm:block",
                  active ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {s.short ?? s.label}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 text-center text-sm font-medium sm:hidden">
        Etapa {current} de {steps.length} · {steps.find((s) => s.id === current)?.label}
      </div>
    </div>
  );
}
