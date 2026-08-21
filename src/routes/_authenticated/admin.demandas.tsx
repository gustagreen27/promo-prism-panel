import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ErrorCard } from "@/components/admin/query-state";
import {
  listApprovalQueue, decideCampaignApproval, configureCampaignDemand, getCampaignApprovalAudit,
  updateExternalExecution, listExternalProgress,
} from "@/lib/campaign-approval.functions";
import { adminListAllNumbers } from "@/lib/admin-dispatch.functions";
import { listTemplates } from "@/lib/whatsapp-templates.functions";
import { adminListTestConnections, adminSetConnectionTestFlag } from "@/lib/wa-tests.functions";
import { History, Loader2, Settings2, FlaskConical, Eye, Gauge, CheckCircle2 } from "lucide-react";
import { DemandPreviewDialog } from "@/components/admin/DemandPreviewDialog";
import { demandStage, pendingCount, STAGE_CLASS, STAGE_LABEL, type DemandStage } from "@/lib/demand-stage";


export const Route = createFileRoute("/_authenticated/admin/demandas")({
  head: () => ({
    meta: [
      { title: "Demandas de disparo — Admin" },
      { name: "description", content: "Revise, configure e aprove as solicitações de disparo enviadas pelos clientes." },
    ],
  }),
  component: Page,
});

type Item = {
  id: string;
  name: string;
  workspace_name: string | null;
  list_name: string | null;
  template_name: string | null;
  connection_name: string | null;
  connection_phone: string | null;
  template_id: string | null;
  connection_id: string | null;
  total_recipients: number | null;
  created_at: string;
  scheduled_at: string | null;
  approval_status: string | null;
  rejection_reason: string | null;
  custom_fields?: Record<string, any> | null;
  test_sends_count?: number;
  execution_type?: string | null;
  external_status?: string | null;
  external_note?: string | null;
  metrics_source?: string | null;
  external_total_count?: number | null;
  external_sent_count?: number | null;
  external_delivered_count?: number | null;
  external_failed_count?: number | null;
  external_started_at?: string | null;
  external_finished_at?: string | null;
  external_updated_at?: string | null;
  stage?: DemandStage;
  status: string;

};

const fmt = (v: string | null | undefined) => (v ? new Date(v).toLocaleString("pt-BR") : "—");

/** ISO → valor de <input type="datetime-local"> no fuso local. */
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

const EXEC_STATE: Record<string, string> = {
  draft: "Rascunho",
  awaiting_approval: "Aguardando revisão",
  scheduled: "Agendado",
  queued: "Em processamento",
  running: "Enviando",
  paused: "Pausado",
  completed: "Concluído",
  cancelled: "Cancelado",
  rejected: "Recusado",
  error: "Erro",
};


