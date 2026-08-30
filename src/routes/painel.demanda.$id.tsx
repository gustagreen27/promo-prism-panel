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

const ACTION_INFO: Record<string, { title: string; desc: string }> = {
  "approval.approved": { title: "Disparo aprovado", desc: "O disparo foi revisado e aprovado pelo administrador." },
  "approval.rejected": { title: "Disparo rejeitado", desc: "O disparo foi rejeitado pelo administrador." },
  "approval.requested": { title: "Enviado para aprovação", desc: "A campanha foi enviada para análise do administrador." },
  "external.progress": { title: "Progresso atualizado", desc: "As informações de progresso do disparo foram atualizadas." },
  "campaign.created": { title: "Campanha criada", desc: "A campanha foi criada e enviada para aprovação." },
  "campaign.started": { title: "Disparo iniciado", desc: "O envio das mensagens foi iniciado." },
  "campaign.completed": { title: "Disparo finalizado", desc: "O envio das mensagens foi concluído." },
  created: { title: "Campanha criada", desc: "A campanha foi criada e enviada para aprovação." },
  queued: { title: "Adicionado à fila de envio", desc: "O disparo foi adicionado à fila de processamento." },
  rescheduled: { title: "Disparo reagendado", desc: "A data e o horário do disparo foram atualizados." },
  "demand.configured": { title: "BM configurada", desc: "A infraestrutura de envio foi configurada para este disparo." },
};

type ConnInfo = { label: string | null; phone: string | null; waba_name: string | null } | null;

function eventInfo(action: string, conn: ConnInfo) {
  const info = ACTION_INFO[action] ?? { title: "Atualização do disparo", desc: "O disparo foi atualizado." };
  if (action === "demand.configured" && conn) {
    const bm = conn.waba_name ?? conn.label;
    if (bm) return { title: info.title, desc: `A BM ${bm} foi configurada para este disparo.` };
  }
  return info;
}

const fmtHist = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR")}`;
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
      ["Campanha", "Status", "Criada em", "Agendada", "Lista", "Template", "Destinatários", "Enviados", "Entregues", "Falhas", "Pendentes"],
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
      ],
    ]);
  }

  function exportHistory() {
    const t = ((data as any)?.timeline ?? []) as any[];
    downloadCsv(`disparo-${c?.name ?? id}-historico.csv`, [
      ["Data", "Evento", "Detalhe"],
      ...t.map((e) => {
        const info = eventInfo(e.action, (data as any)?.connection ?? null);
        return [fmtHist(e.created_at), info.title, info.desc];
      }),
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

      {stage === "scheduled" ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CalendarDays className="h-4 w-4" /> Agendamento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-700">
              <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Envio programado para {fmt(c.scheduled_at)}. A execução e as métricas só começam nesse horário.
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Metric
                icon={<CalendarDays className="h-4 w-4 text-muted-foreground" />}
                value={fmt(c.scheduled_at)}
                label="Data e horário programados"
              />
              <Metric
                icon={<Users className="h-4 w-4 text-muted-foreground" />}
                value={num(m.total || c.total_recipients)}
                label="Total de contatos"
              />
              <Metric
                icon={<Clock className="h-4 w-4 text-muted-foreground" />}
                value={fmt(c.created_at)}
                label="Criada em"
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {c.external_finished_at || stage === "completed" ? "Resultado da campanha" : "Andamento da campanha"} ·{" "}
                {m.pct}%
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
        </>
      )}


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
            ((data as any).timeline ?? []).map((e: any) => {
              const info = eventInfo(e.action, (data as any)?.connection ?? null);
              return (
                <div key={e.id} className="flex gap-3 border-l-2 border-muted pl-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{info.title}</p>
                    <p className="text-xs text-muted-foreground">{info.desc}</p>
                    <p className="text-[11px] text-muted-foreground">{fmtHist(e.created_at)}</p>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
