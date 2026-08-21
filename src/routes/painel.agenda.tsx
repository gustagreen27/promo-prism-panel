import { usePanelWorkspace } from "@/lib/use-panel-workspace";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import ptBrLocale from "@fullcalendar/core/locales/pt-br";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { listAgendaFeed, rescheduleCampaign, pauseCampaignWs, resumeCampaignWs, cancelCampaignWs, duplicateCampaign, getCampaignAuditLog } from "@/lib/wa-schedule.functions";
import { syncCampaignToGoogle } from "@/lib/google-calendar.functions";
import { useNavigate } from "@tanstack/react-router";
import { CalendarPlus, Copy, Pause, Play, Trash2, RefreshCw, ExternalLink, X } from "lucide-react";

export const Route = createFileRoute("/painel/agenda")({
  head: () => ({ meta: [{ title: "Agenda — Disparos FR" }] }),
  component: Page,
});

const STATUS_COLORS: Record<string, string> = {
  draft: "#94a3b8",
  scheduled: "#3b82f6",
  running: "#10b981",
  paused: "#f59e0b",
  completed: "#6366f1",
  cancelled: "#64748b",
  error: "#ef4444",
  awaiting_approval: "#a855f7",
  queued: "#0ea5e9",
  partial: "#f59e0b",
  blocked: "#ef4444",
};

