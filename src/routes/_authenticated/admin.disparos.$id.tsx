import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ArrowLeft, Play, Pause, XCircle, RefreshCw, Copy, Download, Printer, ListRestart, Loader2,
  Users, Send, CheckCircle2, Eye, MessageSquare, Ban, TrendingUp, Clock, AlertTriangle, Activity, Replace, MousePointerClick, Gauge,
} from "lucide-react";
import { PreflightDialog } from "@/components/admin/preflight-dialog";
import { SwapConfigDialog } from "@/components/admin/SwapConfigDialog";
import { SpeedControlDialog } from "@/components/admin/SpeedControlDialog";
import { PageHeader } from "@/components/admin/page-header";
import { ErrorCard } from "@/components/admin/query-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { getWaCampaign, clearCampaignFatalLock } from "@/lib/wa-campaigns.functions";
import { DispatchPerformancePanel } from "@/components/admin/dispatch-performance-panel";
import {
  getCampaignProgress, getCampaignTimeline, getCampaignRecipients,
  getCampaignFinalReport, getCampaignErrors, getRecipientPreviews,
  startCampaignAsync, pauseCampaignAsync, resumeCampaignAsync, cancelCampaignAsync,
  retryFailedRecipients, duplicateCampaign, preflightCampaign, unstickCampaignAsync,
} from "@/lib/wa-campaign-runner.functions";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { WhatsAppPreview } from "@/components/campaigns/wizard/WhatsAppPreview";
import { renderMapping, fillMetaTemplate, buildContext } from "@/lib/wa-variables";
import { formatCallingCode, formatPhoneDisplay, summarizeCallingCodes } from "@/lib/phone-country";

