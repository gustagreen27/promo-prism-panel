import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ArrowLeft, Play, Pause, XCircle, RefreshCw, Copy, Download, Printer, ListRestart, Loader2,
  Users, Send, CheckCircle2, Eye, MessageSquare, Ban, TrendingUp, Clock, AlertTriangle, Activity,
} from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { getWaCampaign } from "@/lib/wa-campaigns.functions";
import {
  getCampaignProgress, getCampaignTimeline, getCampaignRecipients,
  getCampaignFinalReport, getCampaignErrors,
  startCampaignAsync, pauseCampaignAsync, resumeCampaignAsync, cancelCampaignAsync,
  retryFailedRecipients, duplicateCampaign, preflightCampaign,
} from "@/lib/wa-campaign-runner.functions";

export const Route = createFileRoute("/_authenticated/admin/whatsapp-campanhas/$id")({
  head: () => ({ meta: [{ title: "Campanha WhatsApp" }] }),
  component: Page,
});

function fmtDur(ms: number) {
  if (!ms || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function fmtDate(v?: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleString("pt-BR");
}

function Page() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();

  const getCamp = useServerFn(getWaCampaign);
  const getProg = useServerFn(getCampaignProgress);
  const getTL = useServerFn(getCampaignTimeline);
  const getRec = useServerFn(getCampaignRecipients);
  const getReport = useServerFn(getCampaignFinalReport);
  const getErrs = useServerFn(getCampaignErrors);

  const { data: camp } = useQuery({
    queryKey: ["wa-camp", id],
    queryFn: () => getCamp({ data: { id } }),
  });

  const { data: prog } = useQuery({
    queryKey: ["wa-camp-progress", id],
    queryFn: () => getProg({ data: { id } }),
    refetchInterval: (q) => {
      const s = (q.state.data as any)?.status;
      return s === "running" || s === "scheduled" ? 3000 : false;
    },
  });

  const { data: timeline } = useQuery({
    queryKey: ["wa-camp-timeline", id],
    queryFn: () => getTL({ data: { id, limit: 200 } }),
    refetchInterval: 10000,
  });

  const { data: recipients } = useQuery({
    queryKey: ["wa-camp-recipients", id],
    queryFn: () => getRec({ data: { id, limit: 500 } }),
    refetchInterval: 8000,
  });

  const { data: errors } = useQuery({
    queryKey: ["wa-camp-errors", id],
    queryFn: () => getErrs({ data: { id } }),
  });

  const { data: report } = useQuery({
    queryKey: ["wa-camp-report", id],
    queryFn: () => getReport({ data: { id } }),
  });

  const startFn = useServerFn(startCampaignAsync);
  const pauseFn = useServerFn(pauseCampaignAsync);
  const resumeFn = useServerFn(resumeCampaignAsync);
  const cancelFn = useServerFn(cancelCampaignAsync);
  const retryFn = useServerFn(retryFailedRecipients);
  const dupFn = useServerFn(duplicateCampaign);
  const preflight = useServerFn(preflightCampaign);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["wa-camp", id] });
    qc.invalidateQueries({ queryKey: ["wa-camp-progress", id] });
    qc.invalidateQueries({ queryKey: ["wa-camp-timeline", id] });
    qc.invalidateQueries({ queryKey: ["wa-camp-recipients", id] });
    qc.invalidateQueries({ queryKey: ["wa-camp-errors", id] });
    qc.invalidateQueries({ queryKey: ["wa-camp-report", id] });
  };

  // Realtime: escuta alterações de campanha, destinatários e timeline
  useEffect(() => {
    const channel = supabase
      .channel(`wa-camp-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wa_campaigns", filter: `id=eq.${id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["wa-camp", id] });
          qc.invalidateQueries({ queryKey: ["wa-camp-progress", id] });
          qc.invalidateQueries({ queryKey: ["wa-camp-report", id] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "campaign_recipients", filter: `campaign_id=eq.${id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["wa-camp-recipients", id] });
          qc.invalidateQueries({ queryKey: ["wa-camp-progress", id] });
          qc.invalidateQueries({ queryKey: ["wa-camp-errors", id] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "campaign_timeline", filter: `campaign_id=eq.${id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["wa-camp-timeline", id] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, qc]);

  const m = {
    start: useMutation({
      mutationFn: async () => {
        const check = await preflight({ data: { id } });
        if (!check.ok) {
          const failed = check.checks.filter((c: any) => !c.ok).map((c: any) => c.label).join(", ");
          throw new Error(`Preflight falhou: ${failed}`);
        }
        return startFn({ data: { id } });
      },
      onSuccess: () => { toast.success("Campanha iniciada"); invalidate(); },
      onError: (e: any) => toast.error(e?.message ?? "Erro ao iniciar"),
    }),
    pause: useMutation({
      mutationFn: () => pauseFn({ data: { id } }),
      onSuccess: () => { toast.success("Campanha pausada"); invalidate(); },
    }),
    resume: useMutation({
      mutationFn: () => resumeFn({ data: { id } }),
      onSuccess: () => { toast.success("Campanha retomada"); invalidate(); },
    }),
    cancel: useMutation({
      mutationFn: () => cancelFn({ data: { id } }),
      onSuccess: () => { toast.success("Campanha cancelada"); invalidate(); },
    }),
    retry: useMutation({
      mutationFn: () => retryFn({ data: { id } }),
      onSuccess: (r: any) => { toast.success(`${r.count} falhas reenfileiradas`); invalidate(); },
    }),
    dup: useMutation({
      mutationFn: () => dupFn({ data: { id } }),
      onSuccess: (r: any) => { toast.success("Campanha duplicada"); nav({ to: "/admin/whatsapp-campanhas/$id", params: { id: r.id } }); },
    }),
  };

  const p = (prog?.progress as any) ?? {};
  const total = p.total ?? camp?.total_recipients ?? 0;
  const percent = p.percent ?? 0;
  const status = (prog?.status ?? camp?.status ?? "draft") as string;
  const isRunning = status === "running";
  const isPaused = status === "paused";
  const isFinished = ["completed", "partial", "cancelled", "error"].includes(status);

  const exportCsv = () => {
    if (!recipients?.length) { toast.warning("Sem dados"); return; }
    const rows = recipients as any[];
    const header = ["phone","nome","status","tentativas","enviada","entregue","lida","respondida","erro"];
    const csv = [header.join(","), ...rows.map((r: any) => [
      r.phone, r.contact?.name ?? "", r.status, r.attempt ?? 0,
      r.sent_at ?? "", r.delivered_at ?? "", r.read_at ?? "", r.replied_at ?? "",
      (r.failed_reason ?? "").replace(/,/g, ";"),
    ].join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `campanha-${id}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={camp?.name ?? "Campanha"}
        description={
          [(camp as any)?.client?.name, (camp as any)?.template?.name && `Template ${(camp as any).template.name}`]
            .filter(Boolean).join(" • ") || undefined
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/whatsapp-campanhas"><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Link>
            </Button>
            {!isRunning && !isPaused && !isFinished && (
              <Button size="sm" onClick={() => m.start.mutate()} disabled={m.start.isPending}>
                {m.start.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                Iniciar
              </Button>
            )}
            {isRunning && (
              <Button size="sm" variant="outline" onClick={() => m.pause.mutate()}>
                <Pause className="mr-2 h-4 w-4" />Pausar
              </Button>
            )}
            {isPaused && (
              <Button size="sm" onClick={() => m.resume.mutate()}>
                <Play className="mr-2 h-4 w-4" />Retomar
              </Button>
            )}
            {(isRunning || isPaused) && (
              <Button size="sm" variant="outline" onClick={() => m.cancel.mutate()}>
                <XCircle className="mr-2 h-4 w-4" />Cancelar
              </Button>
            )}
            {(isFinished || isPaused) && (p.failed ?? 0) > 0 && (
              <Button size="sm" variant="outline" onClick={() => m.retry.mutate()}>
                <RefreshCw className="mr-2 h-4 w-4" />Reprocessar falhas
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => m.dup.mutate()}>
              <Copy className="mr-2 h-4 w-4" />Duplicar
            </Button>
          </div>
        }
      />

      {/* Progress hero */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-2xl font-semibold tabular-nums">
              {(total - (p.pending ?? 0) - (p.processing ?? 0)).toLocaleString("pt-BR")} <span className="text-muted-foreground text-base font-normal">de {total.toLocaleString("pt-BR")} processadas</span>
            </div>
            <div className="text-3xl font-bold tabular-nums text-primary">{Number(percent).toFixed(1)}%</div>
          </div>
          <Progress value={Number(percent)} className="h-3" />
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
            {prog?.avg_speed_per_min != null && (
              <div className="flex items-center gap-1"><TrendingUp className="h-4 w-4" /> {Number(prog.avg_speed_per_min).toFixed(1)} msg/min</div>
            )}
            {(prog as any)?.eta_minutes != null && (
              <div className="flex items-center gap-1"><Clock className="h-4 w-4" /> ETA ~{(prog as any).eta_minutes} min</div>
            )}
            {prog?.last_sent_at && (
              <div className="flex items-center gap-1"><Activity className="h-4 w-4" /> Último envio {fmtDate(prog.last_sent_at)}</div>
            )}
            {prog?.last_error && (
              <div className="flex items-center gap-1 text-red-600"><AlertTriangle className="h-4 w-4" /> {prog.last_error}</div>
            )}
            {(camp as any)?.pause_reason && (
              <div className="flex items-center gap-1 text-amber-600">
                <AlertTriangle className="h-4 w-4" />
                {(camp as any).pause_reason === "quiet_hours" && "Aguardando fim da janela de silêncio"}
                {(camp as any).pause_reason === "quota_reached" && "Cota (hora/dia) atingida — retomará no próximo ciclo"}
                {(camp as any).pause_reason === "failure_rate" && "Auto-pausada por taxa de falha elevada"}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Stat icon={Users} label="Total" value={total} tone="neutral" />
        <Stat icon={Send} label="Enviadas" value={p.sent ?? 0} tone="info" />
        <Stat icon={CheckCircle2} label="Entregues" value={p.delivered ?? 0} tone="success" />
        <Stat icon={Eye} label="Lidas" value={p.read ?? 0} tone="success" />
        <Stat icon={MessageSquare} label="Respostas" value={p.replied ?? 0} tone="primary" />
        <Stat icon={XCircle} label="Falhas" value={p.failed ?? 0} tone="danger" />
        <Stat icon={Ban} label="Opt-out" value={p.opt_out ?? 0} tone="warning" />
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="recipients">Destinatários</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="errors">Erros</TabsTrigger>
          <TabsTrigger value="financial">Financeiro</TabsTrigger>
          <TabsTrigger value="report">Relatório final</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Configuração</CardTitle></CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-2 text-sm">
              <KV k="Cliente" v={(camp as any)?.client?.name ?? "—"} />
              <KV k="Projeto" v={(camp as any)?.project?.name ?? "—"} />
              <KV k="Template" v={(camp as any)?.template?.name ?? "—"} />
              <KV k="Idioma" v={(camp as any)?.template?.language ?? "—"} />
              <KV k="Número" v={(camp as any)?.connection?.display_phone ?? (camp as any)?.connection?.name ?? "—"} />
              <KV k="Taxa (msg/min)" v={String(camp?.send_rate_per_min ?? 30)} />
              <KV k="Iniciada em" v={fmtDate(camp?.started_at)} />
              <KV k="Finalizada em" v={fmtDate(camp?.finished_at)} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recipients" className="space-y-3">
          <div className="flex justify-between items-center">
            <div className="text-sm text-muted-foreground">{recipients?.length ?? 0} destinatários</div>
            <Button size="sm" variant="outline" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />Exportar CSV</Button>
          </div>
          <Card>
            <CardContent className="p-0 overflow-auto max-h-[600px]">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-left">
                    <th className="p-2 font-medium">Telefone</th>
                    <th className="p-2 font-medium">Nome</th>
                    <th className="p-2 font-medium">Status</th>
                    <th className="p-2 font-medium">Enviada</th>
                    <th className="p-2 font-medium">Entregue</th>
                    <th className="p-2 font-medium">Lida</th>
                    <th className="p-2 font-medium">Erro</th>
                  </tr>
                </thead>
                <tbody>
                  {(recipients ?? []).map((r: any) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-2 font-mono text-xs">{r.phone}</td>
                      <td className="p-2">{r.contact?.name ?? "—"}</td>
                      <td className="p-2"><StatusBadge status={r.status} /></td>
                      <td className="p-2 text-xs text-muted-foreground">{r.sent_at ? new Date(r.sent_at).toLocaleTimeString("pt-BR") : "—"}</td>
                      <td className="p-2 text-xs text-muted-foreground">{r.delivered_at ? new Date(r.delivered_at).toLocaleTimeString("pt-BR") : "—"}</td>
                      <td className="p-2 text-xs text-muted-foreground">{r.read_at ? new Date(r.read_at).toLocaleTimeString("pt-BR") : "—"}</td>
                      <td className="p-2 text-xs text-red-600 truncate max-w-[240px]">{r.failed_reason ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline" className="space-y-3">
          <Card>
            <CardContent className="p-4 space-y-3 max-h-[600px] overflow-auto">
              {(timeline ?? []).map((ev: any) => (
                <div key={ev.id} className="flex gap-3 text-sm border-l-2 border-primary/30 pl-3">
                  <div className="text-xs text-muted-foreground w-32 shrink-0">{fmtDate(ev.created_at)}</div>
                  <div className="flex-1">
                    <div className="font-medium">{ev.message}</div>
                    <div className="text-xs text-muted-foreground">{ev.event_type}</div>
                  </div>
                </div>
              ))}
              {!timeline?.length && <div className="text-sm text-muted-foreground">Sem eventos</div>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="errors" className="space-y-3">
          <Card>
            <CardContent className="p-0 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50"><tr className="text-left">
                  <th className="p-2">Código</th><th className="p-2">Motivo</th><th className="p-2">Ocorrências</th><th className="p-2">Exemplos</th>
                </tr></thead>
                <tbody>
                  {(errors ?? []).map((e: any, i: number) => (
                    <tr key={i} className="border-t">
                      <td className="p-2 font-mono text-xs">{e.code || "—"}</td>
                      <td className="p-2">{e.reason || "—"}</td>
                      <td className="p-2 font-semibold">{e.count}</td>
                      <td className="p-2 text-xs text-muted-foreground">{e.samples.join(", ")}</td>
                    </tr>
                  ))}
                  {!errors?.length && <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">Sem erros registrados</td></tr>}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="financial" className="space-y-3">
          <Card><CardContent className="pt-6 grid gap-3 md:grid-cols-3 text-sm">
            <KV k="Custo estimado" v={`R$ ${Number(camp?.estimated_cost ?? 0).toFixed(2)}`} />
            <KV k="Mensagens entregues" v={String(p.delivered ?? 0)} />
            <KV k="Custo por entregue" v={p.delivered ? `R$ ${(Number(camp?.estimated_cost ?? 0) / p.delivered).toFixed(4)}` : "—"} />
            <KV k="Respostas" v={String(p.replied ?? 0)} />
            <KV k="Custo por resposta" v={p.replied ? `R$ ${(Number(camp?.estimated_cost ?? 0) / p.replied).toFixed(4)}` : "—"} />
            <KV k="Estoque consumido" v={String(p.sent ?? 0)} />
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="report" className="space-y-3">
          {(report as any)?.final_report ? (
            <FinalReport report={(report as any).final_report} onPrint={() => window.print()} onExport={exportCsv} />
          ) : (
            <Card><CardContent className="pt-6 text-center text-muted-foreground">
              Relatório final estará disponível quando a campanha for concluída.
            </CardContent></Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number; tone: string }) {
  const toneClass: Record<string, string> = {
    success: "text-emerald-600 bg-emerald-50",
    danger: "text-red-600 bg-red-50",
    warning: "text-amber-600 bg-amber-50",
    info: "text-sky-600 bg-sky-50",
    primary: "text-blue-600 bg-blue-50",
    neutral: "text-muted-foreground bg-muted",
  };
  return (
    <Card><CardContent className="pt-5 pb-4">
      <div className={`inline-flex items-center justify-center h-8 w-8 rounded-lg ${toneClass[tone]}`}><Icon className="h-4 w-4" /></div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{Number(value).toLocaleString("pt-BR")}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </CardContent></Card>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between border-b py-1.5">
      <div className="text-muted-foreground">{k}</div>
      <div className="font-medium text-right">{v}</div>
    </div>
  );
}

function FinalReport({ report, onPrint, onExport }: { report: any; onPrint: () => void; onExport: () => void }) {
  const s = report.summary ?? {};
  const m = report.metrics ?? {};
  const f = report.financials ?? {};
  return (
    <div className="space-y-4 print:space-y-2">
      <Card><CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{s.name} — Relatório final</CardTitle>
        <div className="flex gap-2 print:hidden">
          <Button size="sm" variant="outline" onClick={onExport}><Download className="mr-2 h-4 w-4" />CSV</Button>
          <Button size="sm" variant="outline" onClick={onPrint}><Printer className="mr-2 h-4 w-4" />Imprimir</Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2 md:grid-cols-2 text-sm">
        <KV k="Cliente" v={s.client ?? "—"} />
        <KV k="Projeto" v={s.project ?? "—"} />
        <KV k="Número" v={s.connection ?? "—"} />
        <KV k="WABA" v={s.waba ?? "—"} />
        <KV k="Template" v={`${s.template ?? "—"} (${s.language ?? "—"})`} />
        <KV k="Iniciada" v={fmtDate(s.started_at)} />
        <KV k="Finalizada" v={fmtDate(s.finished_at)} />
        <KV k="Duração" v={fmtDur(s.duration_ms ?? 0)} />
      </CardContent></Card>

      <Card><CardHeader><CardTitle className="text-base">Métricas</CardTitle></CardHeader>
      <CardContent className="grid gap-2 md:grid-cols-3 text-sm">
        <KV k="Total" v={m.total} />
        <KV k="Enviadas" v={m.sent} />
        <KV k="Entregues" v={m.delivered} />
        <KV k="Lidas" v={m.read} />
        <KV k="Respostas" v={m.replied} />
        <KV k="Falhas" v={m.failed} />
        <KV k="Taxa de entrega" v={`${m.delivery_rate}%`} />
        <KV k="Taxa de leitura" v={`${m.read_rate}%`} />
        <KV k="Taxa de falha" v={`${m.failure_rate}%`} />
        <KV k="Taxa de resposta" v={`${m.response_rate}%`} />
        <KV k="Taxa de opt-out" v={`${m.optout_rate}%`} />
      </CardContent></Card>

      <Card><CardHeader><CardTitle className="text-base">Financeiro</CardTitle></CardHeader>
      <CardContent className="grid gap-2 md:grid-cols-3 text-sm">
        <KV k="Custo estimado" v={`R$ ${Number(f.estimated_cost ?? 0).toFixed(2)}`} />
        <KV k="Custo por entregue" v={`R$ ${Number(f.cost_per_delivered ?? 0).toFixed(4)}`} />
        <KV k="Custo por resposta" v={`R$ ${Number(f.cost_per_reply ?? 0).toFixed(4)}`} />
      </CardContent></Card>

      {(report.errors ?? []).length > 0 && (
        <Card><CardHeader><CardTitle className="text-base">Erros</CardTitle></CardHeader>
        <CardContent><table className="w-full text-sm"><thead className="bg-muted/50"><tr className="text-left">
          <th className="p-2">Código</th><th className="p-2">Quantidade</th></tr></thead>
          <tbody>{report.errors.map((e: any, i: number) => (
            <tr key={i} className="border-t"><td className="p-2 font-mono text-xs">{e.code}</td><td className="p-2">{e.count}</td></tr>
          ))}</tbody></table></CardContent></Card>
      )}
    </div>
  );
}
