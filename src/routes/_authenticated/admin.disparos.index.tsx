import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus, Search, Play, Pause, XCircle, Eye, RefreshCw, ArrowLeft,
  Calendar, CheckCircle2, AlertTriangle, Clock, Rocket, MessageSquareText, CalendarClock, Trash2,
  Send, CheckCheck, MousePointerClick, Layers,
} from "lucide-react";

import { PreflightDialog } from "@/components/admin/preflight-dialog";
import { PageHeader } from "@/components/admin/page-header";
import { PeriodFilter } from "@/components/admin/period-filter";
import { ErrorCard } from "@/components/admin/query-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  listWaCampaigns, startWaCampaign, pauseWaCampaign, cancelWaCampaign, scheduleWaCampaign, unscheduleWaCampaign, deleteWaCampaign,
} from "@/lib/wa-campaigns.functions";
import { getCampaignErrorContext } from "@/lib/wa-diagnosis.functions";
import { getPeriodRange, type PeriodKey } from "@/lib/period";
import { supabase } from "@/integrations/supabase/client";
import { CampaignWizard } from "@/components/campaign-wizard";

export const Route = createFileRoute("/_authenticated/admin/disparos/")({
  head: () => ({ meta: [{ title: "Disparos — WhatsApp" }] }),
  component: DisparosIndex,
});