function AuditDialog({ campaignId, onClose }: { campaignId: string | null; onClose: () => void }) {
  const auditFn = useServerFn(getCampaignApprovalAudit);
  const { data, isLoading } = useQuery({
    queryKey: ["campaign-audit", campaignId],
    enabled: !!campaignId,
    queryFn: () => auditFn({ data: { campaign_id: campaignId as string } }),
  });
  const entries = ((data as any)?.entries ?? []) as Array<any>;
  return (
    <Dialog open={!!campaignId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Histórico da demanda</DialogTitle></DialogHeader>
        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem registros.</p>
        ) : (
          <div className="max-h-[60vh] space-y-3 overflow-y-auto text-sm">
            {entries.map((e) => (
              <div key={e.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{e.action}</span>
                  <span className="text-xs text-muted-foreground">{fmt(e.created_at)}</span>
                </div>
                <div className="text-xs text-muted-foreground">Por: {e.actor_name}</div>
                {e.message && <div className="mt-1 text-xs">{e.message}</div>}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TestNumbersCard() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListTestConnections);
  const setFn = useServerFn(adminSetConnectionTestFlag);
  const { data } = useQuery({
    queryKey: ["test-connections"],
    queryFn: () => listFn({ data: {} }),
  });
  const rows = ((data as any)?.connections ?? []) as Array<any>;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="h-4 w-4" /> Números permitidos para testes
        </CardTitle>
      </CardHeader>
      <CardContent className="max-h-72 space-y-2 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum número cadastrado.</p>
        ) : rows.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
            <div className="min-w-0">
              <div className="truncate font-medium">{c.label}</div>
              <div className="text-xs text-muted-foreground">{c.phone ?? "—"}</div>
            </div>
            <Switch
              checked={!!c.allow_tests}
              onCheckedChange={async (v) => {
                try {
                  await setFn({ data: { connection_id: c.id, allow_tests: v } });
                  qc.invalidateQueries({ queryKey: ["test-connections"] });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Falha ao atualizar");
                }
              }}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ConfigureDialog({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const qc = useQueryClient();
  const configureFn = useServerFn(configureCampaignDemand);
  const numbersFn = useServerFn(adminListAllNumbers);
  const templatesFn = useServerFn(listTemplates);

  const { data: numbersData } = useQuery({
    queryKey: ["admin-all-numbers"],
    enabled: !!item,
    queryFn: () => numbersFn({ data: {} }),
  });
  const { data: templatesData } = useQuery({
    queryKey: ["admin-templates"],
    enabled: !!item,
    queryFn: () => templatesFn(),
  });

  const [connectionId, setConnectionId] = useState<string>("");
  const [templateId, setTemplateId] = useState<string>("");
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [execType, setExecType] = useState<"internal" | "external">("internal");
  const [note, setNote] = useState<string>("");
  const externalFn = useServerFn(updateExternalExecution);
  const [mTotal, setMTotal] = useState<string>("");
  const [mSent, setMSent] = useState<string>("");
  const [mDelivered, setMDelivered] = useState<string>("");
  const [mFailed, setMFailed] = useState<string>("");
  const [mStart, setMStart] = useState<string>("");
  const [mFinish, setMFinish] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  if (item && loadedFor !== item.id) {
    setLoadedFor(item.id);
    setConnectionId(item.connection_id ?? "");
    setTemplateId(item.template_id ?? "");
    setScheduledAt(item.scheduled_at ? new Date(item.scheduled_at).toISOString().slice(0, 16) : "");
    setExecType(item.execution_type === "external" ? "external" : "internal");
    setNote(item.external_note ?? "");
    setMTotal(item.external_total_count != null ? String(item.external_total_count) : "");
    setMSent(item.external_sent_count != null ? String(item.external_sent_count) : "");
    setMDelivered(item.external_delivered_count != null ? String(item.external_delivered_count) : "");
    setMFailed(item.external_failed_count != null ? String(item.external_failed_count) : "");
    setMStart(item.external_started_at ? toLocalInput(item.external_started_at) : "");
    setMFinish(item.external_finished_at ? toLocalInput(item.external_finished_at) : "");
  }

  const numbers = ((numbersData as any)?.numbers ?? []) as Array<any>;
  const templates = ((templatesData as any) ?? []) as Array<any>;
  const selectedNumber = numbers.find((n) => n.id === connectionId);

  async function save() {
    if (!item) return;
    setBusy(true);
    try {
      await configureFn({
        data: {
          campaign_id: item.id,
          execution_type: execType,
          external_note: execType === "external" ? (note.trim() || null) : null,
          connection_id: execType === "external" ? null : (connectionId || null),
          template_id: execType === "external" ? null : (templateId || null),
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        },
      });

      if (execType === "external") {
        const num = (v: string) => (v.trim() === "" ? null : Number(v));
        const total = num(mTotal), sent = num(mSent), delivered = num(mDelivered), failed = num(mFailed);
        for (const [label, v] of [["Total", total], ["Enviados", sent], ["Entregues", delivered], ["Falhas", failed]] as const) {
          if (v != null && (!Number.isFinite(v) || v < 0 || !Number.isInteger(v))) {
            throw new Error(`${label}: informe um número inteiro maior ou igual a zero.`);
          }
        }
        if (total != null) {
          if (sent != null && sent > total) throw new Error("Enviados não podem ser maiores que o total.");
          if (failed != null && failed > total) throw new Error("Falhas não podem ser maiores que o total.");
          if (delivered != null && delivered > total) throw new Error("Entregues não podem ser maiores que o total.");
          if (sent != null && failed != null && sent + failed > total)
            throw new Error("Enviados + falhas não podem ultrapassar o total.");
        }
        if (delivered != null && sent != null && delivered > sent)
          throw new Error("Entregues não podem ser maiores que os enviados com sucesso.");

        await externalFn({
          data: {
            campaign_id: item.id,
            external_total_count: total,
            external_sent_count: sent,
            external_delivered_count: delivered,
            external_failed_count: failed,
            external_started_at: mStart ? new Date(mStart).toISOString() : null,
            external_finished_at: mFinish ? new Date(mFinish).toISOString() : null,
          } as any,
        });
      }

      toast.success("Configuração salva");
      qc.invalidateQueries({ queryKey: ["approval-queue"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Configurar demanda — {item?.name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Forma de execução</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {([
                { v: "internal", t: "Executar pela plataforma", d: "Usa BM/WABA, número e template internos." },
                { v: "external", t: "Executar externamente", d: "Atendido por fora do sistema, sem criar disparo na fila." },
              ] as const).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setExecType(o.v)}
                  className={`rounded-lg border p-3 text-left text-xs transition ${
                    execType === o.v ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50"
                  }`}
                >
                  <div className="text-sm font-medium">{o.t}</div>
                  <div className="mt-0.5 text-muted-foreground">{o.d}</div>
                </button>
              ))}
            </div>
          </div>

          {execType === "external" ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Observação interna (visível apenas para o admin)</Label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ex.: Disparo realizado por ferramenta externa."
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Não exige BM, WABA, número, template ou conexão. Ao aprovar, nada é enviado para a fila da plataforma.
                </p>
              </div>

              <div className="space-y-3 rounded-lg border border-violet-500/30 bg-violet-500/5 p-3">
                <div className="text-sm font-medium">Resultado do envio externo</div>
                <p className="text-xs text-muted-foreground">
                  Métricas informadas manualmente pelo admin (marcadas como <code>metrics_source = manual</code>), sem
                  relação com webhooks da API do WhatsApp.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {([
                    ["Quantidade total de mensagens", mTotal, setMTotal],
                    ["Enviadas com sucesso", mSent, setMSent],
                    ["Entregues", mDelivered, setMDelivered],
                    ["Falhas", mFailed, setMFailed],
                  ] as const).map(([label, value, setter]) => (
                    <div key={label} className="space-y-1.5">
                      <Label className="text-xs">{label}</Label>
                      <Input
                        type="number"
                        min={0}
                        value={value}
                        onChange={(e) => (setter as (v: string) => void)(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  ))}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Início do disparo</Label>
                    <Input type="datetime-local" value={mStart} onChange={(e) => setMStart(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Finalização do disparo</Label>
                    <Input type="datetime-local" value={mFinish} onChange={(e) => setMFinish(e.target.value)} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Ao atingir a data/hora de finalização (ou ao marcar manualmente), a demanda fica como Concluído.
                </p>
              </div>
            </div>
          ) : (
          <>
          <div className="space-y-1.5">
            <Label>Número de envio (BM / WABA / conexão)</Label>
            <Select value={connectionId} onValueChange={setConnectionId}>
              <SelectTrigger><SelectValue placeholder="Selecione o número remetente" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {numbers.map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    {n.display_name} · {n.phone_display ?? "—"}{n.waba_name ? ` · ${n.waba_name}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedNumber && (
              <p className="text-xs text-muted-foreground">
                BM: {selectedNumber.business_id ?? "—"} · WABA: {selectedNumber.waba_id ?? "—"}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Template do WhatsApp</Label>

            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger><SelectValue placeholder="Selecione o template" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} · {t.language}{t.status ? ` · ${t.status}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          </>
          )}

          <div className="space-y-1.5">
            <Label>Data/hora do disparo (opcional)</Label>
            <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button onClick={() => void save()} disabled={busy}>{busy ? "Salvando…" : "Salvar configuração"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const EXTERNAL_STATUS: Array<{ v: string; label: string }> = [
  { v: "scheduled_external", label: "Agendada" },
  { v: "in_progress", label: "Em fila" },
  { v: "completed", label: "Finalizado" },
  { v: "cancelled", label: "Cancelado" },
];

/** Painel de acompanhamento manual de uma execução externa. */
function ExternalControls({ item }: { item: Item }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateExternalExecution);
  const historyFn = useServerFn(listExternalProgress);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(item.external_note ?? "");
  const [total, setTotal] = useState(item.external_total_count != null ? String(item.external_total_count) : "");
  const [sent, setSent] = useState(item.external_sent_count != null ? String(item.external_sent_count) : "");
  const [delivered, setDelivered] = useState(item.external_delivered_count != null ? String(item.external_delivered_count) : "");
  const [failed, setFailed] = useState(item.external_failed_count != null ? String(item.external_failed_count) : "");
  const [start, setStart] = useState(item.external_started_at ? toLocalInput(item.external_started_at) : "");
  const [finish, setFinish] = useState(item.external_finished_at ? toLocalInput(item.external_finished_at) : "");

  const { data: hist } = useQuery({
    queryKey: ["external-progress", item.id],
    enabled: open,
    queryFn: () => historyFn({ data: { campaign_id: item.id } }),
  });
  const entries = ((hist as any)?.entries ?? []) as Array<any>;

  const n = (v: string) => (v.trim() === "" ? null : Number(v));
  const previewPending = Math.max(0, (n(total) ?? 0) - (n(sent) ?? 0) - (n(failed) ?? 0));
  const pending = pendingCount(item);
  const progressPct = item.external_total_count
    ? Math.min(100, Math.round((((item.external_sent_count ?? 0) + (item.external_failed_count ?? 0)) / item.external_total_count) * 100))
    : 0;

  async function push(patch: Record<string, any>, msg = "Execução externa atualizada") {
    setBusy(true);
    try {
      await updateFn({ data: { campaign_id: item.id, ...patch } as any });
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ["approval-queue"] });
      qc.invalidateQueries({ queryKey: ["external-progress", item.id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao atualizar");
    } finally {
      setBusy(false);
    }
  }

  async function saveMetrics() {
    const t = n(total), s = n(sent), d = n(delivered), f = n(failed);
    for (const [label, v] of [["Total", t], ["Enviados", s], ["Entregues", d], ["Falhas", f]] as const) {
      if (v != null && (!Number.isInteger(v) || v < 0)) {
        toast.error(`${label}: informe um número inteiro maior ou igual a zero.`);
        return;
      }
    }
    await push({
      external_total_count: t,
      external_sent_count: s,
      external_delivered_count: d,
      external_failed_count: f,
      external_started_at: start ? new Date(start).toISOString() : null,
      external_finished_at: finish ? new Date(finish).toISOString() : null,
      external_note: note.trim() || null,
    }, "Resultados atualizados");
    setOpen(false);
  }

  return (
    <div className="max-w-2xl space-y-2 rounded-lg border border-violet-500/30 bg-violet-500/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium">Execução externa (somente admin)</div>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="rounded-md border bg-background/60 p-2 text-xs">
        <div className="mb-1 flex items-center justify-between">
          <span className="font-medium">Andamento (atualização manual)</span>
          <span className="text-muted-foreground">{progressPct}%</span>
        </div>
        <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="grid gap-0.5 text-muted-foreground sm:grid-cols-2">
          <span>Total: {(item.external_total_count ?? 0).toLocaleString("pt-BR")}</span>
          <span>Enviados: {(item.external_sent_count ?? 0).toLocaleString("pt-BR")}</span>
          <span>Entregues: {(item.external_delivered_count ?? 0).toLocaleString("pt-BR")}</span>
          <span>Falhas: {(item.external_failed_count ?? 0).toLocaleString("pt-BR")}</span>
          <span>Pendentes: {pending.toLocaleString("pt-BR")}</span>
          {item.external_started_at && <span>Início: {fmt(item.external_started_at)}</span>}
          {item.external_updated_at && <span>Última atualização: {fmt(item.external_updated_at)}</span>}
          {item.external_finished_at && <span>Finalização: {fmt(item.external_finished_at)}</span>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setOpen(true)}>
          <Gauge className="mr-1 h-4 w-4" /> Atualizar resultados
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || item.external_status === "completed"}
          onClick={() => void push({ finalize_now: true }, "Disparo finalizado")}
        >
          <CheckCircle2 className="mr-1 h-4 w-4" /> Finalizar disparo
        </Button>
        <Select value={item.external_status ?? ""} onValueChange={(v) => void push({ external_status: v })}>
          <SelectTrigger className="h-8 w-48 text-xs"><SelectValue placeholder="Mudar etapa" /></SelectTrigger>
          <SelectContent>
            {EXTERNAL_STATUS.map((s) => (
              <SelectItem key={s.v} value={s.v}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Atualizar resultados — {item.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                ["Total de destinatários", total, setTotal],
                ["Enviados com sucesso", sent, setSent],
                ["Entregues", delivered, setDelivered],
                ["Falhas", failed, setFailed],
              ] as const).map(([label, value, setter]) => (
                <div key={label} className="space-y-1.5">
                  <Label className="text-xs">{label}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={value}
                    onChange={(e) => (setter as (v: string) => void)(e.target.value)}
                    placeholder="0"
                  />
                </div>
              ))}
              <div className="space-y-1.5">
                <Label className="text-xs">Pendentes (calculado)</Label>
                <Input value={previewPending.toLocaleString("pt-BR")} readOnly className="bg-muted/50" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Início do disparo</Label>
                <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Finalizar em (opcional)</Label>
                <Input type="datetime-local" value={finish} onChange={(e) => setFinish(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  Ao chegar nesse horário a demanda passa automaticamente para Finalizado, mantendo as últimas métricas.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Observação interna</Label>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium">Histórico de atualizações</div>
              {entries.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma atualização registrada ainda.</p>
              ) : (
                <div className="max-h-48 space-y-1.5 overflow-y-auto text-xs">
                  {entries.map((e) => (
                    <div key={e.id} className="rounded-md border p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">{fmt(e.created_at)}</span>
                        <span className="text-muted-foreground">{e.actor_name}</span>
                      </div>
                      <div>
                        {(e.sent ?? 0).toLocaleString("pt-BR")} enviados ·{" "}
                        {(e.delivered ?? 0).toLocaleString("pt-BR")} entregues ·{" "}
                        {(e.failed ?? 0).toLocaleString("pt-BR")} falhas
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={() => void saveMetrics()} disabled={busy}>
              {busy ? "Salvando…" : "Salvar atualização"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function Page() {
  const qc = useQueryClient();
  const listFn = useServerFn(listApprovalQueue);
  const decideFn = useServerFn(decideCampaignApproval);

  const [tab, setTab] = useState<DemandStage | "all">("pending");
  const [configItem, setConfigItem] = useState<Item | null>(null);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const navigate = useNavigate();
  const [decision, setDecision] = useState<{ item: Item; kind: "approved" | "rejected" } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["approval-queue", tab],
    queryFn: () => listFn({ data: { status: tab } }),
    refetchInterval: 30_000,
  });
  const items = useMemo(() => ((data as any)?.items ?? []) as Item[], [data]);
  const counts = ((data as any)?.counts ?? {}) as Record<string, number>;


  async function submit(target: "scheduled" | "queued" = "queued") {
    if (!decision) return;
    if (decision.kind === "rejected" && reason.trim().length < 3) {
      toast.error("Informe o motivo da recusa");
      return;
    }
    setBusy(true);
    try {
      const campaignId = decision.item.id;
      const res: any = await decideFn({
        data: { campaign_id: campaignId, decision: decision.kind, reason: reason.trim() || null, target },
      });
      if (res?.already) {
        toast.info("Esta demanda já havia sido decidida.");
      } else if (decision.kind === "approved" && res?.external) {
        toast.success(
          target === "scheduled"
            ? "Demanda agendada para execução externa"
            : "Demanda em fila — atualize as métricas manualmente conforme o envio avança",
        );
      } else if (decision.kind === "approved") {
        toast.success(target === "scheduled" ? "Demanda agendada" : "Demanda em fila — pronta para execução", {
          action: {
            label: "Abrir disparo",
            onClick: () => void navigate({ to: "/admin/disparos/$id", params: { id: campaignId } }),
          },
        });
      } else {
        toast.success("Demanda recusada");
      }

      setDecision(null);
      setReason("");
      qc.invalidateQueries({ queryKey: ["approval-queue"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao registrar decisão");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Demandas de disparo</CardTitle>
            <p className="text-sm text-muted-foreground">
              Solicitações dos clientes. Só entram em /admin/disparos após aprovação.
            </p>
          </div>
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              {(["pending", "scheduled", "queued", "completed", "rejected"] as DemandStage[]).map((s) => (
                <TabsTrigger key={s} value={s}>
                  {STAGE_LABEL[s]}
                  {counts[s] ? ` (${counts[s]})` : ""}
                </TabsTrigger>
              ))}
              <TabsTrigger value="all">Todas</TabsTrigger>
            </TabsList>
          </Tabs>

        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : error ? (
            <ErrorCard error={error} onRetry={() => refetch()} />
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma demanda nesta aba.</p>
          ) : (
            <div className="divide-y">
              {items.map((r) => {
                const stage = r.stage ?? demandStage(r as any);
                const badge = { label: STAGE_LABEL[stage], className: STAGE_CLASS[stage] };

                const brief = r.custom_fields ?? {};
                return (
                  <div key={r.id} className="space-y-2 py-4 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.name}</span>
                      <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
                      <Badge variant="secondary">{EXEC_STATE[r.status] ?? r.status}</Badge>
                      {(r.test_sends_count ?? 0) > 0 && (
                        <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-600">
                          {r.test_sends_count} teste(s)
                        </Badge>
                      )}
                      {r.execution_type === "external" && (
                        <Badge variant="outline" className="border-violet-500/30 bg-violet-500/10 text-violet-600">
                          Execução externa
                        </Badge>
                      )}
                    </div>
                    <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                      <span>Cliente: {r.workspace_name ?? "—"}</span>
                      <span>Contatos: {(r.total_recipients ?? 0).toLocaleString("pt-BR")}</span>
                      <span>Criada em: {fmt(r.created_at)}</span>
                      <span>Agendada: {fmt(r.scheduled_at)}</span>
                      <span>Lista/arquivo: {r.list_name ?? brief.recipients_source ?? "—"}</span>
                      <span>DDD: {brief.ddd_filter ? `+${brief.ddd_filter}` : "Qualquer"}</span>
                      <span>Número de envio: {r.connection_name ? `${r.connection_name} (${r.connection_phone ?? "—"})` : "a definir"}</span>
                      <span>Template: {r.template_name ?? "a definir"}</span>
                    </div>
                    {brief.message && (
                      <div className="max-w-2xl whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-xs">
                        {brief.message}
                        {brief.media_url && (
                          <a href={brief.media_url} target="_blank" rel="noreferrer" className="mt-2 block underline">
                            Ver mídia enviada
                          </a>
                        )}
                        {brief.test_numbers && (
                          <div className="mt-2">Números de teste do cliente: {String(brief.test_numbers)}</div>
                        )}
                      </div>
                    )}
                    {r.approval_status === "rejected" && r.rejection_reason && (
                      <div className="text-xs text-destructive">Motivo da recusa: {r.rejection_reason}</div>
                    )}
                    {r.execution_type === "external" && <ExternalControls item={r} />}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="secondary" onClick={() => setPreviewId(r.id)}>
                        <Eye className="mr-1 h-4 w-4" /> Ver preview
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setAuditId(r.id)}>
                        <History className="mr-1 h-4 w-4" /> Histórico
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setConfigItem(r)}>
                        <Settings2 className="mr-1 h-4 w-4" /> Configurar
                      </Button>
                      {r.approval_status !== "rejected" && (
                        <Button size="sm" variant="outline" onClick={() => { setReason(""); setDecision({ item: r, kind: "rejected" }); }}>
                          Recusar
                        </Button>
                      )}
                      {r.approval_status !== "approved" && (
                        <Button size="sm" onClick={() => { setReason(""); setDecision({ item: r, kind: "approved" }); }}>
                          Aprovar
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <TestNumbersCard />

      <ConfigureDialog item={configItem} onClose={() => setConfigItem(null)} />
      <AuditDialog campaignId={auditId} onClose={() => setAuditId(null)} />
      <DemandPreviewDialog campaignId={previewId} onClose={() => setPreviewId(null)} />

      <Dialog open={!!decision} onOpenChange={(o) => !o && setDecision(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision?.kind === "approved" ? "Aprovar demanda" : "Recusar demanda"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {decision?.kind === "approved"
              ? `"${decision?.item.name}" será liberada para envio a ${(decision?.item.total_recipients ?? 0).toLocaleString("pt-BR")} contatos usando ${decision?.item.connection_name ?? "o número configurado"} e o template ${decision?.item.template_name ?? "configurado"}.`
              : "O cliente verá o motivo informado no painel dele."}
          </p>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={decision?.kind === "approved" ? "Observação (opcional)" : "Motivo da recusa (obrigatório)"}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)} disabled={busy}>Cancelar</Button>
            <Button onClick={() => void submit()} disabled={busy}>
              {busy ? "Salvando…" : decision?.kind === "approved" ? "Aprovar e enviar para a fila" : "Recusar demanda"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
