import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  Wallet,
  TrendingDown,
  TrendingUp,
  MessageSquare,
  Percent,
  Target,
  ArrowUpRight,
} from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { PeriodFilter } from "@/components/admin/period-filter";
import { MetricCard } from "@/components/admin/metric-card";
import { EmptyState } from "@/components/admin/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDashboardSummary } from "@/lib/dashboard.functions";
import { getPeriodRange, type PeriodKey } from "@/lib/period";
import { formatBRL, formatDate, formatNumber, formatPercent } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Dashboard — Painel" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const [period, setPeriod] = useState<PeriodKey>("this_month");
  const range = useMemo(() => getPeriodRange(period), [period]);
  const fetcher = useServerFn(getDashboardSummary);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-summary", period, range.start.toISOString(), range.end.toISOString()],
    queryFn: () =>
      fetcher({ data: { start: range.start.toISOString(), end: range.end.toISOString() } }),
  });

  const goalPct = Math.max(0, Math.min(100, data?.goalProgress ?? 0));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Visão geral — ${range.label.toLowerCase()}`}
        actions={<PeriodFilter value={period} onChange={setPeriod} />}
      />

      {/* Metric cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Faturamento"
          value={isLoading ? "—" : formatBRL(data?.totalRevenue ?? 0)}
          subtext="Recebido no período"
          color="green"
          icon={<Wallet className="h-5 w-5" />}
        />
        <MetricCard
          label="Custos"
          value={isLoading ? "—" : formatBRL(data?.totalCost ?? 0)}
          subtext="Despesas no período"
          color="red"
          icon={<TrendingDown className="h-5 w-5" />}
        />
        <MetricCard
          label="Lucro"
          value={isLoading ? "—" : formatBRL(data?.profit ?? 0)}
          subtext={
            data?.margin != null ? `Margem ${formatPercent(data.margin)}` : "Sem faturamento"
          }
          color={(data?.profit ?? 0) >= 0 ? "blue" : "amber"}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <MetricCard
          label="Mensagens"
          value={isLoading ? "—" : formatNumber(data?.totalMessages ?? 0)}
          subtext={
            data?.deliveryRate != null
              ? `Entrega ${formatPercent(data.deliveryRate)}`
              : "Sem envios"
          }
          color="purple"
          icon={<MessageSquare className="h-5 w-5" />}
        />
      </div>

      {/* Goal + secondary metrics */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-white/5 bg-card/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-base font-semibold">Meta mensal</CardTitle>
              <p className="text-xs text-muted-foreground">
                Progresso de faturamento do mês atual
              </p>
            </div>
            <Target className="h-5 w-5 text-emerald-400" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <p className="text-2xl font-semibold tracking-tight text-emerald-300">
                  {formatBRL(data?.monthRevenue ?? 0)}
                </p>
                <p className="text-xs text-muted-foreground">
                  de {formatBRL(data?.monthlyGoal ?? 0)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-semibold tracking-tight">
                  {formatPercent(goalPct, 0)}
                </p>
                <p className="text-xs text-muted-foreground">atingido</p>
              </div>
            </div>
            <Progress value={goalPct} className="h-2 bg-white/5" />
            {(data?.monthlyGoal ?? 0) === 0 && (
              <p className="text-xs text-muted-foreground">
                Defina sua meta mensal em{" "}
                <Link to="/admin/configuracoes" className="underline hover:text-foreground">
                  Configurações
                </Link>
                .
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-white/5 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Taxa de entrega</CardTitle>
            <p className="text-xs text-muted-foreground">WhatsApp no período</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <Percent className="h-5 w-5 text-violet-400" />
              <p className="text-3xl font-semibold tracking-tight text-violet-300">
                {data?.deliveryRate != null ? formatPercent(data.deliveryRate, 1) : "—"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md border border-white/5 bg-white/[0.02] px-3 py-2">
                <p className="text-muted-foreground">Entregues</p>
                <p className="font-medium text-emerald-300">
                  {formatNumber(data?.delivered ?? 0)}
                </p>
              </div>
              <div className="rounded-md border border-white/5 bg-white/[0.02] px-3 py-2">
                <p className="text-muted-foreground">Falhas</p>
                <p className="font-medium text-rose-300">{formatNumber(data?.failed ?? 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lower blocks */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="border-white/5 bg-card/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base font-semibold">Últimos Fechamentos</CardTitle>
              <p className="text-xs text-muted-foreground">Resumos mensais salvos</p>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-xs">
              <Link to="/admin/fechamento">
                Ver tudo <ArrowUpRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {(data?.lastClosings?.length ?? 0) === 0 ? (
              <EmptyState
                title="Sem fechamentos"
                description="Crie o primeiro fechamento mensal para acompanhar a evolução."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Período</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    <TableHead className="text-right">Lucro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data!.lastClosings.map((c: any) => {
                    const profit = Number(c.profit ?? Number(c.revenue ?? 0) - Number(c.cost ?? 0));
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">
                          {String(c.month).padStart(2, "0")}/{c.year}
                        </TableCell>
                        <TableCell className="text-right text-emerald-300">
                          {formatBRL(c.revenue ?? 0)}
                        </TableCell>
                        <TableCell className="text-right text-rose-300">
                          {formatBRL(c.cost ?? 0)}
                        </TableCell>
                        <TableCell
                          className={`text-right font-medium ${
                            profit >= 0 ? "text-blue-300" : "text-amber-300"
                          }`}
                        >
                          {formatBRL(profit)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="border-white/5 bg-card/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base font-semibold">Últimos Faturamentos</CardTitle>
              <p className="text-xs text-muted-foreground">Receitas recentes registradas</p>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-xs">
              <Link to="/admin/faturamento">
                Ver tudo <ArrowUpRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {(data?.lastRevenues?.length ?? 0) === 0 ? (
              <EmptyState
                title="Sem faturamentos"
                description="Lance sua primeira receita no módulo Faturamento."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data!.lastRevenues.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="max-w-[180px] truncate font-medium">
                        {r.client?.name ?? r.project?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <StatusPill status={String(r.status ?? "—")} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(r.paid_date ?? r.due_date ?? r.created_at)}
                      </TableCell>
                      <TableCell className="text-right font-medium text-emerald-300">
                        {formatBRL(r.amount ?? 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    pago: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
    pendente: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
    atrasado: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
    cancelado: "bg-white/5 text-muted-foreground ring-white/10",
  };
  const cls = map[status.toLowerCase()] ?? "bg-white/5 text-muted-foreground ring-white/10";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${cls}`}
    >
      {status}
    </span>
  );
}
