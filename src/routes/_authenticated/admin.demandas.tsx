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
  updateExternalExecution,
} from "@/lib/campaign-approval.functions";
import { adminListAllNumbers } from "@/lib/admin-dispatch.functions";
import { listTemplates } from "@/lib/whatsapp-templates.functions";
import { adminListTestConnections, adminSetConnectionTestFlag } from "@/lib/wa-tests.functions";
import { History, Loader2, Settings2, FlaskConical, Eye } from "lucide-react";
import { DemandPreviewDialog } from "@/components/admin/DemandPreviewDialog";

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
  status: string;
};

const fmt = (v: string | null | undefined) => (v ? new Date(v).toLocaleString("pt-BR") : "—");

const DEMAND_STATE: Record<string, { label: string; className: string }> = {
  pending: { label: "Aguardando revisão", className: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  approved: { label: "Aprovado", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  rejected: { label: "Recusado", className: "bg-destructive/15 text-destructive border-destructive/30" },
};

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
  const [busy, setBusy] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  if (item && loadedFor !== item.id) {
    setLoadedFor(item.id);
    setConnectionId(item.connection_id ?? "");
    setTemplateId(item.template_id ?? "");
    setScheduledAt(item.scheduled_at ? new Date(item.scheduled_at).toISOString().slice(0, 16) : "");
    setExecType(item.execution_type === "external" ? "external" : "internal");
    setNote(item.external_note ?? "");
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
  { v: "approved_external", label: "Aprovado para execução externa" },
  { v: "in_progress", label: "Em andamento" },
  { v: "completed", label: "Concluído" },
  { v: "cancelled", label: "Cancelado" },
];

function ExternalControls({ item }: { item: Item }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateExternalExecution);
  const [note, setNote] = useState(item.external_note ?? "");
  const [busy, setBusy] = useState(false);

  async function push(patch: { external_status?: string; external_note?: string | null }) {
    setBusy(true);
    try {
      await updateFn({ data: { campaign_id: item.id, ...patch } as any });
      toast.success("Execução externa atualizada");
      qc.invalidateQueries({ queryKey: ["approval-queue"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao atualizar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-2 rounded-lg border border-violet-500/30 bg-violet-500/5 p-3">
      <div className="text-xs font-medium">Execução externa (somente admin)</div>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={item.external_status ?? ""}
          onValueChange={(v) => void push({ external_status: v })}
        >
          <SelectTrigger className="h-8 w-64 text-xs"><SelectValue placeholder="Definir status manual" /></SelectTrigger>
          <SelectContent>
            {EXTERNAL_STATUS.map((s) => (
              <SelectItem key={s.v} value={s.v}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      <Textarea
        rows={2}
        className="text-xs"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Observação interna (ex.: Disparo realizado por ferramenta externa.)"
      />
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void push({ external_note: note.trim() || null })}>
        Salvar observação
      </Button>
    </div>
  );
}

function Page() {
  const qc = useQueryClient();
  const listFn = useServerFn(listApprovalQueue);
  const decideFn = useServerFn(decideCampaignApproval);

  const [tab, setTab] = useState<"pending" | "approved" | "rejected" | "all">("pending");
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

  async function submit() {
    if (!decision) return;
    if (decision.kind === "rejected" && reason.trim().length < 3) {
      toast.error("Informe o motivo da recusa");
      return;
    }
    setBusy(true);
    try {
      const campaignId = decision.item.id;
      const res: any = await decideFn({
        data: { campaign_id: campaignId, decision: decision.kind, reason: reason.trim() || null },
      });
      if (res?.already) {
        toast.info("Esta demanda já havia sido decidida.");
      } else if (decision.kind === "approved") {
        toast.success("Demanda aprovada — disparo pronto para execução", {
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
              <TabsTrigger value="pending">Aguardando</TabsTrigger>
              <TabsTrigger value="approved">Aprovadas</TabsTrigger>
              <TabsTrigger value="rejected">Recusadas</TabsTrigger>
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
                const badge = DEMAND_STATE[r.approval_status ?? ""] ?? { label: r.approval_status ?? "—", className: "" };
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