const STATUS_META: Record<string, { label: string; className: string }> = {
  draft: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  scheduled: { label: "Agendado", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  queued: { label: "Na fila", className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200" },
  running: { label: "Enviando", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
  paused: { label: "Pausado", className: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200" },
  done: { label: "Concluído", className: "bg-primary/10 text-primary" },
  completed: { label: "Concluído", className: "bg-primary/10 text-primary" },
  canceled: { label: "Cancelado", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" },
  failed: { label: "Falhou", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" },
  error: { label: "Erro", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" },
};

type StatusFilter = "all" | "active" | "scheduled" | "done" | "draft";
type ViewMode = "list" | "wizard";

function DisparosIndex() {
  const [mode, setMode] = useState<ViewMode>("list");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  // Carrega workspace primário do admin — o wizard opera sobre ele.
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("get_my_context");
      if (error) { toast.error("Não foi possível carregar seu workspace"); return; }
      const ctx = data as any;
      const wid = ctx?.primary_workspace?.id ?? ctx?.workspaces?.[0]?.id;
      if (wid) setWorkspaceId(wid);
    })();
  }, []);

  if (mode === "wizard") {
    if (!workspaceId) {
      return (
        <div className="p-10 text-center text-sm text-muted-foreground">
          Carregando workspace…
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => setMode("list")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar para a lista
          </Button>
          <div className="text-xs text-muted-foreground">
            Novo disparo — fluxo em 5 etapas
          </div>
        </div>
        <CampaignWizard
          workspaceId={workspaceId}
          adminMode
          onExit={() => setMode("list")}
        />
      </div>
    );
  }

  return <ListView onNew={() => setMode("wizard")} />;
}

function ListView({ onNew }: { onNew: () => void }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listWaCampaigns);
  const startFn = useServerFn(startWaCampaign);
  const pauseFn = useServerFn(pauseWaCampaign);
  const cancelFn = useServerFn(cancelWaCampaign);
  const scheduleFn = useServerFn(scheduleWaCampaign);
  const unscheduleFn = useServerFn(unscheduleWaCampaign);
  const deleteFn = useServerFn(deleteWaCampaign);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodKey>("all");
  const [preflightFor, setPreflightFor] = useState<{ id: string; name?: string | null } | null>(null);
  const [reschedule, setReschedule] = useState<{ id: string; name: string; scheduled_at?: string | null } | null>(null);
  const [rescheduleAt, setRescheduleAt] = useState<string>("");

  const campaignsQ = useQuery({
    queryKey: ["wa-campaigns", "all"],
    queryFn: () => listFn(),
    refetchInterval: 15_000,
  });

  // Realtime: recarrega a lista assim que qualquer campanha ou destinatário muda.
  useEffect(() => {
    let pending = false;
    const schedule = () => {
      if (pending) return;
      pending = true;
      setTimeout(() => {
        pending = false;
        qc.invalidateQueries({ queryKey: ["wa-campaigns"] });
      }, 800);
    };
    const channel = supabase
      .channel("admin-disparos-realtime")
      // Frente 4: NÃO ouvir campaign_recipients — durante um disparo de 1M isso dispara 1M eventos.
      // wa_campaigns já é atualizado por trigger com os totais (sent/delivered/failed/progress).
      .on("postgres_changes", { event: "*", schema: "public", table: "wa_campaigns" }, schedule)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  const campaigns = (campaignsQ.data ?? []) as any[];
  const listError = campaignsQ.error;

  const counts = useMemo(() => {
    const c = { all: campaigns.length, active: 0, scheduled: 0, done: 0, draft: 0 };
    for (const r of campaigns) {
      if (["running", "queued", "paused"].includes(r.status)) c.active++;
      else if (r.status === "scheduled") c.scheduled++;
      else if (["done", "completed"].includes(r.status)) c.done++;
      else if (r.status === "draft") c.draft++;
    }
    return c;
  }, [campaigns]);

  const campaignMetrics = useMemo(() => campaigns.map((campaign) => ({ campaign, metrics: getDeliveryMetrics(campaign) })), [campaigns]);

  const filtered = useMemo(() => {
    const range = getPeriodRange(periodFilter);
    return campaignMetrics.filter(({ campaign: c }) => {
      if (filter === "active" && !["running", "queued", "paused"].includes(c.status)) return false;
      if (filter === "scheduled" && c.status !== "scheduled") return false;
      if (filter === "done" && !["done", "completed"].includes(c.status)) return false;
      if (filter === "draft" && c.status !== "draft") return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${c.name ?? ""} ${c.client?.name ?? ""} ${c.template?.name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (periodFilter !== "last_30") {
        const created = c.created_at ? new Date(c.created_at) : null;
        if (created && (created < range.start || created > range.end)) return false;
      }
      return true;
    });
  }, [campaignMetrics, filter, search, periodFilter]);

  const deliveryTotals = useMemo(() => {
    return filtered.reduce((acc, item) => {
      acc.total += item.metrics.total;
      acc.sent += item.metrics.sent;
      acc.delivered += item.metrics.delivered;
      acc.read += item.metrics.read;
      acc.failed += item.metrics.failed;
      acc.clicks += item.metrics.clicks;
      return acc;
    }, { total: 0, sent: 0, delivered: 0, read: 0, failed: 0, clicks: 0 });
  }, [filtered]);

  const startMut = useMutation({
    mutationFn: (id: string) => startFn({ data: { id } }),
    onSuccess: () => { toast.success("Envio iniciado"); qc.invalidateQueries({ queryKey: ["wa-campaigns"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao iniciar"),
  });
  const pauseMut = useMutation({
    mutationFn: (id: string) => pauseFn({ data: { id } }),
    onSuccess: () => { toast.message("Campanha pausada"); qc.invalidateQueries({ queryKey: ["wa-campaigns"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao pausar"),
  });
  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => { toast.message("Campanha cancelada"); qc.invalidateQueries({ queryKey: ["wa-campaigns"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao cancelar"),
  });
  const scheduleMut = useMutation({
    mutationFn: (p: { id: string; scheduled_at: string }) => scheduleFn({ data: p }),
    onSuccess: () => {
      toast.success("Campanha reagendada");
      qc.invalidateQueries({ queryKey: ["wa-campaigns"] });
      setReschedule(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao reagendar"),
  });
  const unscheduleMut = useMutation({
    mutationFn: (id: string) => unscheduleFn({ data: { id } }),
    onSuccess: () => { toast.message("Agendamento cancelado — voltou para rascunho"); qc.invalidateQueries({ queryKey: ["wa-campaigns"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao cancelar agendamento"),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success("Campanha excluída"); qc.invalidateQueries({ queryKey: ["wa-campaigns"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao excluir campanha"),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Disparos"
        description="Crie, agende e acompanhe todas as campanhas de WhatsApp em tempo real."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => campaignsQ.refetch()}>
              <RefreshCw className={`mr-2 h-4 w-4 ${campaignsQ.isFetching ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/disparos/multi">
                <Layers className="mr-2 h-4 w-4" /> Multi-BM
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/disparos/api-externa">
                <Send className="mr-2 h-4 w-4" /> API externa
              </Link>
            </Button>
            <Button size="lg" className="rounded-full shadow-sm" onClick={onNew}>
              <Plus className="mr-2 h-4 w-4" /> Novo disparo
            </Button>

          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatCard active={filter === "all"} onClick={() => setFilter("all")} icon={<Rocket className="h-5 w-5" />} tone="primary" label="Todas" value={counts.all} />
        <StatCard active={filter === "active"} onClick={() => setFilter("active")} icon={<Play className="h-5 w-5" />} tone="emerald" label="Ativas" value={counts.active} />
        <StatCard active={filter === "scheduled"} onClick={() => setFilter("scheduled")} icon={<Calendar className="h-5 w-5" />} tone="amber" label="Agendadas" value={counts.scheduled} />
        <StatCard active={filter === "done"} onClick={() => setFilter("done")} icon={<CheckCircle2 className="h-5 w-5" />} tone="primary" label="Concluídas" value={counts.done} />
        <StatCard active={filter === "draft"} onClick={() => setFilter("draft")} icon={<Clock className="h-5 w-5" />} tone="muted" label="Rascunhos" value={counts.draft} />
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, cliente ou template…"
          className="h-11 rounded-xl border-border/70 bg-card pl-10 shadow-xs"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <DeliverySummaryCard icon={<Send className="h-5 w-5" />} tone="primary" label="Enviados" value={deliveryTotals.sent} total={deliveryTotals.total} />
        <DeliverySummaryCard icon={<CheckCheck className="h-5 w-5" />} tone="emerald" label="Recebidos" value={deliveryTotals.delivered} total={deliveryTotals.sent} />
        <DeliverySummaryCard icon={<Eye className="h-5 w-5" />} tone="violet" label="Lidas" value={deliveryTotals.read} total={deliveryTotals.delivered} />
        <DeliverySummaryCard icon={<MousePointerClick className="h-5 w-5" />} tone="cyan" label="Cliques" value={deliveryTotals.clicks} total={deliveryTotals.delivered} />
        <DeliverySummaryCard icon={<AlertTriangle className="h-5 w-5" />} tone="danger" label="Falhas" value={deliveryTotals.failed} total={deliveryTotals.total} />
      </div>


      {campaignsQ.isLoading ? (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">Carregando disparos…</CardContent></Card>
      ) : listError ? (
        <Card><CardContent className="p-6"><ErrorCard error={listError} onRetry={() => campaignsQ.refetch()} /></CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-0"><EmptyState hasAny={campaigns.length > 0} onNew={onNew} /></CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(({ campaign: c, metrics }) => {
            const meta = STATUS_META[c.status] ?? { label: c.status ?? "—", className: "bg-muted" };
            const { total, sent, delivered, read, failed, processed, clicks } = metrics;
            const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
            const whenLabel = c.scheduled_at
              ? `Agendado para ${new Date(c.scheduled_at).toLocaleString("pt-BR")}`
              : c.created_at
                ? `Criado em ${new Date(c.created_at).toLocaleString("pt-BR")}`
                : "—";
            return (
              <Card
                key={c.id}
                className="cursor-pointer rounded-2xl border-border/60 shadow-xs transition-all hover:border-primary/50 hover:shadow-md"
                onClick={() => nav({ to: "/admin/disparos/$id", params: { id: c.id } })}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="truncate text-base">{c.name}</CardTitle>
                      <CardDescription className="mt-1 truncate">
                        {c.client?.name ?? "Sem cliente"} · {whenLabel}
                      </CardDescription>
                    </div>
                    <Badge variant="secondary" className={`rounded-full px-3 py-1 font-medium ${meta.className}`}>{meta.label}</Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <MessageSquareText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{c.template?.name ?? "—"}</span>
                    </div>
                    <span className="text-xs text-muted-foreground truncate ml-2">
                      {c.connection?.display_phone ?? c.connection?.name ?? "—"}
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Progresso</span>
                      <span className="font-medium">{processed}/{total}{pct > 0 ? ` · ${pct}%` : ""}</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    {failed > 0 && (
                      <div className="mt-1 text-xs text-red-600 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />{failed} falhas
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-5 gap-2 rounded-lg border bg-muted/30 p-2 text-center">
                    <CampaignMetric label="Enviados" value={sent} />
                    <CampaignMetric label="Recebidos" value={delivered} />
                    <CampaignMetric label="Lidas" value={read} />
                    <CampaignMetric label="Cliques" value={clicks} />
                    <CampaignMetric label="Falhas" value={failed} danger={failed > 0} />
                  </div>

                  {(c.last_error || c.pause_reason || c.status === "error" || c.status === "failed") && (
                    <ErrorPanel campaignId={c.id} lastError={c.last_error} pauseReason={c.pause_reason} />
                  )}


                  <div className="flex flex-wrap justify-end gap-1 pt-1 border-t" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" title="Abrir" onClick={() => nav({ to: "/admin/disparos/$id", params: { id: c.id } })}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    {["draft", "scheduled"].includes(c.status) && (
                      <Button variant="ghost" size="icon" title="Enviar agora" onClick={() => setPreflightFor({ id: c.id, name: (c as any).name })}>
                        <Play className="h-4 w-4 text-emerald-600" />
                      </Button>
                    )}
                    {["draft", "scheduled"].includes(c.status) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title={c.status === "scheduled" ? "Reagendar" : "Agendar"}
                        onClick={() => {
                          setReschedule({ id: c.id, name: c.name, scheduled_at: c.scheduled_at });
                          setRescheduleAt(c.scheduled_at
                            ? new Date(c.scheduled_at).toISOString().slice(0, 16)
                            : new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16));
                        }}
                      >
                        <CalendarClock className="h-4 w-4 text-blue-600" />
                      </Button>
                    )}
                    {c.status === "scheduled" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Cancelar agendamento (voltar para rascunho)"
                        onClick={() => { if (confirm("Cancelar o agendamento? A campanha voltará para rascunho.")) unscheduleMut.mutate(c.id); }}
                      >
                        <Clock className="h-4 w-4 text-amber-600" />
                      </Button>
                    )}
                    {["running", "queued"].includes(c.status) && (
                      <Button variant="ghost" size="icon" title="Pausar" onClick={() => pauseMut.mutate(c.id)}>
                        <Pause className="h-4 w-4 text-orange-600" />
                      </Button>
                    )}
                    {["running", "queued", "paused", "scheduled"].includes(c.status) && (
                      <Button variant="ghost" size="icon" title="Cancelar disparo" onClick={() => { if (confirm("Cancelar este disparo?")) cancelMut.mutate(c.id); }}>
                        <XCircle className="h-4 w-4 text-red-600" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Excluir campanha"
                      disabled={deleteMut.isPending}
                      onClick={() => {
                        const running = ["running", "queued", "paused", "scheduled"].includes(c.status);
                        const msg = running
                          ? `Excluir "${c.name}"?\n\nA campanha ainda está ativa. A exclusão também remove destinatários, timeline e histórico. Esta ação é permanente.`
                          : `Excluir "${c.name}"?\n\nEsta ação também remove destinatários e histórico e é permanente.`;
                        if (confirm(msg)) deleteMut.mutate(c.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}


      <PreflightDialog
        campaign={preflightFor}
        onOpenChange={(o) => { if (!o) setPreflightFor(null); }}
        onStarted={() => qc.invalidateQueries({ queryKey: ["wa-campaigns"] })}
      />

      <Dialog open={!!reschedule} onOpenChange={(o) => { if (!o) setReschedule(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {reschedule?.scheduled_at ? "Reagendar disparo" : "Agendar disparo"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="text-muted-foreground">
              Campanha: <span className="font-medium text-foreground">{reschedule?.name}</span>
            </div>
            <div>
              <Label htmlFor="reschedule-at">Data e hora do envio</Label>
              <Input
                id="reschedule-at"
                type="datetime-local"
                value={rescheduleAt}
                onChange={(e) => setRescheduleAt(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Fuso horário do seu navegador. A campanha aparece em "Agendadas" até o horário chegar.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReschedule(null)}>Cancelar</Button>
            <Button
              disabled={scheduleMut.isPending || !rescheduleAt}
              onClick={() => {
                if (!reschedule || !rescheduleAt) return;
                const iso = new Date(rescheduleAt).toISOString();
                scheduleMut.mutate({ id: reschedule.id, scheduled_at: iso });
              }}
            >
              {scheduleMut.isPending ? "Salvando…" : reschedule?.scheduled_at ? "Reagendar" : "Agendar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function getDeliveryMetrics(c: any) {
  const progress = ((c?.progress ?? {}) as Record<string, unknown>);
  const num = (...values: unknown[]) => {
    let max = 0;
    for (const value of values) {
      const n = Number(value ?? 0);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return max;
  };
  const total = num(progress.total, c.total_recipients, c.total);
  let sent = num(progress.sent, c.sent_count, c.sent, (Number(progress.accepted ?? 0) || 0) + (Number(progress.sent_count ?? 0) || 0));
  let delivered = num(progress.delivered, c.delivered_count, c.delivered);
  const read = num(progress.read, c.read_count, c.read);
  const failed = num(progress.failed, c.failed_count, c.failed);
  const optOut = num(progress.opt_out, c.opt_out_count);
  const cancelled = num(progress.cancelled, c.cancelled_count);
  const skipped = num(progress.skipped, c.skipped_count);
  let processed = num(progress.processed, sent + failed + optOut + cancelled + skipped);
  const clicks = num(c.clicks_count);

  // "Entregue" = mensagem aceita pela Meta (enviada sem falha). Campanhas sem
  // webhook assinado nunca recebem callbacks; camada de apresentação apenas.
  const noDeliveryCallbacks = delivered === 0 && read === 0 && sent > 0;
  const finished = total > 0 && processed >= total - Math.max(1, Math.round(total * 0.01));
  if (noDeliveryCallbacks && finished) {
    sent = total;
    delivered = Math.max(0, total - failed);
    processed = total;
  } else {
    delivered = Math.max(delivered, Math.max(0, sent - failed));
  }

  return { total, sent, delivered, read, failed, processed, clicks };

}

type Tone = "primary" | "emerald" | "amber" | "violet" | "cyan" | "danger" | "muted";

const TONE_CHIP: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  emerald: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300",
  amber: "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-300",
  violet: "bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-300",
  cyan: "bg-cyan-100 text-cyan-600 dark:bg-cyan-950 dark:text-cyan-300",
  danger: "bg-destructive/10 text-destructive",
  muted: "bg-muted text-muted-foreground",
};

function DeliverySummaryCard({ icon, label, value, total, tone = "primary" }: { icon: React.ReactNode; label: string; value: number; total: number; tone?: Tone }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-xs">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${TONE_CHIP[tone]}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold tabular-nums leading-tight">{value.toLocaleString("pt-BR")}</div>
        </div>
        <div className={`text-sm font-semibold ${tone === "danger" ? "text-destructive" : "text-muted-foreground"}`}>{pct}%</div>
      </div>
    </div>
  );
}

function CampaignMetric({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="min-w-0">
      <div className={`text-sm font-semibold tabular-nums ${danger ? "text-destructive" : "text-foreground"}`}>{value.toLocaleString("pt-BR")}</div>
      <div className="truncate text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function StatCard({ icon, label, value, active, onClick, tone = "primary" }: { icon: React.ReactNode; label: string; value: number; active?: boolean; onClick?: () => void; tone?: Tone }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 rounded-2xl border bg-card p-4 text-left shadow-xs transition-all hover:border-primary/50 hover:shadow-sm ${active ? "border-primary bg-primary/5 ring-2 ring-primary/15" : "border-border/60"}`}
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${TONE_CHIP[tone]}`}>{icon}</span>
      <div className="min-w-0">
        <div className="truncate text-sm text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold tabular-nums leading-tight ${active ? "text-primary" : ""}`}>{value}</div>
      </div>
    </button>
  );
}


function EmptyState({ hasAny, onNew }: { hasAny: boolean; onNew: () => void }) {
  return (
    <div className="p-12 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
        <Rocket className="h-7 w-7 text-primary" />
      </div>
      <h3 className="mt-4 text-lg font-semibold">
        {hasAny ? "Nenhum disparo neste filtro" : "Nenhum disparo ainda"}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {hasAny ? "Ajuste o filtro ou crie um novo disparo." : "Crie seu primeiro disparo WhatsApp para começar."}
      </p>
      <Button className="mt-6 rounded-full" onClick={onNew}>
        <Plus className="mr-2 h-4 w-4" /> Novo disparo
      </Button>
    </div>
  );
}

function ErrorPanel({ campaignId, lastError, pauseReason }: { campaignId: string; lastError?: string | null; pauseReason?: string | null }) {
  const fn = useServerFn(getCampaignErrorContext);
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["campaign-error-ctx", campaignId],
    queryFn: () => fn({ data: { campaign_id: campaignId } }),
    enabled: open,
  });
  const ctx = q.data as any;

  return (
    <div className="rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-2 text-xs space-y-1" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start gap-1.5 text-red-800 dark:text-red-200">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="font-medium">{lastError || pauseReason || "Erro no disparo"}</div>
          {pauseReason && lastError && <div className="text-[11px] opacity-80">Motivo pausa: {pauseReason}</div>}
        </div>
        <button type="button" className="text-[11px] underline opacity-80 hover:opacity-100" onClick={() => setOpen((v) => !v)}>
          {open ? "Ocultar" : "Ver contexto"}
        </button>
      </div>
      {open && (
        <div className="pt-1 border-t border-red-200 dark:border-red-900 space-y-2">
          {q.isLoading && <div className="text-red-700 dark:text-red-300">Carregando contexto…</div>}
          {q.error && <div className="text-red-700 dark:text-red-300">Falha ao carregar: {String((q.error as any)?.message)}</div>}
          {ctx && (
            <>
              {ctx.timeline?.length > 0 && (
                <div>
                  <div className="font-semibold text-red-800 dark:text-red-200 mb-0.5">Timeline recente</div>
                  <ul className="space-y-0.5 max-h-40 overflow-auto">
                    {ctx.timeline.map((e: any, i: number) => (
                      <li key={i} className="font-mono text-[10.5px] text-red-700 dark:text-red-300">
                        [{new Date(e.created_at).toLocaleTimeString("pt-BR")}] {e.event_type}: {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {ctx.failed_recipients?.length > 0 && (
                <div>
                  <div className="font-semibold text-red-800 dark:text-red-200 mb-0.5">Últimas falhas por destinatário</div>
                  <ul className="space-y-0.5 max-h-40 overflow-auto">
                    {ctx.failed_recipients.map((r: any, i: number) => (
                      <li key={i} className="font-mono text-[10.5px] text-red-700 dark:text-red-300">
                        {r.phone} · {r.error_code ?? "—"} · {r.failed_reason ?? "—"}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(!ctx.timeline?.length && !ctx.failed_recipients?.length) && (
                <div className="text-red-700 dark:text-red-300">Sem eventos adicionais.</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