export const Route = createFileRoute("/_authenticated/admin/disparos/$id")({
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
  const getPrev = useServerFn(getRecipientPreviews);
  const [previewSearch, setPreviewSearch] = useState("");
  const [swapOpen, setSwapOpen] = useState(false);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [showPreflight, setShowPreflight] = useState(false);

  const campQ = useQuery({
    queryKey: ["wa-camp", id],
    queryFn: () => getCamp({ data: { id } }),
  });
  const { data: camp } = campQ;

  const progQ = useQuery({
    queryKey: ["wa-camp-progress", id],
    queryFn: () => getProg({ data: { id } }),
    // Frente 4: reduzir polling (3s → 8s) durante disparos; progress é linha única, barato mas soma com 1M UPDATEs no runner.
    refetchInterval: (q) => {
      const s = (q.state.data as any)?.status;
      return s === "running" || s === "scheduled" ? 8000 : false;
    },
    refetchIntervalInBackground: false,
  });
  const { data: prog } = progQ;

  const timelineQ = useQuery({
    queryKey: ["wa-camp-timeline", id],
    queryFn: () => getTL({ data: { id, limit: 200 } }),
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });
  const { data: timeline } = timelineQ;

  const recipientsQ = useQuery({
    queryKey: ["wa-camp-recipients", id],
    queryFn: () => getRec({ data: { id, limit: 500 } }),
    // Frente 4: destinatários são a query mais cara — refetch mais espaçado, só com aba visível.
    refetchInterval: (q) => {
      const s = (progQ.data as any)?.status;
      if (s === "running") return 20000;
      const rows = (q.state.data as any[] | undefined) ?? [];
      const TERMINAL = new Set(["read", "replied", "failed", "opt_out", "cancelled", "skipped"]);
      const hasPending = rows.some((r) => !TERMINAL.has(String(r?.status ?? "")));
      if (hasPending && (s === "completed" || s === "paused" || s === "scheduled")) {
        return 45000;
      }
      return false;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    staleTime: 15000,
  });
  const { data: recipients } = recipientsQ;

  const errorsQ = useQuery({
    queryKey: ["wa-camp-errors", id],
    queryFn: () => getErrs({ data: { id } }),
  });
  const { data: errors } = errorsQ;

  const reportQ = useQuery({
    queryKey: ["wa-camp-report", id],
    queryFn: () => getReport({ data: { id } }),
  });
  const { data: report } = reportQ;

  const previewsQ = useQuery({
    queryKey: ["wa-camp-previews", id],
    queryFn: () => getPrev({ data: { id } }),
  });
  const { data: previews } = previewsQ;

  const startFn = useServerFn(startCampaignAsync);
  const pauseFn = useServerFn(pauseCampaignAsync);
  const resumeFn = useServerFn(resumeCampaignAsync);
  const cancelFn = useServerFn(cancelCampaignAsync);
  const retryFn = useServerFn(retryFailedRecipients);
  const dupFn = useServerFn(duplicateCampaign);
  const preflight = useServerFn(preflightCampaign);
  const unstickFn = useServerFn(unstickCampaignAsync);

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
    // Throttle: recipients tables can fire thousands of row events during a run.
    let recipTimer: ReturnType<typeof setTimeout> | null = null;
    let tlTimer: ReturnType<typeof setTimeout> | null = null;
    const throttleRecipients = () => {
      if (recipTimer) return;
      recipTimer = setTimeout(() => {
        recipTimer = null;
        qc.invalidateQueries({ queryKey: ["wa-camp-recipients", id] });
        qc.invalidateQueries({ queryKey: ["wa-camp-progress", id] });
        qc.invalidateQueries({ queryKey: ["wa-camp-errors", id] });
      }, 6000);
    };
    const throttleTimeline = () => {
      if (tlTimer) return;
      tlTimer = setTimeout(() => {
        tlTimer = null;
        qc.invalidateQueries({ queryKey: ["wa-camp-timeline", id] });
      }, 5000);
    };
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
        throttleRecipients,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "campaign_timeline", filter: `campaign_id=eq.${id}` },
        throttleTimeline,
      )
      .subscribe();
    return () => {
      if (recipTimer) clearTimeout(recipTimer);
      if (tlTimer) clearTimeout(tlTimer);
      supabase.removeChannel(channel);
    };
  }, [id, qc]);

  const clearLockFn = useServerFn(clearCampaignFatalLock);
  const unlockMut = useMutation({
    mutationFn: () => clearLockFn({ data: { id } }),
    onSuccess: () => { toast.success("Trava crítica removida — revise a conta antes de retomar"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao liberar"),
  });

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
      onSuccess: (r: any) => {
        toast.success("Campanha submetida com sucesso — processamento em alta velocidade", {
          description: r?.queued
            ? `${Number(r.queued).toLocaleString("pt-BR")} destinatários enfileirados · ${r.workerLanes ?? 1} workers paralelos`
            : undefined,
        });
        invalidate();
      },

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
      onSuccess: (r: any) => {
        toast.success(`${r.count} falhas reenfileiradas · campanha retomada`);
        invalidate();
      },
      onError: (e: any) => toast.error(e?.message ?? "Erro ao reprocessar falhas"),
    }),
    dup: useMutation({
      mutationFn: () => dupFn({ data: { id } }),
      onSuccess: (r: any) => { toast.success("Campanha duplicada"); nav({ to: "/admin/disparos/$id", params: { id: r.id } }); },
    }),
    unstick: useMutation({
      mutationFn: () => unstickFn({ data: { id } }),
      onSuccess: (r: any) => {
        toast.success(
          `Destravada · ${r.reenqueued} reenfileirados · ${r.pending} pendentes${r.status ? ` · ${r.status}` : ""}`,
        );
        invalidate();
      },
      onError: (e: any) => toast.error(e?.message ?? "Erro ao destravar"),
    }),
  };

  const rawP = (prog?.progress as any) ?? {};
  // Camada de apresentação: "Entregue" = mensagem aceita pela Meta, ou seja,
  // tudo que foi enviado sem falha (independente de callback de entrega).
  const p = useMemo(() => {
    const t = Number(rawP.total ?? camp?.total_recipients ?? 0) || 0;
    const sent = Number(rawP.sent ?? 0) || 0;
    const delivered = Number(rawP.delivered ?? 0) || 0;
    const read = Number(rawP.read ?? 0) || 0;
    const failed = Number(rawP.failed ?? 0) || 0;
    const proc = Number(rawP.processed ?? 0) || 0;
    const noCallbacks = delivered === 0 && read === 0 && sent > 0;
    const finished = t > 0 && proc >= t - Math.max(1, Math.round(t * 0.01));
    if (noCallbacks && finished) {
      return {
        ...rawP,
        sent: t,
        delivered: Math.max(0, t - failed),
        processed: t,
        pending: 0,
        processing: 0,
        percent: 100,
      };
    }
    // Aceito pela Meta: nunca menos do que enviados - falhas.
    const accepted = Math.max(0, sent - failed);
    return accepted > delivered ? { ...rawP, delivered: accepted } : rawP;
  }, [rawP, camp?.total_recipients]);
  const total = p.total ?? camp?.total_recipients ?? 0;
  const percent = p.percent ?? 0;
  const processed = p.processed ?? (total - (p.pending ?? 0) - (p.processing ?? 0));

  const status = (prog?.status ?? camp?.status ?? "draft") as string;
  const isRunning = status === "running";
  const senderPhone = (camp as any)?.connection?.display_phone ?? (camp as any)?.connection?.phone ?? null;
  const audienceSummary = useMemo(() => {
    const phones = (recipients as any[] | undefined)?.map((r: any) => r.phone).filter(Boolean) ?? [];
    return summarizeCallingCodes(phones);
  }, [recipients]);
  const audienceCodeLabel = audienceSummary.dominantCode
    ? `${formatCallingCode(audienceSummary.dominantCode)} (${audienceSummary.dominantCount.toLocaleString("pt-BR")} de ${audienceSummary.total.toLocaleString("pt-BR")} carregados)`
    : recipientsQ.isLoading
      ? "Carregando destinatários…"
      : "DDI não identificado";

  // Prévia renderizada para o 1º destinatário (substitui {nome}, {{1}} etc.)
  const previewForFirst = useMemo(() => {
    const tpl: any = (camp as any)?.template;
    if (!tpl) return null;
    const first: any = (recipients as any[] | undefined)?.[0];
    const contact = first?.contact ?? (first ? { phone: first.phone } : {});
    const ctx = buildContext({
      contact,
      client: (camp as any)?.client,
      project: (camp as any)?.project,
      campaign: camp,
    });
    // O motor lê camp.template_variables; variables_mapping é apenas legado.
    const tplVarsMap = ((camp as any)?.template_variables ?? {}) as Record<string, string>;
    const legacyVarsMap = ((camp as any)?.variables_mapping ?? {}) as Record<string, string>;
    const varsMap: Record<string, string> =
      Object.keys(tplVarsMap).length > 0 ? tplVarsMap : legacyVarsMap;
    const resolved: Record<number, string> = {};
    for (const [k, v] of Object.entries(varsMap)) {
      if (k.startsWith("_") || !/^\d+$/.test(k)) continue;
      resolved[Number(k)] = renderMapping(String(v ?? ""), ctx);
    }
    const body = fillMetaTemplate(String(tpl.body ?? ""), resolved);
    const headerText = tpl.header_type === "text"
      ? fillMetaTemplate(String(tpl.header_text ?? ""), resolved)
      : tpl.header_text;
    const buttons = Array.isArray(tpl.buttons)
      ? tpl.buttons.map((b: any) => {
          if (String(b?.type).toUpperCase() === "URL" && typeof b?.url === "string" && b.url.includes("{{")) {
            const btnMap = (varsMap as any)?._button_url ?? {};
            const urlResolved: Record<number, string> = {};
            for (const [k, v] of Object.entries(btnMap)) urlResolved[Number(k)] = renderMapping(String(v ?? ""), ctx);
            return { ...b, url: fillMetaTemplate(String(b.url), urlResolved) };
          }
          return b;
        })
      : [];
    // Espelha exatamente o motor de envio (wa-queue.server.ts):
    // a mídia vem SEMPRE de camp.template_variables._header_image_url.
    // Sem upload persistido não há envio — logo, a prévia também não mostra
    // a mídia aprovada do template.
    const campaignMedia = String(
      ((camp as any)?.template_variables as any)?._header_image_url ?? "",
    ).trim();
    const tplHeaderType = String(tpl.header_type ?? "").toLowerCase();
    const isMediaHeader = ["image", "video", "document"].includes(tplHeaderType);
    const mediaUrl = campaignMedia || null;
    const mediaBlocked = isMediaHeader && !campaignMedia;
    return {
      header: {
        type: campaignMedia ? (isMediaHeader ? tplHeaderType : "image") : tpl.header_type,
        text: headerText,
        media_url: mediaUrl,
      },
      mediaOrigin: campaignMedia ? ("campaign_upload" as const) : null,
      mediaBlocked,
      body,
      footer: tpl.footer_text,
      buttons,
      first,
    };
  }, [camp, recipients]);

  // Auditoria de mídia: o que está configurado na campanha vs o que a Meta recebeu
  const mediaAudit = useMemo(() => {
    const tpl: any = (camp as any)?.template;
    const vars: Record<string, any> = {
      ...(((camp as any)?.variables_mapping ?? {}) as any),
      ...(((camp as any)?.template_variables ?? {}) as any),
    };
    const configured = String(vars?._header_image_url ?? "").trim() || null;
    const templateMedia = tpl?.header_media_url ?? null;
    const events = ((timeline as any[] | undefined) ?? []).filter(
      (e: any) => e?.event_type === "media_audit",
    );
    const last = events[0] ?? null;
    return { configured, templateMedia, headerType: tpl?.header_type ?? null, events, last };
  }, [camp, timeline]);



  const isPaused = status === "paused";
  const isFinished = ["completed", "partial", "cancelled", "error"].includes(status);
  const canRetry = (isFinished || isPaused) && ((p.failed ?? 0) > 0 || (isPaused && (p.pending ?? 0) > 0));

  const exportCsv = async () => {
    try {
      toast.info("Preparando CSV com todos os destinatários…");
      const all = (await getRec({ data: { id, limit: 200000 } })) as any[];
      if (!all?.length) { toast.warning("Sem dados"); return; }
      const esc = (v: any) => {
        const s = v == null ? "" : String(v);
        return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const header = ["phone","nome","status","tentativas","enviada","entregue","lida","respondida","erro","error_code","wamid"];
      const csv = [header.join(","), ...all.map((r: any) => [
        r.phone, r.contact?.name ?? "", r.status, r.attempt ?? 0,
        r.sent_at ?? "", r.delivered_at ?? "", r.read_at ?? "", r.replied_at ?? "",
        r.failed_reason ?? "", r.error_code ?? "", r.meta_message_id ?? "",
      ].map(esc).join(","))].join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `campanha-${id}.csv`; a.click();
      URL.revokeObjectURL(url);
      toast.success(`CSV com ${all.length.toLocaleString("pt-BR")} destinatários baixado.`);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao exportar CSV");
    }
  };

  if (campQ.error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Campanha" actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/disparos"><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Link>
          </Button>
        } />
        <ErrorCard error={campQ.error} onRetry={() => campQ.refetch()} />
      </div>
    );
  }

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
              <Link to="/admin/disparos"><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Link>
            </Button>
            {!isRunning && !isPaused && !isFinished && (
              <Button size="sm" onClick={() => setShowPreflight(true)}>
                <Play className="mr-2 h-4 w-4" />
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
            {canRetry && (
              <Button size="sm" variant="outline" onClick={() => m.retry.mutate()} disabled={m.retry.isPending}>
                {m.retry.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Reprocessar falhas
              </Button>
            )}
            {(isRunning || isPaused || status === "error") && (
              <Button size="sm" variant="outline" onClick={() => m.unstick.mutate()} disabled={m.unstick.isPending}>
                {m.unstick.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Destravar fila
              </Button>
            )}
            {(isPaused || status === "error" || status === "failed" || isFinished) && (
              <Button size="sm" variant="secondary" onClick={() => setSwapOpen(true)}>
                <Replace className="mr-2 h-4 w-4" />Trocar número/template
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setSpeedOpen(true)}>
              <Gauge className="mr-2 h-4 w-4" />Velocidade
            </Button>
            <Button size="sm" variant="outline" onClick={() => m.dup.mutate()}>
              <Copy className="mr-2 h-4 w-4" />Duplicar
            </Button>
          </div>
        }
      />

      {(camp as any)?.fatal_locked && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
              <div>
                <p className="font-semibold text-destructive">
                  🔴 Pausada automaticamente — {(camp as any).fatal_error_message ?? "conta comercial bloqueada pela Meta"}
                </p>
                <p className="text-sm text-muted-foreground">
                  O disparo foi interrompido na primeira ocorrência do erro crítico
                  {(camp as any).fatal_error_code ? ` #${(camp as any).fatal_error_code}` : ""}. Os contatos reservados
                  voltaram para a fila e o reprocessamento automático está proibido. Troque de WABA/número ou libere
                  manualmente após resolver com a Meta.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setSwapOpen(true)}>
                <Replace className="mr-2 h-4 w-4" />Trocar número/template
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => unlockMut.mutate()}
                disabled={unlockMut.isPending}
              >
                {unlockMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Liberar manualmente
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Progress hero */}
      {progQ.error && <ErrorCard error={progQ.error} onRetry={() => progQ.refetch()} />}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-2xl font-semibold tabular-nums">
              {Number(processed).toLocaleString("pt-BR")} <span className="text-muted-foreground text-base font-normal">de {total.toLocaleString("pt-BR")} processadas</span>
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
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat icon={Users} label="Total" value={total} tone="neutral" />
        <Stat icon={Send} label="Enviadas" value={p.sent ?? 0} tone="info" />
        <Stat icon={CheckCircle2} label="Entregues" value={p.delivered ?? 0} tone="success" />
        <Stat icon={Eye} label="Lidas" value={p.read ?? 0} tone="success" />
        <Stat icon={MousePointerClick} label="Cliques" value={(prog as any)?.clicks ?? 0} tone="primary" />
        <Stat icon={MessageSquare} label="Respostas" value={p.replied ?? 0} tone="primary" />
        <Stat icon={XCircle} label="Falhas" value={p.failed ?? 0} tone="danger" />
        <Stat icon={Ban} label="Opt-out" value={p.opt_out ?? 0} tone="warning" />
      </div>

      <DispatchPerformancePanel
        campaignId={id}
        live={["running", "scheduled", "queued"].includes(String((prog as any)?.status ?? ""))}
      />



      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="recipients">Destinatários</TabsTrigger>
          <TabsTrigger value="previews">Prévias</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="errors">Erros</TabsTrigger>
          <TabsTrigger value="audit">Auditoria</TabsTrigger>
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
              <KV k="Número de envio" v={senderPhone ? formatPhoneDisplay(senderPhone) : ((camp as any)?.connection?.name ?? "—")} />
              <KV k="DDI dos destinatários" v={audienceCodeLabel} />
              <KV k="Taxa (msg/min)" v={String(camp?.send_rate_per_min ?? 30)} />
              <KV k="Lote por ciclo" v={String((camp as any)?.batch_size ?? 25)} />
              <KV k="Jitter" v={`${(camp as any)?.jitter_ms ?? 0} ms`} />
              <KV k="Máx. por hora" v={(camp as any)?.max_per_hour ? String((camp as any).max_per_hour) : "sem limite"} />
              <KV k="Máx. por dia" v={(camp as any)?.max_per_day ? String((camp as any).max_per_day) : "sem limite"} />
              <KV k="Janela silenciosa" v={(camp as any)?.quiet_hours_start && (camp as any)?.quiet_hours_end ? `${(camp as any).quiet_hours_start} – ${(camp as any).quiet_hours_end} (${(camp as any)?.timezone ?? "TZ"})` : "—"} />
              <KV k="Auto-pausa por falhas" v={(camp as any)?.abort_on_failure_rate ? `${Math.round((camp as any).abort_on_failure_rate * 100)}% após ${(camp as any).min_processed_for_abort ?? 50}` : "desativada"} />
              <KV k="Iniciada em" v={fmtDate(camp?.started_at)} />
              <KV k="Finalizada em" v={fmtDate(camp?.finished_at)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mídia do cabeçalho — origem e auditoria</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid gap-2 md:grid-cols-2">
                <KV
                  k="Vídeo/imagem associado à campanha"
                  v={mediaAudit.configured ? "Upload próprio da campanha" : "Nenhum upload — usa o do template"}
                />
                <KV k="Tipo de cabeçalho" v={String(mediaAudit.headerType ?? "—")} />
              </div>

              {mediaAudit.configured && (
                <div className="rounded-md border p-3 space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">URL do upload da campanha</div>
                  <a href={mediaAudit.configured} target="_blank" rel="noreferrer" className="break-all text-xs text-primary underline">
                    {mediaAudit.configured}
                  </a>
                </div>
              )}
              {mediaAudit.templateMedia && (
                <div className="rounded-md border p-3 space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Mídia aprovada do template</div>
                  <a href={mediaAudit.templateMedia} target="_blank" rel="noreferrer" className="break-all text-xs text-primary underline">
                    {mediaAudit.templateMedia}
                  </a>
                </div>
              )}

              <div className="rounded-md border p-3 space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Enviado no último disparo</div>
                {mediaAudit.last ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={mediaAudit.last.payload?.media_origin === "campaign_upload" ? "default" : "secondary"}>
                        {mediaAudit.last.payload?.media_origin === "campaign_upload"
                          ? "Upload da campanha"
                          : mediaAudit.last.payload?.media_origin === "template_media"
                            ? "Vídeo do template"
                            : "Sem mídia"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {mediaAudit.last.payload?.template_name ?? "—"} • {fmtDate(mediaAudit.last.created_at)}
                      </span>
                    </div>
                    {mediaAudit.last.payload?.media_url && (
                      <a href={mediaAudit.last.payload.media_url} target="_blank" rel="noreferrer" className="block break-all text-xs text-primary underline">
                        {mediaAudit.last.payload.media_url}
                      </a>
                    )}
                    {mediaAudit.configured &&
                      mediaAudit.last.payload?.media_url &&
                      mediaAudit.last.payload.media_url !== mediaAudit.configured && (
                        <div className="rounded bg-destructive/10 p-2 text-xs text-destructive">
                          Divergência: o disparo usou uma mídia diferente do upload configurado na campanha.
                        </div>
                      )}
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    Nenhum envio registrado ainda para esta campanha.
                  </div>
                )}
              </div>

              {mediaAudit.events.length > 0 && (
                <details className="rounded-md border p-3">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                    Log por combinação ({mediaAudit.events.length}) — payload enviado à Meta
                  </summary>
                  <div className="mt-3 space-y-3">
                    {mediaAudit.events.map((ev: any) => (
                      <div key={ev.id} className="space-y-1 border-t pt-2 first:border-t-0 first:pt-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Badge variant="outline">
                            {ev.payload?.media_origin === "campaign_upload" ? "upload" : ev.payload?.media_origin === "template_media" ? "template" : "sem mídia"}
                          </Badge>
                          <span className="text-muted-foreground">
                            {ev.payload?.template_name ?? "—"} • número {ev.payload?.connection_name ?? ev.payload?.phone_number_id ?? "—"} • {fmtDate(ev.created_at)}
                          </span>
                        </div>
                        <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-[11px] leading-relaxed">
{JSON.stringify(ev.payload?.meta_payload ?? ev.payload, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </CardContent>
          </Card>



          {previewForFirst && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Prévia da mensagem
                  {previewForFirst.first && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      1º destinatário: {previewForFirst.first.contact?.name ?? "—"}
                      {previewForFirst.first.phone ? ` • ${formatPhoneDisplay(previewForFirst.first.phone)}` : ""}
                    </span>
                  )}
                </CardTitle>
                {previewForFirst.mediaOrigin && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Badge variant={previewForFirst.mediaOrigin === "campaign_upload" ? "default" : "secondary"}>
                      {previewForFirst.mediaOrigin === "campaign_upload"
                        ? "Mídia: upload da campanha"
                        : "Mídia: vídeo/imagem do template"}
                    </Badge>
                    {previewForFirst.header.media_url && (
                      <a href={previewForFirst.header.media_url} target="_blank" rel="noreferrer"
                        className="truncate text-xs text-primary underline max-w-[420px]">
                        {previewForFirst.header.media_url}
                      </a>
                    )}
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <WhatsAppPreview
                  header={previewForFirst.header as any}
                  body={previewForFirst.body}
                  footer={previewForFirst.footer}
                  buttons={previewForFirst.buttons as any}
                  senderName={previewForFirst.first?.phone ? `Destinatário ${formatPhoneDisplay(previewForFirst.first.phone)}` : "Destinatário"}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>


        <TabsContent value="recipients" className="space-y-3">
          <div className="flex justify-between items-center">
            <div className="text-sm text-muted-foreground">
              {(recipients?.length ?? 0).toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")} destinatários carregados
            </div>
            <Button size="sm" variant="outline" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />Exportar CSV</Button>
          </div>
          {recipientsQ.error && <ErrorCard error={recipientsQ.error} onRetry={() => recipientsQ.refetch()} />}
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
                      <td className="p-2 font-mono text-xs">{formatPhoneDisplay(r.phone)}</td>
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

        <TabsContent value="previews" className="space-y-3">
          {previewsQ.error && <ErrorCard error={previewsQ.error} onRetry={() => previewsQ.refetch()} />}
          {!previewsQ.error && (() => {
            const all = (previews as any)?.previews ?? [];
            const q = previewSearch.trim().toLowerCase();
            const filtered = q
              ? all.filter((p: any) =>
                  (p.phone ?? "").toLowerCase().includes(q) ||
                  (p.name ?? "").toLowerCase().includes(q) ||
                  (p.body ?? "").toLowerCase().includes(q))
              : all;
            return (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm text-muted-foreground">
                    Prévia do texto renderizado para cada destinatário{" "}
                    {(previews as any)?.template?.name && (
                      <span>· Template <span className="font-mono">{(previews as any).template.name}</span></span>
                    )}
                    {all.length > 0 && (
                      <span> · {filtered.length.toLocaleString("pt-BR")} de {all.length.toLocaleString("pt-BR")} prévias carregadas</span>
                    )}
                  </div>
                  <Input
                    className="max-w-xs"
                    placeholder="Buscar por nome, telefone ou texto..."
                    value={previewSearch}
                    onChange={(e) => setPreviewSearch(e.target.value)}
                  />
                </div>
                {!all.length && (
                  <Card><CardContent className="pt-6 text-center text-muted-foreground text-sm">
                    Gere a fila de destinatários para visualizar as prévias.
                  </CardContent></Card>
                )}
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {filtered.slice(0, 60).map((p: any) => (
                    <Card key={p.recipient_id}>
                      <CardContent className="pt-4 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{p.name ?? "Sem nome"}</div>
                            <div className="text-xs font-mono text-muted-foreground">{formatPhoneDisplay(p.phone)}</div>
                          </div>
                          <StatusBadge status={p.status} />
                        </div>
                        <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 text-sm space-y-1 whitespace-pre-wrap break-words">
                          {p.header && <div className="font-semibold">{p.header}</div>}
                          <div>{p.body}</div>
                          {p.footer && <div className="text-xs text-muted-foreground pt-1">{p.footer}</div>}
                          {p.buttons?.length > 0 && (
                            <div className="pt-2 space-y-1 border-t border-emerald-200 mt-2">
                              {p.buttons.map((b: any, i: number) => (
                                <div key={i} className="text-xs text-sky-700 truncate">
                                  ▸ {b.text}{b.url ? ` — ${b.url}` : ""}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        {p.warnings?.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {p.warnings.map((w: string, i: number) => (
                              <Badge key={i} variant="outline" className="text-amber-700 border-amber-300 text-[10px]">{w}</Badge>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
                {filtered.length > 60 && (
                  <div className="text-xs text-muted-foreground text-center">
                    Mostrando 60 de {filtered.length.toLocaleString("pt-BR")}. Refine a busca para ver mais.
                  </div>
                )}
              </>
            );
          })()}
        </TabsContent>


        <TabsContent value="timeline" className="space-y-3">
          {timelineQ.error && <ErrorCard error={timelineQ.error} onRetry={() => timelineQ.refetch()} />}
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
          {errorsQ.error && <ErrorCard error={errorsQ.error} onRetry={() => errorsQ.refetch()} />}
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

        <TabsContent value="audit" className="space-y-3">
          <RecipientAudit
            recipients={recipients as any[] | undefined}
            isLoading={recipientsQ.isLoading}
            isFetching={recipientsQ.isFetching}
            isPolling={!!recipientsQ.isFetching || (recipientsQ as any).state?.fetchStatus === "fetching"}
            lastUpdatedAt={recipientsQ.dataUpdatedAt}
            onRefresh={() => recipientsQ.refetch()}
          />
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
          {reportQ.error && <ErrorCard error={reportQ.error} onRetry={() => reportQ.refetch()} />}
          {(report as any)?.final_report ? (
            <FinalReport report={(report as any).final_report} onPrint={() => window.print()} onExport={exportCsv} />
          ) : (
            <Card><CardContent className="pt-6 text-center text-muted-foreground">
              Relatório final estará disponível quando a campanha for concluída.
            </CardContent></Card>
          )}
        </TabsContent>
      </Tabs>

      <SpeedControlDialog
        open={speedOpen}
        onOpenChange={setSpeedOpen}
        campaignId={id}
        currentRate={(camp as any)?.send_rate_per_min}
        currentBatch={(camp as any)?.batch_size}
        currentJitter={(camp as any)?.jitter_ms}
        onSaved={invalidate}
      />
      <PreflightDialog
        campaign={showPreflight ? { id, name: (camp as any)?.name } : null}
        onOpenChange={(o) => setShowPreflight(o)}
        onStarted={invalidate}
      />

      <SwapConfigDialog
        open={swapOpen}
        onOpenChange={setSwapOpen}
        campaign={camp}
        onSuccess={invalidate}
      />
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

type AuditEvent = {
  key: string;
  label: string;
  at: string | null;
  tone: "info" | "success" | "primary" | "danger" | "warning" | "neutral";
  icon: any;
  detail?: string;
};

function buildRecipientEvents(r: any): AuditEvent[] {
  const evs: AuditEvent[] = [
    { key: "queued", label: "Enfileirada", at: r.created_at ?? null, tone: "neutral", icon: Clock },
  ];
  if (r.sent_at || ["sent", "delivered", "read", "replied"].includes(r.status)) {
    evs.push({
      key: "accepted",
      label: "Aceita pela Meta",
      at: r.sent_at ?? null,
      tone: "info",
      icon: Send,
      detail: r.meta_message_id ? `wamid: ${r.meta_message_id}` : undefined,
    });
  }
  if (r.delivered_at || ["delivered", "read", "replied"].includes(r.status)) {
    evs.push({ key: "delivered", label: "Entregue no dispositivo", at: r.delivered_at ?? null, tone: "success", icon: CheckCircle2 });
  }
  if (r.read_at || ["read", "replied"].includes(r.status)) {
    evs.push({ key: "read", label: "Lida pelo destinatário", at: r.read_at ?? null, tone: "success", icon: Eye });
  }
  if (r.replied_at || r.responded_at || r.status === "replied") {
    evs.push({ key: "replied", label: "Respondeu", at: r.replied_at ?? r.responded_at ?? null, tone: "primary", icon: MessageSquare });
  }
  if (r.failed_at || r.status === "failed") {
    evs.push({
      key: "failed",
      label: "Falha reportada pela Meta",
      at: r.failed_at ?? r.last_attempt_at ?? null,
      tone: "danger",
      icon: AlertTriangle,
      detail: [r.error_code, r.failed_reason].filter(Boolean).join(" — ") || undefined,
    });
  }
  if (r.status === "opt_out") {
    evs.push({ key: "opt_out", label: "Opt-out registrado", at: r.updated_at ?? null, tone: "warning", icon: Ban });
  }
  return evs;
}

const AUDIT_TONE: Record<string, string> = {
  success: "text-emerald-600 bg-emerald-50 border-emerald-200",
  danger: "text-red-600 bg-red-50 border-red-200",
  warning: "text-amber-600 bg-amber-50 border-amber-200",
  info: "text-sky-600 bg-sky-50 border-sky-200",
  primary: "text-blue-600 bg-blue-50 border-blue-200",
  neutral: "text-muted-foreground bg-muted border-border",
};

function RecipientAudit({
  recipients,
  isLoading,
  isFetching,
  isPolling,
  lastUpdatedAt,
  onRefresh,
}: {
  recipients: any[] | undefined;
  isLoading: boolean;
  isFetching?: boolean;
  isPolling?: boolean;
  lastUpdatedAt?: number;
  onRefresh?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");

  const list = useMemo(() => {
    const all = recipients ?? [];
    const q = search.trim().toLowerCase();
    return all.filter((r: any) => {
      if (filter === "failed" && r.status !== "failed") return false;
      if (filter === "delivered" && !["delivered", "read", "replied"].includes(r.status)) return false;
      if (filter === "read" && !["read", "replied"].includes(r.status)) return false;
      if (filter === "pending" && !["pending", "processing", "accepted", "sent"].includes(r.status)) return false;
      if (!q) return true;
      return (r.phone ?? "").toLowerCase().includes(q) ||
        (r.contact?.name ?? "").toLowerCase().includes(q) ||
        (r.meta_message_id ?? "").toLowerCase().includes(q) ||
        (r.failed_reason ?? "").toLowerCase().includes(q) ||
        (r.error_code ?? "").toLowerCase().includes(q);
    });
  }, [recipients, search, filter]);

  // Detecta webhooks travados: houve envio há > 15 min mas quase nenhum callback delivered/read chegou.
  const stale = useMemo(() => {
    const all = recipients ?? [];
    if (!all.length) return null;
    const parse = (v: any) => (v ? new Date(v).getTime() : 0);
    let lastSent = 0, lastCallback = 0, sentCount = 0, cbCount = 0;
    for (const r of all) {
      const s = parse(r.sent_at);
      if (s) { sentCount++; if (s > lastSent) lastSent = s; }
      const d = Math.max(parse(r.delivered_at), parse(r.read_at), parse(r.replied_at));
      if (d) { cbCount++; if (d > lastCallback) lastCallback = d; }
    }
    if (!lastSent) return null;
    const ageMin = (Date.now() - Math.max(lastSent, lastCallback)) / 60000;
    if (ageMin < 15) return null;
    if (cbCount / Math.max(sentCount, 1) > 0.1) return null;
    return { ageMin: Math.round(ageMin), sentCount, cbCount };
  }, [recipients]);

  if (isLoading && !recipients?.length) {
    return <Card><CardContent className="pt-6 text-center text-sm text-muted-foreground">Carregando auditoria…</CardContent></Card>;
  }

  const lastUpdatedLabel = lastUpdatedAt
    ? new Date(lastUpdatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  return (
    <div className="space-y-3">
      {stale && (
        <Card className="border-amber-300 bg-amber-50/60 dark:bg-amber-950/20">
          <CardContent className="pt-4 pb-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm space-y-1 flex-1">
              <div className="font-semibold text-amber-900 dark:text-amber-200">
                Webhooks da Meta parados há ~{stale.ageMin} min
              </div>
              <div className="text-amber-900/80 dark:text-amber-200/80">
                {stale.sentCount.toLocaleString("pt-BR")} mensagens enviadas, mas apenas{" "}
                {stale.cbCount.toLocaleString("pt-BR")} eventos de entrega/leitura recebidos.
                A assinatura do campo <code>messages</code> pode estar inativa, o App Secret pode estar divergente,
                ou os números não retornam recibos.
              </div>
              <div className="pt-1 flex flex-wrap gap-2">
                <Link to="/admin/whatsapp/conexoes"><Button size="sm" variant="outline">Reassinar webhooks</Button></Link>
                <Link to="/admin/whatsapp/diagnostico"><Button size="sm" variant="ghost">Diagnóstico</Button></Link>
                <Link to="/admin/whatsapp/webhooks"><Button size="sm" variant="ghost">Ver logs</Button></Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
          <span>
            Linha do tempo dos webhooks recebidos da Meta por destinatário
            {recipients?.length ? ` · ${list.length.toLocaleString("pt-BR")} de ${recipients.length.toLocaleString("pt-BR")}` : ""}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs">
            {isFetching ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Atualizando…
              </>
            ) : isPolling ? (
              <>
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> Auto-atualização ativa
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-muted-foreground/50" /> Auto-atualização em pausa
              </>
            )}
            {lastUpdatedLabel && <span className="text-muted-foreground/80">· {lastUpdatedLabel}</span>}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { k: "all", l: "Todos" },
            { k: "pending", l: "Pendentes" },
            { k: "delivered", l: "Entregues" },
            { k: "read", l: "Lidas" },
            { k: "failed", l: "Falhas" },
          ].map((f) => (
            <Button key={f.k} size="sm" variant={filter === f.k ? "default" : "outline"} onClick={() => setFilter(f.k)}>
              {f.l}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={() => onRefresh?.()} disabled={isFetching}>
            {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Atualizar
          </Button>
          <Input
            className="max-w-xs"
            placeholder="Buscar telefone, nome, wamid, erro..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {!list.length && (
        <Card><CardContent className="pt-6 text-center text-sm text-muted-foreground">
          Nenhum destinatário encontrado com esses filtros.
        </CardContent></Card>
      )}

      <div className="grid gap-3">
        {list.slice(0, 100).map((r: any) => {
          const events = buildRecipientEvents(r);
          return (
            <Card key={r.id}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{r.contact?.name ?? "Sem nome"}</div>
                    <div className="text-xs font-mono text-muted-foreground">{formatPhoneDisplay(r.phone)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={r.status} />
                    {r.attempt > 0 && <Badge variant="outline" className="text-[10px]">tent. {r.attempt}</Badge>}
                    {r.meta_message_id && (
                      <Badge variant="outline" className="text-[10px] font-mono max-w-[220px] truncate" title={r.meta_message_id}>
                        {r.meta_message_id}
                      </Badge>
                    )}
                  </div>
                </div>

                <ol className="relative border-l border-border pl-4 space-y-2">
                  {events.map((ev) => {
                    const Icon = ev.icon;
                    return (
                      <li key={ev.key} className="relative">
                        <span className={`absolute -left-[22px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full border ${AUDIT_TONE[ev.tone]}`}>
                          <Icon className="h-2.5 w-2.5" />
                        </span>
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <div className="text-sm font-medium">{ev.label}</div>
                          <div className="text-xs text-muted-foreground tabular-nums">{ev.at ? fmtDate(ev.at) : "aguardando webhook…"}</div>
                        </div>
                        {ev.detail && (
                          <div className={`mt-1 text-xs font-mono break-all ${ev.tone === "danger" ? "text-red-600" : "text-muted-foreground"}`}>
                            {ev.detail}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {list.length > 100 && (
        <div className="text-xs text-muted-foreground text-center">
          Mostrando 100 de {list.length.toLocaleString("pt-BR")}. Refine a busca para ver mais.
        </div>
      )}
    </div>
  );
}

