import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getDispatchPerformance } from "@/lib/wa-performance.functions";
import { Activity, Gauge, Inbox, Loader2, ServerCog, Timer, Zap } from "lucide-react";

function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-500"
      : tone === "warn"
        ? "text-amber-500"
        : tone === "bad"
          ? "text-destructive"
          : "text-foreground";
  return (
    <div className="rounded-lg border bg-card/50 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      {hint != null && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function fmtEta(sec: number | null) {
  if (!sec || sec <= 0) return "—";
  if (sec < 90) return `${Math.round(sec)}s`;
  const m = Math.round(sec / 60);
  if (m < 90) return `~${m} min`;
  return `~${(m / 60).toFixed(1)} h`;
}

export function DispatchPerformancePanel({ campaignId, live }: { campaignId: string; live: boolean }) {
  const fn = useServerFn(getDispatchPerformance);
  const { data, isLoading } = useQuery({
    queryKey: ["wa-dispatch-perf", campaignId],
    queryFn: () => fn({ data: { id: campaignId } }),
    refetchInterval: live ? 3000 : 30000,
    refetchIntervalInBackground: false,
  });

  const p = data as any;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4" /> Desempenho do envio
        </CardTitle>
        <div className="flex items-center gap-2">
          {live && <Badge variant="outline" className="gap-1 text-emerald-500"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />ao vivo</Badge>}
          {p?.measured_at && (
            <span className="text-[11px] text-muted-foreground">
              {new Date(p.measured_at).toLocaleTimeString("pt-BR")}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && !p ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Medindo…
          </p>
        ) : !p ? (
          <p className="text-sm text-muted-foreground">Sem dados de desempenho.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              <Stat label="Na fila" value={Number(p.queued).toLocaleString("pt-BR")} hint={<><Inbox className="mr-1 inline h-3 w-3" />de {Number(p.total).toLocaleString("pt-BR")}</>} />
              <Stat
                label="Em processamento (HTTP)"
                value={Number(p.http_in_flight ?? 0).toLocaleString("pt-BR")}
                hint={`limite ${Number(p.http_concurrency_limit ?? 0)} chamadas simultâneas`}
                tone={Number(p.http_in_flight ?? 0) > 0 ? "good" : "warn"}
              />
              <Stat
                label="Reservados pelos workers"
                value={Number(p.reserved_recipients ?? p.processing).toLocaleString("pt-BR")}
                hint="contatos travados no banco"
              />
              <Stat label="Aceitas pela Meta" value={Number(p.accepted).toLocaleString("pt-BR")} tone="good" hint={`${Number(p.failed).toLocaleString("pt-BR")} falhas`} />
              <Stat label="Velocidade atual" value={`${Number(p.rate_now).toFixed(1)} msg/s`} hint={<><Zap className="mr-1 inline h-3 w-3" />{Number(p.rate_last_minute).toLocaleString("pt-BR")} no último minuto</>} tone={p.rate_now > 0 ? "good" : "neutral"} />
              <Stat label="Velocidade média" value={`${Number(p.rate_avg).toFixed(1)} msg/s`} hint={<><Gauge className="mr-1 inline h-3 w-3" />pico {Number(p.rate_peak)} msg/s</>} />
              <Stat label="Requisições iniciadas/s" value={Number(p.requests_started_last_second ?? 0)} hint={`${Number(p.requests_completed_last_second ?? 0)} concluídas/s · ${Number(p.accepted_last_second ?? 0)} aceitas/s`} />
              <Stat label="Ociosidade do worker" value={p.worker_idle_time_ms != null ? `${Number(p.worker_idle_time_ms)} ms` : "—"} hint={p.time_between_requests_ms != null ? `${Number(p.time_between_requests_ms)} ms entre respostas` : undefined} tone={Number(p.worker_idle_time_ms ?? 0) > 5000 ? "warn" : "neutral"} />
              <Stat label="Workers ativos" value={Number(p.active_lanes)} hint={<><ServerCog className="mr-1 inline h-3 w-3" />lanes com lease vivo</>} tone={p.active_lanes > 0 ? "good" : "neutral"} />
              <Stat label="Números ativos" value={Number(p.active_numbers)} />
              <Stat label="Erros de limite" value={Number(p.rate_limit_errors).toLocaleString("pt-BR")} tone={p.rate_limit_errors > 0 ? "bad" : "neutral"} hint={`${Number(p.timeouts).toLocaleString("pt-BR")} timeouts`} />
              <Stat label="Resposta da Meta" value={p.api_latency_avg_ms != null ? `${Number(p.api_latency_avg_ms)} ms` : "—"} hint={p.api_latency_max_ms != null ? `máx ${Number(p.api_latency_max_ms)} ms` : undefined} />
              <Stat label="Previsão da fila" value={fmtEta(p.eta_seconds)} hint={<><Timer className="mr-1 inline h-3 w-3" />para zerar</>} />
            </div>

            {Array.isArray(p.lanes) && p.lanes.length > 0 && (
              <div className="mt-4 overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-left text-muted-foreground">
                    <tr>
                      <th className="p-2 font-medium">Lane</th>
                      <th className="p-2 font-medium">Reservados</th>
                      <th className="p-2 font-medium">HTTP em voo</th>
                      <th className="p-2 font-medium">Limite</th>
                      <th className="p-2 font-medium">Enviadas (lane)</th>
                      <th className="p-2 font-medium">Duração média</th>
                      <th className="p-2 font-medium">Ocioso</th>
                      <th className="p-2 font-medium">Entre respostas</th>
                      <th className="p-2 font-medium">Lease</th>
                      <th className="p-2 font-medium">Motivo da ociosidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.lanes.map((l: any) => (
                      <tr key={l.lane} className="border-t">
                        <td className="p-2 font-medium tabular-nums">#{l.lane}</td>
                        <td className="p-2 tabular-nums">{Number(l.reserved ?? 0)}</td>
                        <td className="p-2 tabular-nums">{Number(l.http_in_flight ?? 0)}</td>
                        <td className="p-2 tabular-nums">{Number(l.http_concurrency_limit ?? 0)}</td>
                        <td className="p-2 tabular-nums">{Number(l.sent_last_minute ?? 0)}</td>
                        <td className="p-2 tabular-nums">{l.avg_request_ms != null ? `${l.avg_request_ms} ms` : "—"}</td>
                        <td className="p-2 tabular-nums">{Number(l.idle_ms ?? 0)} ms</td>
                        <td className="p-2 tabular-nums">{l.time_between_requests_ms != null ? `${l.time_between_requests_ms} ms` : "—"}</td>
                        <td className="p-2 text-muted-foreground">
                          {l.lease_started_at ? new Date(l.lease_started_at).toLocaleTimeString("pt-BR") : "—"}
                          {" → "}
                          {l.lease_until ? new Date(l.lease_until).toLocaleTimeString("pt-BR") : "—"}
                        </td>
                        <td className="p-2 text-muted-foreground">{l.idle_reason ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}


            {p.last_meta_response && (
              <div className="mt-3 rounded-lg border bg-muted/30 p-3 text-xs">
                <span className="font-medium">Última resposta da Meta:</span>{" "}
                {p.last_meta_response.at ? new Date(p.last_meta_response.at).toLocaleString("pt-BR") : "—"}
                {" · "}
                <Badge variant="outline" className="align-middle">{p.last_meta_response.status ?? "—"}</Badge>
                {p.last_meta_response.latency_ms != null && <> · {p.last_meta_response.latency_ms} ms</>}
                {p.last_meta_response.error_code && (
                  <> · <span className="text-destructive">#{p.last_meta_response.error_code} {p.last_meta_response.error}</span></>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
