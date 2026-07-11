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
import { ErrorCard } from "@/components/admin/query-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { getWaCampaign } from "@/lib/wa-campaigns.functions";
import {
  getCampaignProgress, getCampaignTimeline, getCampaignRecipients,
  getCampaignFinalReport, getCampaignErrors, getRecipientPreviews,
  startCampaignAsync, pauseCampaignAsync, resumeCampaignAsync, cancelCampaignAsync,
  retryFailedRecipients, duplicateCampaign, preflightCampaign, unstickCampaignAsync,
  swapCampaignRouteAndResume,
} from "@/lib/wa-campaign-runner.functions";
import { adminListAllNumbers, adminListAllTemplates } from "@/lib/admin-dispatch.functions";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { WhatsAppPreview } from "@/components/campaigns/wizard/WhatsAppPreview";
import { renderMapping, fillMetaTemplate, buildContext, metaVarsIn } from "@/lib/wa-variables";
import { formatCallingCode, formatPhoneDisplay, summarizeCallingCodes } from "@/lib/phone-country";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Shuffle } from "lucide-react";

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

  const campQ = useQuery({
    queryKey: ["wa-camp", id],
    queryFn: () => getCamp({ data: { id } }),
  });
  const { data: camp } = campQ;

  const progQ = useQuery({
    queryKey: ["wa-camp-progress", id],
    queryFn: () => getProg({ data: { id } }),
    refetchInterval: (q) => {
      const s = (q.state.data as any)?.status;
      return s === "running" || s === "scheduled" ? 3000 : false;
    },
  });
  const { data: prog } = progQ;

  const timelineQ = useQuery({
    queryKey: ["wa-camp-timeline", id],
    queryFn: () => getTL({ data: { id, limit: 200 } }),
    refetchInterval: 10000,
  });
  const { data: timeline } = timelineQ;

  const recipientsQ = useQuery({
    queryKey: ["wa-camp-recipients", id],
    queryFn: () => getRec({ data: { id, limit: 500 } }),
    refetchInterval: (q) => {
      const s = (progQ.data as any)?.status;
      return s === "running" ? 20000 : false;
    },
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
  const swapFn = useServerFn(swapCampaignRouteAndResume);
  const listConnsFn = useServerFn(adminListAllNumbers);
  const listTplsFn = useServerFn(adminListAllTemplates);

  const [swapOpen, setSwapOpen] = useState(false);
  const [swapConn, setSwapConn] = useState<string>("");
  const [swapTpl, setSwapTpl] = useState<string>("");
  const [swapRetry, setSwapRetry] = useState(true);
  const [swapBodyVars, setSwapBodyVars] = useState<Record<string, string>>({});
  const [swapBtnVars, setSwapBtnVars] = useState<Record<string, string>>({});
  const [swapHeaderMediaUrl, setSwapHeaderMediaUrl] = useState("");
  const [swapUploadingMedia, setSwapUploadingMedia] = useState(false);

  const connsQ = useQuery({
    queryKey: ["wa-conns-all-admin"],
    queryFn: () => listConnsFn({ data: {} }),
    enabled: swapOpen,
  });
  const tplsQ = useQuery({
    queryKey: ["wa-tpls-admin", swapConn || null],
    queryFn: () => listTplsFn({ data: { connection_id: swapConn || null } }),
    enabled: swapOpen && !!swapConn,
  });

  // Seed selection + mappings from the current campaign when the dialog opens.
  useEffect(() => {
    if (!swapOpen || !camp) return;
    setSwapConn((camp as any).connection_id ?? "");
    setSwapTpl((camp as any).template_id ?? "");
    const vm = ((camp as any).variables_mapping ?? (camp as any).template_variables ?? {}) as Record<string, string>;
    const bm = ((camp as any).button_url_mapping ?? {}) as Record<string, string>;
    setSwapBodyVars({ ...vm });
    setSwapBtnVars({ ...bm });
    setSwapHeaderMediaUrl(String(vm._header_image_url ?? vm._header_url ?? (camp as any)?.template?.header_media_url ?? "").trim());
  }, [swapOpen, camp]);

  // All active numbers (admin — ignores workspace grants), same as wizard step 2.
  const swapConnList = useMemo(
    () => (connsQ.data?.numbers ?? []) as any[],
    [connsQ.data],
  );
  const swapConnRow = useMemo(
    () => swapConnList.find((c: any) => c.id === swapConn),
    [swapConnList, swapConn],
  );

  // Approved templates for the selected number (server filters by connection_id).
  const swapTplList = useMemo(() => {
    if (!swapConn) return [];
    return (tplsQ.data?.templates ?? []).filter((t: any) => {
      const st = String(t.status ?? "").toUpperCase();
      return st === "APPROVED" || st === "ACTIVE";
    });
  }, [tplsQ.data, swapConn]);


  const swapTplRow = useMemo(
    () => (tplsQ.data?.templates ?? []).find((t: any) => t.id === swapTpl),
    [tplsQ.data, swapTpl],
  );

  // If the currently-selected template does not belong to the new connection, clear it.
  useEffect(() => {
    if (!swapOpen || !swapTpl) return;
    if (tplsQ.isLoading || !tplsQ.data) return;
    if (!swapTplRow) {
      setSwapTpl("");
      setSwapBodyVars({});
      setSwapBtnVars({});
      setSwapHeaderMediaUrl("");
    }
  }, [swapConn, swapTplRow, swapTpl, swapOpen, tplsQ.isLoading, tplsQ.data]);


  // Variables required by the selected template.
  const swapBodyVarNums = useMemo(
    () => (swapTplRow ? metaVarsIn(swapTplRow.body ?? "") : []),
    [swapTplRow],
  );
  const swapUrlButton = useMemo(() => {
    const btns = (Array.isArray(swapTplRow?.buttons) ? swapTplRow?.buttons : []) as any[];
    return btns.find((b: any) => String(b?.type ?? "").toLowerCase() === "url" && b?.url);
  }, [swapTplRow]);
  const swapBtnVarNums = useMemo(
    () => (swapUrlButton?.url ? metaVarsIn(String(swapUrlButton.url)) : []),
    [swapUrlButton],
  );
  const swapHeaderType = useMemo(
    () => String(swapTplRow?.header_type ?? "").toLowerCase(),
    [swapTplRow],
  );
  const swapRequiresMedia = ["image", "video", "document"].includes(swapHeaderType);

  useEffect(() => {
    if (!swapOpen || !swapTplRow) return;
    if (!swapRequiresMedia) {
      setSwapHeaderMediaUrl("");
      return;
    }
    const templateMedia = String((swapTplRow as any).header_media_url ?? "").trim();
    if (templateMedia) setSwapHeaderMediaUrl((current) => current.trim() || templateMedia);
  }, [swapOpen, swapTplRow, swapRequiresMedia]);

  // Prévia renderizada dentro do diálogo de troca — usa template + mappings escolhidos.
  const swapPreview = useMemo(() => {
    if (!swapTplRow) return null;
    const first: any = (recipients as any[] | undefined)?.[0];
    const contact = first?.contact ?? (first ? { phone: first.phone } : {});
    const ctx = buildContext({
      contact,
      client: (camp as any)?.client,
      project: (camp as any)?.project,
      campaign: camp,
    });
    const resolved: Record<number, string> = {};
    for (const [k, v] of Object.entries(swapBodyVars)) {
      if (!/^\d+$/.test(k)) continue;
      resolved[Number(k)] = renderMapping(String(v ?? ""), ctx);
    }
    const body = fillMetaTemplate(String(swapTplRow.body ?? ""), resolved);
    const headerText = swapTplRow.header_type === "text"
      ? fillMetaTemplate(String(swapTplRow.header_text ?? ""), resolved)
      : swapTplRow.header_text;
    const buttons = Array.isArray(swapTplRow.buttons)
      ? swapTplRow.buttons.map((b: any) => {
          if (String(b?.type).toUpperCase() === "URL" && typeof b?.url === "string" && b.url.includes("{{")) {
            const urlResolved: Record<number, string> = {};
            for (const [k, v] of Object.entries(swapBtnVars)) urlResolved[Number(k)] = renderMapping(String(v ?? ""), ctx);
            return { ...b, url: fillMetaTemplate(String(b.url), urlResolved) };
          }
          return b;
        })
      : [];
    return {
      header: {
        type: swapTplRow.header_type,
        text: headerText,
        media_url: swapHeaderMediaUrl || swapTplRow.header_media_url,
      },
      body,
      footer: (swapTplRow as any).footer ?? (swapTplRow as any).footer_text ?? null,
      buttons,
      first,
    };
  }, [swapTplRow, swapBodyVars, swapBtnVars, swapHeaderMediaUrl, camp, recipients]);



  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["wa-camp", id] });
    qc.invalidateQueries({ queryKey: ["wa-camp-progress", id] });
    qc.invalidateQueries({ queryKey: ["wa-camp-timeline", id] });
    qc.invalidateQueries({ queryKey: ["wa-camp-recipients", id] });
    qc.invalidateQueries({ queryKey: ["wa-camp-errors", id] });
    qc.invalidateQueries({ queryKey: ["wa-camp-report", id] });
  };

  async function uploadSwapHeaderMedia(file: File) {
    setSwapUploadingMedia(true);
    try {
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const workspaceId = (camp as any)?.workspace_id ?? "admin";
      const key = `${workspaceId}/swap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("campaign-images").upload(key, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || undefined,
      });
      if (upErr) throw upErr;
      const { data: signed, error: sErr } = await supabase.storage
        .from("campaign-images")
        .createSignedUrl(key, 60 * 60 * 24 * 7);
      if (sErr || !signed?.signedUrl) throw sErr ?? new Error("Falha ao gerar URL da mídia");
      setSwapHeaderMediaUrl(signed.signedUrl);
      toast.success("Mídia carregada.");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro no upload da mídia");
    } finally {
      setSwapUploadingMedia(false);
    }
  }

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
    swap: useMutation({
      mutationFn: () => {
        const variablesMapping = { ...swapBodyVars };
        const headerUrl = swapHeaderMediaUrl.trim() || String((swapTplRow as any)?.header_media_url ?? "").trim();
        if (swapRequiresMedia) {
          if (!headerUrl) throw new Error(`Informe a mídia do cabeçalho (${swapHeaderType.toUpperCase()}).`);
          variablesMapping._header_image_url = headerUrl;
          variablesMapping._header_url = headerUrl;
        }
        return swapFn({ data: {
          id,
          connection_id: swapConn || undefined,
          template_id: swapTpl || undefined,
          variables_mapping: variablesMapping,
          button_url_mapping: swapBtnVars,
          retry_failed: swapRetry,
          resume_mode: "campaign",
        } });
      },
      onSuccess: (r: any) => {
        const processed = Number(r?.immediate_tick?.processed ?? r?.immediate_tick?.dispatched ?? 0);
        if (r?.immediate_tick?.error) {
          toast.warning(`Troca salva, mas o processamento imediato falhou: ${r.immediate_tick.error}`);
        } else if ((r?.pending_recipients ?? 0) === 0) {
          toast.info("Troca salva, mas não havia falhas elegíveis para reenviar.");
        } else {
          toast.success(`Troca salva e retomada · ${r.pending_recipients} pendente(s) · ${processed} processado(s) agora`);
        }
        setSwapOpen(false);
        invalidate();
      },
      onError: (e: any) => toast.error(e?.message ?? "Erro ao trocar rota"),
    }),
  };

  const p = (prog?.progress as any) ?? {};
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
    const varsMap: Record<string, string> =
      ((camp as any)?.variables_mapping ?? (camp as any)?.template_variables ?? {}) as any;
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
    return {
      header: {
        type: tpl.header_type,
        text: headerText,
        media_url: tpl.header_media_url,
      },
      body,
      footer: tpl.footer_text,
      buttons,
      first,
    };
  }, [camp, recipients]);

  const isPaused = status === "paused";
  const isFinished = ["completed", "partial", "cancelled", "error"].includes(status);

  const exportCsv = async () => {
    let rows: any[] = [];
    try {
      rows = (await getRec({ data: { id } })) as any[];
    } catch (e: any) {
      toast.error(`Falha ao carregar destinatários: ${e?.message ?? e}`);
      return;
    }
    if (!rows?.length) { toast.warning("Sem dados"); return; }
    const esc = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["phone","nome","status","tentativas","enviada","entregue","lida","respondida","erro"];
    const csv = [header.join(","), ...rows.map((r: any) => [
      r.phone, r.contact?.name ?? "", r.status, r.attempt ?? 0,
      r.sent_at ?? "", r.delivered_at ?? "", r.read_at ?? "", r.replied_at ?? "",
      r.failed_reason ?? "",
    ].map(esc).join(","))].join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `campanha-${id}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`${rows.length.toLocaleString("pt-BR")} destinatários exportados`);
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
            {status !== "cancelled" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSwapConn((camp as any)?.connection_id ?? "");
                  setSwapTpl((camp as any)?.template_id ?? "");
                  setSwapOpen(true);
                }}
              >
                <Shuffle className="mr-2 h-4 w-4" />
                Trocar número/template
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
            {(isRunning || isPaused || status === "error") && (
              <Button size="sm" variant="outline" onClick={() => m.unstick.mutate()} disabled={m.unstick.isPending}>
                {m.unstick.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Destravar fila
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => m.dup.mutate()}>
              <Copy className="mr-2 h-4 w-4" />Duplicar
            </Button>
          </div>
        }
      />

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
          <TabsTrigger value="previews">Prévias</TabsTrigger>
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

      <Dialog open={swapOpen} onOpenChange={setSwapOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Trocar número/template e retomar</DialogTitle>
            <DialogDescription>
              Selecione o número, o template aprovado para esse número e ajuste as variáveis. Destinatários já enviados não serão reenviados.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 md:grid-cols-2">
            <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Número de envio</Label>
              <Select value={swapConn} onValueChange={setSwapConn}>
                <SelectTrigger><SelectValue placeholder="Selecione um número" /></SelectTrigger>
                <SelectContent>
                  {swapConnList.map((c: any) => {
                    const st = String(c.status ?? "").toLowerCase();
                    const active = ["ativo","active","connected"].includes(st);
                    return (
                      <SelectItem key={c.id} value={c.id}>
                        {c.display_phone ?? c.name} — {c.workspace_name}
                        {c.id === (camp as any)?.connection_id ? " (atual)" : ""}
                        {!active ? ` · ${c.status ?? "inativo"}` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Pode manter o número atual e trocar apenas o template.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Template aprovado</Label>
              <Select value={swapTpl} onValueChange={setSwapTpl} disabled={!swapConn}>
                <SelectTrigger>
                  <SelectValue placeholder={swapConn ? "Selecione um template" : "Escolha o número primeiro"} />
                </SelectTrigger>
                <SelectContent>
                  {swapTplList.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.language})
                      {t.id === (camp as any)?.template_id ? " (atual)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {swapConn && swapTplList.length === 0 && (
                <p className="text-[11px] text-muted-foreground">Nenhum template aprovado para esta WABA.</p>
              )}
            </div>

            {swapTplRow && (swapBodyVarNums.length > 0 || swapBtnVarNums.length > 0) && (
              <div className="space-y-3 rounded-md border p-3">
                <p className="text-xs font-medium">Variáveis do template</p>
                <p className="text-[11px] text-muted-foreground">
                  Use tokens como <code>{"{nome}"}</code>, <code>{"{telefone}"}</code> ou texto fixo. Fallback: <code>{"{nome|amigo}"}</code>.
                </p>
                {swapBodyVarNums.map((n) => (
                  <div key={`b-${n}`} className="space-y-1">
                    <Label className="text-xs">Corpo · {"{{" + n + "}}"}</Label>
                    <Input
                      value={swapBodyVars[String(n)] ?? ""}
                      onChange={(e) => setSwapBodyVars((s) => ({ ...s, [String(n)]: e.target.value }))}
                      placeholder="{nome}"
                    />
                  </div>
                ))}
                {swapBtnVarNums.map((n) => (
                  <div key={`u-${n}`} className="space-y-1">
                    <Label className="text-xs">URL do botão · {"{{" + n + "}}"}</Label>
                    <Input
                      value={swapBtnVars[String(n)] ?? ""}
                      onChange={(e) => setSwapBtnVars((s) => ({ ...s, [String(n)]: e.target.value }))}
                      placeholder="slug ou parâmetro"
                    />
                  </div>
                ))}
              </div>
            )}

            {swapTplRow && swapRequiresMedia && (
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-xs font-medium">Mídia do cabeçalho</p>
                <div className="space-y-1">
                  <Label className="text-xs">URL da mídia · {swapHeaderType.toUpperCase()}</Label>
                  <Input
                    value={swapHeaderMediaUrl}
                    onChange={(e) => setSwapHeaderMediaUrl(e.target.value)}
                    placeholder="https://exemplo.com/imagem.jpg"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Enviar arquivo</Label>
                  <Input
                    type="file"
                    accept={swapHeaderType === "image" ? "image/*" : swapHeaderType === "video" ? "video/*" : undefined}
                    disabled={swapUploadingMedia}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadSwapHeaderMedia(file);
                    }}
                  />
                  {swapUploadingMedia && <p className="text-[11px] text-muted-foreground">Carregando mídia…</p>}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Obrigatório para templates com cabeçalho de imagem, vídeo ou documento.
                </p>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={swapRetry}
                onCheckedChange={(v) => setSwapRetry(v === true)}
              />
              Reenfileirar destinatários que falharam ({p.failed ?? 0})
            </label>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Pré-visualização</Label>
              {swapPreview ? (
                <WhatsAppPreview
                  header={swapPreview.header as any}
                  body={swapPreview.body}
                  footer={swapPreview.footer}
                  buttons={swapPreview.buttons as any}
                  senderName={swapPreview.first?.phone ? `Destinatário ${formatPhoneDisplay(swapPreview.first.phone)}` : "Destinatário"}
                />
              ) : (
                <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                  Selecione um template para visualizar a mensagem.
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSwapOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => m.swap.mutate()}
              disabled={m.swap.isPending || swapUploadingMedia || (!swapConn && !swapTpl) || (swapRequiresMedia && !swapHeaderMediaUrl.trim() && !String((swapTplRow as any)?.header_media_url ?? "").trim())}
            >
              {m.swap.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Trocar e retomar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
