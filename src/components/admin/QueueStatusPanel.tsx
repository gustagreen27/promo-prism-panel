import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Activity, AlertCircle, Clock, CheckCircle2, PauseCircle, PlayCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getWaQueueStatus } from "@/lib/wa-queue-status.functions";

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number | string;
  icon: any;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}) {
  const tones: Record<string, string> = {
    default: "border-border bg-card text-foreground",
    success: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300",
    warning: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300",
    danger: "border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-300",
    info: "border-blue-500/30 bg-blue-500/5 text-blue-700 dark:text-blue-300",
  };
  return (
    <div className={`rounded-lg border p-3 ${tones[tone]}`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-80">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function fmt(ts?: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString("pt-BR", { hour12: false });
}

export function QueueStatusPanel() {
  const fn = useServerFn(getWaQueueStatus);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["wa-queue-status"],
    queryFn: () => fn(),
    refetchInterval: 15_000,
  });

  return (
    <section className="rounded-xl border border-border bg-card p-4 md:p-5 space-y-4 shadow-sm">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Status da fila (worker WhatsApp)</h2>
          {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </header>

      {isLoading || !data ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            <StatCard label="Running" value={data.totals.running} icon={PlayCircle} tone="info" />
            <StatCard label="Scheduled" value={data.totals.scheduled} icon={Clock} tone="default" />
            <StatCard label="Paused" value={data.totals.paused} icon={PauseCircle} tone="warning" />
            <StatCard label="Completed" value={data.totals.completed} icon={CheckCircle2} tone="success" />
            <StatCard label="Failed/Error" value={data.totals.failed + data.totals.error} icon={AlertCircle} tone="danger" />
            <StatCard label="Draft" value={data.totals.draft} icon={Clock} tone="default" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <StatCard label="Destinatários pendentes" value={data.recipients.pending} icon={Clock} />
            <StatCard label="Processando" value={data.recipients.processing} icon={Loader2} tone="info" />
            <StatCard label="Enviados" value={data.recipients.sent} icon={CheckCircle2} tone="success" />
            <StatCard label="Falhas" value={data.recipients.failed} icon={AlertCircle} tone="danger" />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/40">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Últimas execuções do cron (a cada 1 min)
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {data.last_ticks[0]?.ran_at ? `último: ${fmt(data.last_ticks[0].ran_at)}` : "sem registros"}
                </span>
              </div>
              <div className="max-h-72 overflow-auto text-xs">
                <table className="w-full">
                  <thead className="bg-muted/20 text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-1.5 font-medium">Quando</th>
                      <th className="text-right px-2 py-1.5 font-medium">Prom.</th>
                      <th className="text-right px-2 py-1.5 font-medium">Camps</th>
                      <th className="text-right px-2 py-1.5 font-medium">Env.</th>
                      <th className="text-right px-2 py-1.5 font-medium">Falhas</th>
                      <th className="text-right px-2 py-1.5 font-medium">ms</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.last_ticks.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">
                          Nenhuma execução registrada ainda (o worker grava a partir do próximo tick).
                        </td>
                      </tr>
                    )}
                    {data.last_ticks.map((t) => (
                      <tr key={t.id} className="border-t border-border/60">
                        <td className="px-3 py-1.5 tabular-nums">{fmt(t.ran_at)}</td>
                        <td className="text-right px-2 py-1.5 tabular-nums">{t.promoted_count}</td>
                        <td className="text-right px-2 py-1.5 tabular-nums">{t.processed_campaigns}</td>
                        <td className="text-right px-2 py-1.5 tabular-nums text-emerald-600">{t.total_sent}</td>
                        <td className="text-right px-2 py-1.5 tabular-nums text-red-600">{t.total_failed}</td>
                        <td className="text-right px-2 py-1.5 tabular-nums text-muted-foreground">{t.duration_ms}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/40">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Campanhas com erro
                </span>
                <span className="text-[11px] text-muted-foreground">{data.campaign_errors.length} registro(s)</span>
              </div>
              <div className="max-h-72 overflow-auto text-xs divide-y divide-border/60">
                {data.campaign_errors.length === 0 && (
                  <div className="px-3 py-4 text-center text-muted-foreground">Sem erros recentes 🎉</div>
                )}
                {data.campaign_errors.map((c) => (
                  <div key={c.id} className="px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{c.name || c.id.slice(0, 8)}</span>
                      <span className="text-[11px] text-muted-foreground">{fmt(c.updated_at)}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">status: {c.status}</div>
                    {c.last_error && (
                      <div className="mt-1 text-red-600 dark:text-red-400 break-words">{c.last_error}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {data.last_ticks[0]?.last_error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              <strong>Último erro do worker:</strong> {data.last_ticks[0].last_error}
            </div>
          )}
        </>
      )}
    </section>
  );
}
