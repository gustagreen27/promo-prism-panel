import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Gauge } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getPlatformCapacity } from "@/lib/platform-capacity.functions";

const nf = (n: number) => n.toLocaleString("pt-BR");

function formatUpdatedAt(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) ===
    today.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const time = d.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
  const date = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return sameDay ? `Atualizado hoje às ${time}` : `Atualizado em ${date} às ${time}`;
}

export function PlatformCapacityCard() {
  const fn = useServerFn(getPlatformCapacity);
  const { data } = useQuery({
    queryKey: ["platform-capacity"],
    queryFn: () => fn(),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  if (!data || data.daily_capacity <= 0) return null;

  const pct = Math.min(100, Math.round((data.daily_completed / data.daily_capacity) * 100));

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Gauge className="h-4 w-4 text-primary" /> Capacidade diária de disparos
          </h2>
          <span className="text-xs text-muted-foreground">{formatUpdatedAt(data.updated_at)}</span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Stat label="Capacidade diária" value={data.daily_capacity} tone="blue" />
          <Stat label="Realizados hoje" value={data.daily_completed} tone="green" />
          <Stat label="Disponível hoje" value={data.daily_available} tone="purple" />
        </div>

        <div className="mt-4 space-y-1.5">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {nf(data.daily_completed)} de {nf(data.daily_capacity)} utilizados
            </span>
            <span className="font-medium text-foreground">{pct}% da capacidade utilizada</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const TONE: Record<string, { dot: string; text: string; bg: string }> = {
  blue: { dot: "bg-blue-500", text: "text-blue-600", bg: "bg-blue-500/5 border-blue-500/20" },
  green: { dot: "bg-emerald-500", text: "text-emerald-600", bg: "bg-emerald-500/5 border-emerald-500/20" },
  purple: { dot: "bg-purple-500", text: "text-purple-600", bg: "bg-purple-500/5 border-purple-500/20" },
};

function Stat({ label, value, tone }: { label: string; value: number; tone: keyof typeof TONE }) {
  const t = TONE[tone];
  return (
    <div className={`rounded-xl border p-3 ${t.bg}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} /> {label}
      </div>
      <div className={`mt-1 text-xl font-semibold tabular-nums sm:text-2xl ${t.text}`}>
        {value.toLocaleString("pt-BR")}
      </div>
      <div className="text-[11px] text-muted-foreground">mensagens</div>
    </div>
  );
}
