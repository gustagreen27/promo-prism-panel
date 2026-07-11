import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus, Search, Play, Pause, XCircle, Eye, RefreshCw, ArrowLeft,
  Calendar, CheckCircle2, AlertTriangle, Clock, Rocket, MessageSquareText, CalendarClock,
} from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { ErrorCard } from "@/components/admin/query-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  listWaCampaigns, startWaCampaign, pauseWaCampaign, cancelWaCampaign, scheduleWaCampaign, unscheduleWaCampaign,
} from "@/lib/wa-campaigns.functions";
import { supabase } from "@/integrations/supabase/client";
import { CampaignWizard } from "@/routes/painel.campanhas.nova";

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

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [reschedule, setReschedule] = useState<{ id: string; name: string; scheduled_at?: string | null } | null>(null);
  const [rescheduleAt, setRescheduleAt] = useState<string>("");

  const campaignsQ = useQuery({
    queryKey: ["wa-campaigns", "all"],
    queryFn: () => listFn(),
    refetchInterval: 10_000,
  });

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

  const filtered = useMemo(() => {
    return campaigns.filter((c) => {
      if (filter === "active" && !["running", "queued", "paused"].includes(c.status)) return false;
      if (filter === "scheduled" && c.status !== "scheduled") return false;
      if (filter === "done" && !["done", "completed"].includes(c.status)) return false;
      if (filter === "draft" && c.status !== "draft") return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${c.name ?? ""} ${c.client?.name ?? ""} ${c.template?.name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [campaigns, filter, search]);

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
            <Button size="lg" className="rounded-full shadow-sm" onClick={onNew}>
              <Plus className="mr-2 h-4 w-4" /> Novo disparo
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard active={filter === "all"} onClick={() => setFilter("all")} icon={<Rocket className="h-4 w-4" />} label="Todas" value={counts.all} />
        <StatCard active={filter === "active"} onClick={() => setFilter("active")} icon={<Play className="h-4 w-4 text-emerald-600" />} label="Ativas" value={counts.active} />
        <StatCard active={filter === "scheduled"} onClick={() => setFilter("scheduled")} icon={<Calendar className="h-4 w-4 text-amber-600" />} label="Agendadas" value={counts.scheduled} />
        <StatCard active={filter === "done"} onClick={() => setFilter("done")} icon={<CheckCircle2 className="h-4 w-4 text-primary" />} label="Concluídas" value={counts.done} />
        <StatCard active={filter === "draft"} onClick={() => setFilter("draft")} icon={<Clock className="h-4 w-4 text-muted-foreground" />} label="Rascunhos" value={counts.draft} />
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, cliente ou template…"
          className="pl-9"
        />
      </div>

      {campaignsQ.isLoading ? (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">Carregando disparos…</CardContent></Card>
      ) : listError ? (
        <Card><CardContent className="p-6"><ErrorCard error={listError} onRetry={() => campaignsQ.refetch()} /></CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-0"><EmptyState hasAny={campaigns.length > 0} onNew={onNew} /></CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c: any) => {
            const meta = STATUS_META[c.status] ?? { label: c.status ?? "—", className: "bg-muted" };
            const total = c.total_recipients ?? c.total ?? 0;
            const sent = c.sent_count ?? c.sent ?? 0;
            const failed = c.failed_count ?? c.failed ?? 0;
            const pct = total > 0 ? Math.round(((sent + failed) / total) * 100) : 0;
            const whenLabel = c.scheduled_at
              ? `Agendado para ${new Date(c.scheduled_at).toLocaleString("pt-BR")}`
              : c.created_at
                ? `Criado em ${new Date(c.created_at).toLocaleString("pt-BR")}`
                : "—";
            return (
              <Card
                key={c.id}
                className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-md"
                onClick={() => nav({ to: "/admin/disparos/$id", params: { id: c.id } })}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="truncate">{c.name}</CardTitle>
                      <CardDescription className="mt-1 truncate">
                        {c.client?.name ?? "Sem cliente"} · {whenLabel}
                      </CardDescription>
                    </div>
                    <Badge variant="secondary" className={meta.className}>{meta.label}</Badge>
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
                      <span className="font-medium">{sent}/{total}{pct > 0 ? ` · ${pct}%` : ""}</span>
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

                  <div className="flex flex-wrap justify-end gap-1 pt-1 border-t" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" title="Abrir" onClick={() => nav({ to: "/admin/disparos/$id", params: { id: c.id } })}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    {["draft", "scheduled"].includes(c.status) && (
                      <Button variant="ghost" size="icon" title="Enviar agora" onClick={() => startMut.mutate(c.id)}>
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
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}


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

function StatCard({ icon, label, value, active, onClick }: { icon: React.ReactNode; label: string; value: number; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/50 hover:shadow-sm ${active ? "border-primary bg-primary/5 ring-2 ring-primary/15" : ""}`}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
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