function Page() {
  const { workspaceId } = usePanelWorkspace();
  const navigate = useNavigate();
  const calRef = useRef<any>(null);
  const [range, setRange] = useState<{ from: string; to: string }>(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const to = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString();
    return { from, to };
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleAt, setRescheduleAt] = useState("");

  const feedFn = useServerFn(listAgendaFeed);
  const rescheduleFn = useServerFn(rescheduleCampaign);
  const pauseFn = useServerFn(pauseCampaignWs);
  const resumeFn = useServerFn(resumeCampaignWs);
  const cancelFn = useServerFn(cancelCampaignWs);
  const duplicateFn = useServerFn(duplicateCampaign);
  const auditFn = useServerFn(getCampaignAuditLog);
  const syncFn = useServerFn(syncCampaignToGoogle);

  const qc = useQueryClient();
  const { data, refetch } = useQuery({
    queryKey: ["agenda-feed", workspaceId, range.from, range.to],
    queryFn: () => feedFn({ data: { workspace_id: workspaceId, from: range.from, to: range.to } }),
  });

  const selected = useMemo(() => {
    if (!selectedId || !data) return null;
    return data.campaigns.find((c: any) => c.id === selectedId) || null;
  }, [selectedId, data]);

  const { data: audit } = useQuery({
    queryKey: ["campaign-audit", selectedId],
    queryFn: () => auditFn({ data: { campaign_id: selectedId! } }),
    enabled: !!selectedId,
  });

  const events = useMemo(() => {
    if (!data) return [];
    const camps = data.campaigns.map((c: any) => ({
      id: `camp:${c.id}`,
      title: `📣 ${c.name}`,
      start: c.scheduled_at,
      end: c.finished_at ?? undefined,
      backgroundColor: STATUS_COLORS[c.status] ?? "#64748b",
      borderColor: STATUS_COLORS[c.status] ?? "#64748b",
      extendedProps: { kind: "campaign", raw: c },
    }));
    const evts = data.events.map((e: any) => ({
      id: `evt:${e.id}`,
      title: e.title,
      start: e.start_time,
      end: e.end_time ?? undefined,
      backgroundColor: "#0ea5e9",
      borderColor: "#0ea5e9",
      extendedProps: { kind: "event", raw: e },
    }));
    return [...camps, ...evts];
  }, [data]);

  function doReschedule() {
    if (!selectedId || !rescheduleAt) return;
    rescheduleFn({ data: { campaign_id: selectedId, scheduled_at: new Date(rescheduleAt).toISOString() } })
      .then(() => { toast.success("Reagendada"); setRescheduleOpen(false); refetch(); qc.invalidateQueries({ queryKey: ["campaign-audit"] }); })
      .catch((e: any) => toast.error(e?.message ?? "Erro"));
  }
  function doPause() {
    if (!selectedId) return;
    pauseFn({ data: { campaign_id: selectedId } }).then(() => { toast.success("Pausada"); refetch(); }).catch((e: any) => toast.error(e?.message));
  }
  function doResume() {
    if (!selectedId) return;
    resumeFn({ data: { campaign_id: selectedId } }).then(() => { toast.success("Retomada"); refetch(); }).catch((e: any) => toast.error(e?.message));
  }
  function doCancel() {
    if (!selectedId) return;
    if (!confirm("Cancelar esta campanha?")) return;
    cancelFn({ data: { campaign_id: selectedId } }).then(() => { toast.success("Cancelada"); setSelectedId(null); refetch(); }).catch((e: any) => toast.error(e?.message));
  }
  function doDuplicate() {
    if (!selectedId) return;
    duplicateFn({ data: { campaign_id: selectedId } })
      .then((r: any) => { toast.success("Duplicada"); navigate({ to: "/painel/campanhas" }); })
      .catch((e: any) => toast.error(e?.message));
  }
  function doSync() {
    if (!selectedId) return;
    syncFn({ data: { campaign_id: selectedId } })
      .then((r: any) => { toast.success("Sincronizada"); if (r?.html_link) window.open(r.html_link, "_blank"); })
      .catch((e: any) => toast.error(e?.message ?? "Configure Google Calendar em Configurações."));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agenda de disparos</h1>
          <p className="text-sm text-muted-foreground">Visualize e gerencie todas as campanhas agendadas.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button>
          <Button onClick={() => navigate({ to: "/painel/campanhas/nova" })}>
            <CalendarPlus className="mr-2 h-4 w-4" />Nova campanha
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-3 sm:p-6">
          <div className="fc-wrapper">
            <FullCalendar
              ref={calRef as any}
              plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
              headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek" }}
              buttonText={{ today: "Hoje", month: "Mês", week: "Semana", day: "Dia", list: "Lista" }}
              initialView="dayGridMonth"
              locale={ptBrLocale}
              nowIndicator
              height="auto"
              events={events}
              datesSet={(info) => setRange({ from: info.startStr, to: info.endStr })}
              eventClick={(info) => {
                const raw = info.event.extendedProps.raw as any;
                const kind = info.event.extendedProps.kind as string;
                if (kind === "campaign") setSelectedId(raw.id);
                info.jsEvent.preventDefault();
              }}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {Object.entries(STATUS_COLORS).map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: v }} />{k}
          </span>
        ))}
      </div>

      <Sheet open={!!selectedId} onOpenChange={(v) => !v && setSelectedId(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selected?.name ?? "Campanha"}</SheetTitle>
            <SheetDescription className="flex flex-wrap items-center gap-2">
              <Badge style={{ background: STATUS_COLORS[selected?.status ?? ""] ?? "#64748b" }} className="text-white">
                {selected?.status}
              </Badge>
              {selected?.scheduled_at && (
                <span>{new Date(selected.scheduled_at).toLocaleString("pt-BR")}</span>
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-3 text-sm">
            <div><span className="text-muted-foreground">Número:</span> {selected?.connection?.display_name ?? selected?.connection?.display_phone ?? "—"}</div>
            <div><span className="text-muted-foreground">Template:</span> {selected?.template?.name ?? "—"}</div>
            <div><span className="text-muted-foreground">Contatos:</span> {selected?.total_recipients ?? 0}</div>
            <div><span className="text-muted-foreground">Fuso:</span> {selected?.timezone ?? "America/Sao_Paulo"}</div>
          </div>

          <div className="mt-6 space-y-2">
            <h4 className="text-sm font-semibold">Ações</h4>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="outline" onClick={() => { setRescheduleAt(selected?.scheduled_at ? new Date(selected.scheduled_at).toISOString().slice(0, 16) : ""); setRescheduleOpen(true); }}>
                <CalendarPlus className="mr-2 h-4 w-4" />Reagendar
              </Button>
              <Button size="sm" variant="outline" onClick={doDuplicate}><Copy className="mr-2 h-4 w-4" />Duplicar</Button>
              {selected?.status === "paused"
                ? <Button size="sm" variant="outline" onClick={doResume}><Play className="mr-2 h-4 w-4" />Retomar</Button>
                : <Button size="sm" variant="outline" onClick={doPause} disabled={!["running", "scheduled"].includes(selected?.status ?? "")}><Pause className="mr-2 h-4 w-4" />Pausar</Button>}
              <Button size="sm" variant="outline" onClick={doSync}><ExternalLink className="mr-2 h-4 w-4" />Sync Google</Button>
              <Button size="sm" variant="destructive" onClick={doCancel} className="col-span-2"><X className="mr-2 h-4 w-4" />Cancelar campanha</Button>
            </div>
          </div>

          <div className="mt-6">
            <h4 className="text-sm font-semibold">Histórico</h4>
            <ul className="mt-2 space-y-1.5 text-xs">
              {(audit ?? []).map((a: any) => (
                <li key={a.id} className="rounded border p-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{a.action}</span>
                    <span className="text-muted-foreground">{new Date(a.created_at).toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="text-muted-foreground">{a.message}</div>
                  {a.actor?.full_name && <div className="text-muted-foreground">por {a.actor.full_name}</div>}
                </li>
              ))}
              {(!audit || audit.length === 0) && <li className="text-muted-foreground">Sem alterações registradas.</li>}
            </ul>
          </div>

          <SheetFooter className="mt-4">
            <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>Fechar</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reagendar campanha</DialogTitle></DialogHeader>
          <div>
            <Label>Nova data/hora</Label>
            <Input type="datetime-local" value={rescheduleAt} onChange={(e) => setRescheduleAt(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleOpen(false)}>Cancelar</Button>
            <Button onClick={doReschedule}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style>{`
        .fc-wrapper { --fc-border-color: hsl(var(--border)); }
        .fc .fc-toolbar-title { font-size: 1.1rem; font-weight: 600; }
        .fc .fc-button { text-transform: capitalize; }
        .fc .fc-button-primary { background: hsl(var(--secondary)); color: hsl(var(--secondary-foreground)); border: 1px solid hsl(var(--border)); }
        .fc .fc-button-primary:not(:disabled).fc-button-active { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); }
        .fc-event { cursor: pointer; }
      `}</style>
    </div>
  );
}
