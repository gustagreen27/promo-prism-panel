import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { MetricCard } from "@/components/admin/metric-card";
import { Button } from "@/components/ui/button";
import { Wallet, Activity, Send, Maximize2 } from "lucide-react";
import { formatBRL, formatNumber, formatPercent } from "@/lib/format";
import { getDashboardSummary } from "@/lib/dashboard.functions";
import { getPeriodRange } from "@/lib/period";

export const Route = createFileRoute("/_authenticated/admin/tv")({
  head: () => ({ meta: [{ title: "Dashboard TV — Painel" }] }),
  component: Page,
});

import { ErrorCard } from "@/components/admin/query-state";

function Page() {
  const fn = useServerFn(getDashboardSummary);
  const { start, end } = getPeriodRange("this_month");
  const { data, refetch, error, isLoading } = useQuery({
    queryKey: ["dash-tv"],
    queryFn: () => fn({ data: { start: start.toISOString(), end: end.toISOString() } }),
    refetchInterval: 30000,
  });

  const [now, setNow] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);

  function fullscreen() {
    const el = document.documentElement;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  const num = (v: number | null | undefined, fmt: (n: number) => string) =>
    v == null ? "—" : fmt(v);

  return (
    <>
      <PageHeader
        title="Dashboard TV"
        description={`Tempo real · ${now.toLocaleTimeString("pt-BR")}`}
        actions={
          <>
            <Button variant="outline" onClick={() => refetch()}>Atualizar</Button>
            <Button onClick={fullscreen}><Maximize2 className="mr-2 h-4 w-4" />Tela cheia</Button>
          </>
        }
      />
      {error && <ErrorCard error={error} onRetry={() => refetch()} />}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Receita do mês" value={num(data?.monthRevenue ?? null, formatBRL)} color="green" icon={<Wallet className="h-5 w-5" />} />
        <MetricCard label="Lucro" value={num(data?.profit ?? null, formatBRL)} color="blue" icon={<Activity className="h-5 w-5" />} />
        <MetricCard label="Mensagens" value={num(data?.totalMessages ?? null, formatNumber)} color="purple" icon={<Send className="h-5 w-5" />}
          subtext={data?.deliveryRate != null ? `Entrega ${formatPercent(data.deliveryRate)}` : (isLoading ? "" : "Sem envios")} />
        <MetricCard label="Meta" value={data?.goalProgress != null ? formatPercent(data.goalProgress) : "—"} color="amber"
          subtext={data?.monthlyGoal ? `${formatBRL(data?.monthRevenue ?? 0)} / ${formatBRL(data.monthlyGoal)}` : "Defina sua meta em Configurações"} />
      </div>

      <section className="rounded-xl border bg-card p-6 text-center">
        <p className="text-sm uppercase tracking-wider text-muted-foreground">Margem do período</p>
        <p className="mt-2 text-6xl font-bold tracking-tight">{data?.margin != null ? formatPercent(data.margin) : "—"}</p>
      </section>
    </>
  );
}
