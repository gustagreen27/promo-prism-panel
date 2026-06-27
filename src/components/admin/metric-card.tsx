import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type MetricColor = "blue" | "green" | "red" | "amber" | "purple" | "neutral";

const COLOR: Record<MetricColor, { ring: string; icon: string; text: string; glow: string }> = {
  blue: {
    ring: "ring-blue-500/20",
    icon: "bg-blue-500/15 text-blue-400",
    text: "text-blue-300",
    glow: "shadow-[0_0_40px_-12px_rgba(59,130,246,0.35)]",
  },
  green: {
    ring: "ring-emerald-500/20",
    icon: "bg-emerald-500/15 text-emerald-400",
    text: "text-emerald-300",
    glow: "shadow-[0_0_40px_-12px_rgba(16,185,129,0.35)]",
  },
  red: {
    ring: "ring-rose-500/20",
    icon: "bg-rose-500/15 text-rose-400",
    text: "text-rose-300",
    glow: "shadow-[0_0_40px_-12px_rgba(244,63,94,0.35)]",
  },
  amber: {
    ring: "ring-amber-500/20",
    icon: "bg-amber-500/15 text-amber-400",
    text: "text-amber-300",
    glow: "shadow-[0_0_40px_-12px_rgba(245,158,11,0.35)]",
  },
  purple: {
    ring: "ring-violet-500/20",
    icon: "bg-violet-500/15 text-violet-400",
    text: "text-violet-300",
    glow: "shadow-[0_0_40px_-12px_rgba(139,92,246,0.35)]",
  },
  neutral: {
    ring: "ring-border",
    icon: "bg-muted text-muted-foreground",
    text: "text-foreground",
    glow: "",
  },
};

export interface MetricCardProps {
  label: string;
  value: ReactNode;
  subtext?: ReactNode;
  icon?: ReactNode;
  color?: MetricColor;
  trend?: ReactNode;
}

export function MetricCard({ label, value, subtext, icon, color = "neutral", trend }: MetricCardProps) {
  const c = COLOR[color];
  return (
    <div
      className={cn(
        "group relative rounded-2xl border border-border bg-card/60 p-5 ring-1 backdrop-blur transition-all hover:bg-card/80",
        c.ring,
        c.glow,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className={cn("mt-2 text-2xl font-semibold tracking-tight sm:text-3xl", c.text)}>
            {value}
          </p>
          {subtext != null && (
            <p className="mt-1 truncate text-xs text-muted-foreground">{subtext}</p>
          )}
        </div>
        {icon && (
          <div
            className={cn(
              "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
              c.icon,
            )}
          >
            {icon}
          </div>
        )}
      </div>
      {trend && <div className="mt-3 text-xs text-muted-foreground">{trend}</div>}
    </div>
  );
}
