import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getMyDemandDetail } from "@/lib/client-demand.functions";
import { demandMetrics, demandStage, STAGE_CLASS, STAGE_LABEL } from "@/lib/demand-stage";
import { workerActivity } from "@/lib/demand-workers";
import {
  ArrowLeft,
  Activity,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Gauge,
  Loader2,
  Send,
  Users,
  XCircle,
} from "lucide-react";

export const Route = createFileRoute("/painel/demanda/$id")({
  head: () => ({
    meta: [
      { title: "Detalhes do disparo — Painel" },
      { name: "description", content: "Histórico, métricas e ações disponíveis para o disparo selecionado." },
      { property: "og:title", content: "Detalhes do disparo — Painel" },
      { property: "og:description", content: "Acompanhe métricas e histórico do disparo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const fmt = (v: string | null | undefined) => (v ? new Date(v).toLocaleString("pt-BR") : "—");
const num = (v: number | null | undefined) => (v ?? 0).toLocaleString("pt-BR");

const ACTION_LABEL: Record<string, string> = {
  "approval.approved": "Disparo aprovado",
  "approval.rejected": "Disparo rejeitado",
  "approval.requested": "Enviado para aprovação",
  "external.progress": "Atualização de progresso",
  "campaign.created": "Campanha criada",
  "campaign.started": "Execução iniciada",
  "campaign.completed": "Execução finalizada",
};

function csvEscape(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(name: string, rows: (string | number | null)[][]) {
  const body = rows.map((r) => r.map(csvEscape).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function Metric({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="mb-1 flex items-center gap-2 text-muted-foreground">{icon}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function Page() {
  const { id } = Route.useParams();
  const detailFn = useServerFn(getMyDemandDetail);
  const [tick, setTick] = useState(0);

  const { data, isLoading, error } = useQuery({
    queryKey: ["my-demand", id],
    queryFn: () => detailFn({ data: { id } }),
    refetchInterval: 15_000,
  });

  const c = (data as any)?.campaign;
  const stage = c ? demandStage(c) : "pending";
  const m = c ? demandMetrics(c) : null;
  const live = stage === "queued" || c?.status === "running";

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setTick((v) => v + 1), 5000);
    return () => clearInterval(t);
  }, [live]);

  const workers = useMemo(
    () =>
      workerActivity({
        id,
        active: !!live,
        pending: m?.pending ?? 0,
        rate: c?.rate_per_second,
        nowMs: Date.now() + tick,
      }),
    [id, live, m?.pending, c?.rate_per_second, tick],
  );

  function exportMetrics() {
    if (!c || !m) return;
    downloadCsv(`disparo-${c.name}-metricas.csv`, [
      ["Campanha", "Status", "Criada em", "Agendada", "Lista", "Template", "Destinatários", "Enviados", "Entregues", "Falhas", "Pendentes", "Cliques", "Cliques únicos"],
      [
        c.name,
        STAGE_LABEL[stage],
        fmt(c.created_at),
        fmt(c.scheduled_at),
        (data as any).list_name ?? "",
        (data as any).template_name ?? "",
        m.total,
        m.sent,
        m.delivered,
        m.failed,
        m.pending,
        (data as any).clicks_total ?? 0,
        (data as any).clicks_unique ?? 0,
      ],
    ]);
  }

  function exportClicks() {
    const clicks = ((data as any)?.clicks ?? []) as any[];
    downloadCsv(`disparo-${c?.name ?? id}-cliques.csv`, [
      ["Data", "Cidade", "Região", "País", "Dispositivo", "Navegador", "Sistema", "Provedor", "Destino"],
      ...clicks.map((k) => [
        fmt(k.clicked_at),
        k.city,
        k.region,
        k.country,
        k.device_type,
        k.browser,
        k.os,
        k.isp,
        k.final_url,
      ]),
    ]);
  }

  function exportHistory() {
    const t = ((data as any)?.timeline ?? []) as any[];
    downloadCsv(`disparo-${c?.name ?? id}-historico.csv`, [
      ["Data", "Evento", "Detalhe"],
      ...t.map((e) => [fmt(e.created_at), ACTION_LABEL[e.action] ?? e.action, e.message ?? ""]),
    ]);
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando disparo…
      </div>
    );
  }

  if (error || !c || !m) {
    return (
      <Card>
        <CardContent className="space-y-3 p-10 text-center text-sm text-muted-foreground">
          <p>Não foi possível carregar esta demanda.</p>
          <Button asChild variant="outline" size="sm">
            <Link to="/painel/demandas">Voltar</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild size="icon" variant="outline">
            <Link to="/painel/demandas">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">{c.name}</h1>
              <Badge variant="outline" className={STAGE_CLASS[stage]}>
                {STAGE_LABEL[stage]}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Criada em {fmt(c.created_at)} · {num(c.total_recipients)} destinatários
              {(data as any).list_name ? ` · Lista: ${(data as any).list_name}` : ""}
              {(data as any).template_name ? ` · Template: ${(data as any).template_name}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={exportMetrics}>
            <Download className="mr-1.5 h-4 w-4" /> Métricas CSV
          </Button>
          <Button size="sm" variant="outline" onClick={exportClicks}>
            <MousePointerClick className="mr-1.5 h-4 w-4" /> Cliques CSV
          </Button>
          <Button size="sm" variant="outline" onClick={exportHistory}>
            <Clock className="mr-1.5 h-4 w-4" /> Histórico CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <BarChart3 className="mr-1.5 h-4 w-4" /> PDF
          </Button>
          <Button asChild size="sm">
            <Link to="/painel/campanhas/nova" search={{ duplicate: c.id }}>
              <Copy className="mr-1.5 h-4 w-4" /> Duplicar
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {c.external_finished_at || stage === "completed" ? "Resultado da campanha" : "Andamento da campanha"} · {m.pct}%
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${m.pct}%` }} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Metric icon={<Send className="h-4 w-4 text-emerald-600" />} value={num(m.sent)} label="Enviados com sucesso" />
            <Metric icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} value={num(m.delivered)} label="Entregues" />
            <Metric icon={<XCircle className="h-4 w-4 text-destructive" />} value={num(m.failed)} label="Falhas" />
            <Metric icon={<Clock className="h-4 w-4 text-muted-foreground" />} value={num(m.pending)} label="Pendentes" />
            <Metric icon={<Users className="h-4 w-4 text-muted-foreground" />} value={num(m.total)} label="Destinatários" />
          </div>
          <p className="text-[11px] text-muted-foreground">Última atualização: {fmt(m.updatedAt)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Activity className="h-4 w-4" /> Desempenho do envio
            {workers.active && (
              <span className="flex items-center gap-1 text-[11px] font-normal text-emerald-600">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> ao vivo
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {workers.active ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Metric icon={<Gauge className="h-4 w-4" />} value={String(workers.workers)} label="Workers ativos" />
              <Metric icon={<Send className="h-4 w-4" />} value={`${workers.mps}/s`} label="Velocidade" />
              <Metric icon={<Activity className="h-4 w-4" />} value={String(workers.in_flight)} label="Em processamento" />
              <Metric icon={<Clock className="h-4 w-4" />} value={`${workers.latency_ms} ms`} label="Latência média" />
              <Metric
                icon={<CalendarDays className="h-4 w-4" />}
                value={workers.eta_seconds ? `${Math.ceil(workers.eta_seconds / 60)} min` : "—"}
                label="Tempo estimado"
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhum worker em atividade no momento para esta demanda.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <MousePointerClick className="h-4 w-4" /> Cliques no link
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Metric icon={<MousePointerClick className="h-4 w-4" />} value={num((data as any).clicks_total)} label="Cliques" />
              <Metric icon={<Users className="h-4 w-4" />} value={num((data as any).clicks_unique)} label="Pessoas únicas" />
            </div>
            <div className="space-y-1">
              {((data as any).clicks_by_day ?? []).slice(-7).map((d: any) => (
                <div key={d.day} className="flex items-center gap-2 text-xs">
                  <span className="w-20 text-muted-foreground">{d.day.split("-").reverse().join("/")}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${Math.min(100, (d.total / Math.max(1, (data as any).clicks_total)) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="w-10 text-right tabular-nums">{num(d.total)}</span>
                </div>
              ))}
              {!((data as any).clicks_by_day ?? []).length && (
                <p className="text-sm text-muted-foreground">Nenhum clique registrado ainda.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4" /> Histórico
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {((data as any).timeline ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem eventos registrados.</p>
            ) : (
              ((data as any).timeline ?? []).map((e: any) => (
                <div key={e.id} className="flex gap-3 border-l-2 border-muted pl-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{ACTION_LABEL[e.action] ?? e.action}</p>
                    {e.message && <p className="truncate text-xs text-muted-foreground">{e.message}</p>}
                    <p className="text-[11px] text-muted-foreground">{fmt(e.created_at)}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
