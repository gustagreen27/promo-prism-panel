import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  listMyNumbers,
  listMyTemplates,
  getMyBalance,
  createClientCampaign,
  startClientCampaign,
} from "@/lib/client-panel.functions";
import { linkEventToCampaign } from "@/lib/calendar.functions";
import { checkSchedulingConflict } from "@/lib/wa-schedule.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  CalendarClock, CheckCircle2, Plus, AlertTriangle, ArrowLeft, ArrowRight,
  Phone, MessageSquareText, Users, Sliders, ClipboardCheck, Send, Save, Clock, Signal, Wifi, WifiOff, Loader2,
} from "lucide-react";
import { Stepper, type WizardStep } from "@/components/campaigns/wizard/Stepper";
import { WhatsAppPreview } from "@/components/campaigns/wizard/WhatsAppPreview";
import { ContactPicker } from "@/components/campaigns/wizard/ContactPicker";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  event_id: z.string().uuid().optional(),
  scheduled_for: z.string().optional(),
});

export const Route = createFileRoute("/painel/campanhas/nova")({
  head: () => ({ meta: [{ title: "Nova campanha — Disparos FR" }] }),
  validateSearch: (s) => searchSchema.parse(s),
  component: Page,
});

type NumberRow = {
  id: string; display_name: string; phone_masked: string; status: string;
  quality_rating?: string | null; messaging_limit_tier?: string | null; daily_cap?: number | null;
};
type TemplateRow = {
  id: string; name: string; language: string; category: string; body: string;
  header_type?: string | null; header_text?: string | null; footer?: string | null;
  buttons?: any[]; status?: string | null;
};
type Mode = "now" | "schedule" | "draft";

const TIMEZONES = [
  "America/Sao_Paulo", "America/Manaus", "America/Belem", "America/Fortaleza",
  "America/Cuiaba", "America/Rio_Branco", "America/Noronha",
  "America/New_York", "America/Los_Angeles", "Europe/Lisbon", "Europe/London", "UTC",
];

const STEPS: WizardStep[] = [
  { id: 1, label: "Número", short: "Número" },
  { id: 2, label: "Template", short: "Template" },
  { id: 3, label: "Contatos", short: "Contatos" },
  { id: 4, label: "Configuração", short: "Configuração" },
  { id: 5, label: "Revisão", short: "Revisão" },
  { id: 6, label: "Envio", short: "Envio" },
];

function Page() {
  const { workspaceId } = Route.useRouteContext() as { workspaceId: string };
  const { event_id, scheduled_for } = Route.useSearch();
  const navigate = useNavigate();
  const fnListNumbers = useServerFn(listMyNumbers);
  const fnListTemplates = useServerFn(listMyTemplates);
  const fnBalance = useServerFn(getMyBalance);
  const fnCreate = useServerFn(createClientCampaign);
  const fnStart = useServerFn(startClientCampaign);
  const fnLink = useServerFn(linkEventToCampaign);
  const fnConflict = useServerFn(checkSchedulingConflict);

  // Draft persistence key
  const DRAFT_KEY = `wa_wizard_draft_${workspaceId}`;

  const toLocal = (iso?: string) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");

  // Wizard state
  const [step, setStep] = useState(1);
  const [maxReached, setMaxReached] = useState(1);
  const [name, setName] = useState("");
  const [connectionId, setConnectionId] = useState<string>("");
  const [templateId, setTemplateId] = useState<string>("");
  const [contactSel, setContactSel] = useState<{ list_id: string; list_name?: string; total?: number; valid?: number } | null>(null);
  const [rate, setRate] = useState({ send_rate_per_min: 30, batch_size: 25, jitter_ms: 500 });
  const [mode, setMode] = useState<Mode>(scheduled_for ? "schedule" : "now");
  const [scheduledAt, setScheduledAt] = useState<string>(toLocal(scheduled_for));
  const [timezone, setTimezone] = useState<string>(Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo");
  const [forceConflict, setForceConflict] = useState(false);

  // Data
  const [numbers, setNumbers] = useState<NumberRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [balance, setBalance] = useState<{ available: number; unit_price_cents?: number } | null>(null);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [successCampaignId, setSuccessCampaignId] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [showRestore, setShowRestore] = useState(false);

  // -------------------- Load reference data --------------------
  useEffect(() => {
    (async () => {
      const [n, b] = await Promise.all([
        fnListNumbers({ data: { workspace_id: workspaceId } }),
        fnBalance({ data: { workspace_id: workspaceId } }),
      ]);
      setNumbers(n.numbers);
      setBalance(b);
      if (n.numbers.length === 1) setConnectionId(n.numbers[0].id);
    })().catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar dados"));
  }, [workspaceId, fnListNumbers, fnBalance]);

  useEffect(() => {
    if (!connectionId) { setTemplates([]); return; }
    fnListTemplates({ data: { workspace_id: workspaceId, connection_id: connectionId } })
      .then((r) => setTemplates(r.templates))
      .catch(() => setTemplates([]));
  }, [connectionId, workspaceId, fnListTemplates]);

  // -------------------- Draft: restore on mount --------------------
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) setShowRestore(true);
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.name) setName(d.name);
      if (d.connectionId) setConnectionId(d.connectionId);
      if (d.templateId) setTemplateId(d.templateId);
      if (d.contactSel) setContactSel(d.contactSel);
      if (d.rate) setRate(d.rate);
      if (d.mode) setMode(d.mode);
      if (d.scheduledAt) setScheduledAt(d.scheduledAt);
      if (d.timezone) setTimezone(d.timezone);
      if (d.step) { setStep(d.step); setMaxReached(Math.max(d.step, d.maxReached ?? 1)); }
      setDraftRestored(true);
      toast.success("Rascunho restaurado");
    } catch { /* ignore */ }
    setShowRestore(false);
  }
  function discardDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    setShowRestore(false);
  }

  // -------------------- Draft: auto-save --------------------
  useEffect(() => {
    if (successCampaignId) return; // não persiste após envio
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          name, connectionId, templateId, contactSel, rate, mode, scheduledAt, timezone, step, maxReached,
          savedAt: Date.now(),
        }));
      } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(t);
  }, [name, connectionId, templateId, contactSel, rate, mode, scheduledAt, timezone, step, maxReached, successCampaignId, DRAFT_KEY]);

  // -------------------- Live conflict check --------------------
  useEffect(() => {
    setConflicts([]);
    if (mode !== "schedule" || !connectionId || !scheduledAt) return;
    const t = setTimeout(() => {
      fnConflict({ data: { workspace_id: workspaceId, connection_id: connectionId, scheduled_at: new Date(scheduledAt).toISOString() } })
        .then((r: any) => setConflicts(r.conflicts ?? []))
        .catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [mode, connectionId, scheduledAt, workspaceId, fnConflict]);

  // -------------------- Derived --------------------
  const selectedNumber = useMemo(() => numbers.find((n) => n.id === connectionId), [numbers, connectionId]);
  const selectedTemplate = useMemo(() => templates.find((t) => t.id === templateId), [templates, templateId]);
  const validContacts = contactSel?.valid ?? 0;

  const estimatedDurationMin = useMemo(() => {
    if (!validContacts || !rate.send_rate_per_min) return 0;
    return Math.ceil(validContacts / rate.send_rate_per_min);
  }, [validContacts, rate.send_rate_per_min]);

  const estimatedCostCents = useMemo(() => {
    return (balance?.unit_price_cents ?? 15) * validContacts;
  }, [balance, validContacts]);

  // -------------------- Navigation helpers --------------------
  const canAdvance = useCallback((from: number): boolean => {
    if (from === 1) return !!connectionId;
    if (from === 2) return !!templateId;
    if (from === 3) return !!contactSel?.list_id;
    if (from === 4) return rate.send_rate_per_min > 0 && rate.batch_size > 0;
    if (from === 5) return !!name.trim();
    return true;
  }, [connectionId, templateId, contactSel, rate, name]);

  function goTo(id: number) {
    if (id <= maxReached) setStep(id);
  }
  function next() {
    if (!canAdvance(step)) { toast.error("Preencha os campos obrigatórios"); return; }
    const nxt = Math.min(step + 1, STEPS.length);
    setStep(nxt);
    setMaxReached((m) => Math.max(m, nxt));
  }
  function back() {
    setStep((s) => Math.max(1, s - 1));
  }

  // -------------------- Submit --------------------
  async function handleSubmit(finalMode: Mode) {
    if (!name.trim() || !connectionId || !templateId || !contactSel?.list_id) {
      toast.error("Faltam informações. Volte às etapas anteriores.");
      return;
    }
    if (finalMode === "schedule" && !scheduledAt) {
      toast.error("Informe a data/hora do agendamento");
      return;
    }
    if (finalMode === "schedule" && conflicts.length > 0 && !forceConflict) {
      toast.error("Existe conflito de horário. Marque 'forçar' para prosseguir.");
      return;
    }
    setSubmitting(true);
    try {
      const { campaign } = await fnCreate({
        data: {
          workspace_id: workspaceId,
          name: name.trim(),
          connection_id: connectionId,
          template_id: templateId,
          list_id: contactSel.list_id,
          scheduled_at: finalMode === "schedule" ? new Date(scheduledAt).toISOString() : null,
        },
      });
      if (event_id) {
        try { await fnLink({ data: { event_id, campaign_id: campaign.id } }); } catch { /* non-fatal */ }
      }
      await supabase.from("wa_campaigns").update({
        timezone,
        send_rate_per_min: rate.send_rate_per_min,
        batch_size: rate.batch_size,
        jitter_ms: rate.jitter_ms,
        status: finalMode === "schedule" ? "scheduled" : "draft",
      }).eq("id", campaign.id);

      if (finalMode === "now") {
        const r = await fnStart({ data: { campaign_id: campaign.id } });
        toast.success(r.status === "queued"
          ? "Campanha na fila! O envio acontecerá em segundo plano."
          : "Aguardando aprovação interna.");
      } else if (finalMode === "schedule") {
        toast.success("Campanha agendada.");
      } else {
        toast.success("Rascunho salvo.");
      }
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      setSuccessCampaignId(campaign.id);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar campanha");
    } finally {
      setSubmitting(false);
    }
  }

  function resetForNext() {
    setSuccessCampaignId(null);
    setStep(1); setMaxReached(1);
    setName(""); setTemplateId(""); setContactSel(null);
    setMode("now"); setScheduledAt(""); setConflicts([]); setForceConflict(false);
  }

  // -------------------- Render --------------------
  return (
    <>
      {/* Header sticky com stepper */}
      <Card className="mb-4">
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1">
              <Label className="text-xs">Nome da campanha</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Boas-vindas de Outubro"
                className="mt-1"
                maxLength={160}
              />
            </div>
            <div className="text-xs text-muted-foreground sm:text-right">
              {draftRestored && <div>Rascunho restaurado</div>}
              <div>Salvamento automático ativo</div>
            </div>
          </div>
          <Stepper steps={STEPS} current={step} onGoTo={goTo} maxReached={maxReached} />
        </CardContent>
      </Card>

      {event_id && (
        <div className="mb-3 flex items-center gap-2 rounded border border-primary/30 bg-primary/5 p-2 text-xs">
          <CalendarClock className="h-4 w-4" />
          Esta campanha ficará vinculada ao evento da agenda selecionado.
        </div>
      )}

      {/* Etapa 1 - Número */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Phone className="h-4 w-4" /> Selecione o número remetente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {numbers.length === 0 ? (
              <div className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nenhum número liberado para o seu workspace.
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {numbers.map((n) => {
                  const selected = connectionId === n.id;
                  const active = String(n.status).toLowerCase() === "active" || String(n.status).toLowerCase() === "connected";
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => setConnectionId(n.id)}
                      className={cn(
                        "flex flex-col rounded-lg border p-3 text-left transition-colors hover:bg-muted/40",
                        selected && "border-primary bg-primary/5 ring-1 ring-primary/40"
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-sm font-semibold">{n.display_name}</div>
                          <div className="text-xs text-muted-foreground">{n.phone_masked}</div>
                        </div>
                        {active
                          ? <Badge variant="secondary" className="gap-1"><Wifi className="h-3 w-3" /> {n.status}</Badge>
                          : <Badge variant="destructive" className="gap-1"><WifiOff className="h-3 w-3" /> {n.status}</Badge>}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                        {n.quality_rating && (
                          <Badge variant="outline" className="gap-1"><Signal className="h-3 w-3" /> Qualidade: {n.quality_rating}</Badge>
                        )}
                        {n.messaging_limit_tier && (
                          <Badge variant="outline">Tier: {n.messaging_limit_tier}</Badge>
                        )}
                        {typeof n.daily_cap === "number" && n.daily_cap > 0 && (
                          <Badge variant="outline">Limite: {n.daily_cap.toLocaleString("pt-BR")}/dia</Badge>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            <NavFooter onNext={next} onBack={null} disabled={!canAdvance(1)} />
          </CardContent>
        </Card>
      )}

      {/* Etapa 2 - Template */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquareText className="h-4 w-4" /> Escolha o template
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
              <div className="space-y-2">
                {templates.length === 0 ? (
                  <div className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
                    Nenhum template disponível para <b>{selectedNumber?.display_name}</b>.
                  </div>
                ) : (
                  <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
                    {templates.map((t) => {
                      const selected = templateId === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setTemplateId(t.id)}
                          className={cn(
                            "block w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/40",
                            selected && "border-primary bg-primary/5"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold">{t.name}</div>
                              <div className="mt-0.5 flex flex-wrap gap-1.5 text-[10px]">
                                <Badge variant="outline">{t.language}</Badge>
                                <Badge variant="outline">{t.category}</Badge>
                                {t.status && <Badge variant={String(t.status).toLowerCase().includes("approv") ? "secondary" : "outline"}>{t.status}</Badge>}
                              </div>
                            </div>
                            {selected && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
                          </div>
                          <div className="mt-1.5 line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">{t.body}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div>
                <Label className="mb-1 block text-xs">Pré-visualização</Label>
                <WhatsAppPreview
                  senderName={selectedNumber?.display_name}
                  header={selectedTemplate ? { type: selectedTemplate.header_type ?? undefined, text: selectedTemplate.header_text ?? undefined } : null}
                  body={selectedTemplate?.body ?? ""}
                  footer={selectedTemplate?.footer ?? null}
                  buttons={selectedTemplate?.buttons ?? []}
                />
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Variáveis como {"{{1}}"} aparecerão como no template. O mapeamento de variáveis é aplicado no envio real.
                </p>
              </div>
            </div>
            <div className="mt-4">
              <NavFooter onNext={next} onBack={back} disabled={!canAdvance(2)} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Etapa 3 - Contatos */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" /> Adicione os contatos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ContactPicker workspaceId={workspaceId} value={contactSel} onChange={setContactSel} />
            <div className="mt-4">
              <NavFooter onNext={next} onBack={back} disabled={!canAdvance(3)} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Etapa 4 - Configuração */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Sliders className="h-4 w-4" /> Ritmo e configuração</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label className="text-xs">Envios por minuto</Label>
                <Input type="number" min={1} max={2400}
                  value={rate.send_rate_per_min}
                  onChange={(e) => setRate((r) => ({ ...r, send_rate_per_min: Number(e.target.value) }))} />
              </div>
              <div>
                <Label className="text-xs">Tamanho do lote</Label>
                <Input type="number" min={1} max={500}
                  value={rate.batch_size}
                  onChange={(e) => setRate((r) => ({ ...r, batch_size: Number(e.target.value) }))} />
              </div>
              <div>
                <Label className="text-xs">Jitter (ms)</Label>
                <Input type="number" min={0} max={60000}
                  value={rate.jitter_ms}
                  onChange={(e) => setRate((r) => ({ ...r, jitter_ms: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Contatos válidos</div>
                <div className="text-lg font-semibold">{validContacts.toLocaleString("pt-BR")}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Duração estimada</div>
                <div className="text-lg font-semibold">
                  {estimatedDurationMin > 60 ? `${Math.floor(estimatedDurationMin / 60)}h ${estimatedDurationMin % 60}min` : `${estimatedDurationMin} min`}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Custo estimado</div>
                <div className="text-lg font-semibold">R$ {(estimatedCostCents / 100).toFixed(2)}</div>
              </div>
            </div>
            <NavFooter onNext={next} onBack={back} disabled={!canAdvance(4)} />
          </CardContent>
        </Card>
      )}

      {/* Etapa 5 - Revisão */}
      {step === 5 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-4 w-4" /> Revisar campanha</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2 text-sm">
                <ReviewRow label="Campanha" value={name || <em className="text-muted-foreground">sem nome</em>} />
                <ReviewRow label="Número" value={selectedNumber ? `${selectedNumber.display_name} (${selectedNumber.phone_masked})` : "—"} />
                <ReviewRow label="Template" value={selectedTemplate?.name ?? "—"} />
                <ReviewRow label="Lista" value={contactSel?.list_name ?? "—"} />
                <ReviewRow label="Contatos válidos" value={<b>{validContacts.toLocaleString("pt-BR")}</b>} />
                <ReviewRow label="Ritmo" value={`${rate.send_rate_per_min}/min · lote ${rate.batch_size} · jitter ${rate.jitter_ms}ms`} />
                <ReviewRow label="Duração estimada" value={estimatedDurationMin > 60 ? `${Math.floor(estimatedDurationMin / 60)}h ${estimatedDurationMin % 60}min` : `${estimatedDurationMin} min`} />
                <ReviewRow label="Custo estimado" value={`R$ ${(estimatedCostCents / 100).toFixed(2)}`} />
                <ReviewRow label="Saldo (msgs)" value={balance?.available?.toLocaleString("pt-BR") ?? "—"} />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Prévia da mensagem</Label>
                <WhatsAppPreview
                  senderName={selectedNumber?.display_name}
                  header={selectedTemplate ? { type: selectedTemplate.header_type ?? undefined, text: selectedTemplate.header_text ?? undefined } : null}
                  body={selectedTemplate?.body ?? ""}
                  footer={selectedTemplate?.footer ?? null}
                  buttons={selectedTemplate?.buttons ?? []}
                />
              </div>
            </div>
            {balance && balance.available < validContacts && (
              <div className="flex items-start gap-2 rounded border border-amber-400 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>Saldo insuficiente para esta campanha. Você tem <b>{balance.available}</b> mensagens e precisa de <b>{validContacts}</b>.</div>
              </div>
            )}
            <NavFooter onNext={next} onBack={back} disabled={!canAdvance(5)} nextLabel="Ir para envio" />
          </CardContent>
        </Card>
      )}

      {/* Etapa 6 - Envio */}
      {step === 6 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Send className="h-4 w-4" /> Enviar ou agendar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              {([
                { m: "now" as Mode, icon: Send, title: "Enviar agora", desc: "Coloca a campanha na fila. O envio acontece em segundo plano." },
                { m: "schedule" as Mode, icon: Clock, title: "Agendar", desc: "Escolha data e horário. Executa automaticamente." },
                { m: "draft" as Mode, icon: Save, title: "Salvar rascunho", desc: "Guarda a campanha sem enviar." },
              ]).map(({ m, icon: Icon, title, desc }) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    "flex flex-col rounded-lg border p-3 text-left text-sm transition-colors hover:bg-muted/40",
                    mode === m && "border-primary bg-primary/5 ring-1 ring-primary/40"
                  )}
                >
                  <div className="mb-1 flex items-center gap-2 font-medium"><Icon className="h-4 w-4" /> {title}</div>
                  <div className="text-xs text-muted-foreground">{desc}</div>
                </button>
              ))}
            </div>

            {mode === "schedule" && (
              <div className="space-y-3 rounded-lg border p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Data e hora</Label>
                    <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Fuso horário</Label>
                    <select className="w-full rounded border px-3 py-2 text-sm" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                      {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                    </select>
                  </div>
                </div>
                {conflicts.length > 0 && (
                  <div className="rounded border border-amber-400 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    <div className="mb-1 flex items-center gap-1 font-semibold"><AlertTriangle className="h-3 w-3" /> Conflito de agendamento</div>
                    <ul className="ml-4 list-disc space-y-1">
                      {conflicts.map((c: any) => (
                        <li key={c.id}>"{c.name}" — {new Date(c.scheduled_at).toLocaleString("pt-BR")} ({c.status})</li>
                      ))}
                    </ul>
                    <label className="mt-2 flex items-center gap-2">
                      <input type="checkbox" checked={forceConflict} onChange={(e) => setForceConflict(e.target.checked)} />
                      <span>Forçar agendamento mesmo com conflito</span>
                    </label>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button variant="outline" onClick={back}><ArrowLeft className="mr-1 h-4 w-4" /> Voltar</Button>
              <Button onClick={() => handleSubmit(mode)} disabled={submitting} size="lg">
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === "now" ? "Enviar agora" : mode === "schedule" ? "Agendar campanha" : "Salvar rascunho"}
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              O disparo é executado em segundo plano. Você pode fechar esta página, criar outra campanha ou usar outros módulos sem interromper o envio.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Restore dialog */}
      <Dialog open={showRestore} onOpenChange={setShowRestore}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Continuar rascunho?</DialogTitle>
            <DialogDescription>
              Você começou uma campanha e não finalizou. Deseja retomar de onde parou?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={discardDraft}>Descartar</Button>
            <Button onClick={applyDraft}>Continuar rascunho</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success dialog */}
      <Dialog open={!!successCampaignId} onOpenChange={(v) => { if (!v) navigate({ to: "/painel/campanhas" }); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-primary" /> Campanha criada</DialogTitle>
            <DialogDescription>O que deseja fazer agora?</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col gap-2 sm:flex-col sm:space-x-0">
            <Button onClick={() => navigate({ to: "/painel/campanhas" })}>Ver minhas campanhas</Button>
            <Button variant="secondary" onClick={resetForNext}>
              <Plus className="mr-2 h-4 w-4" /> Criar outra campanha
            </Button>
            <Button variant="outline" onClick={() => navigate({ to: "/painel/agenda" })}>
              <CalendarClock className="mr-2 h-4 w-4" /> Abrir a agenda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b py-1.5 last:border-0">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function NavFooter({
  onNext, onBack, disabled, nextLabel,
}: {
  onNext: () => void;
  onBack: (() => void) | null;
  disabled?: boolean;
  nextLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between pt-2">
      {onBack ? (
        <Button variant="outline" onClick={onBack}><ArrowLeft className="mr-1 h-4 w-4" /> Voltar</Button>
      ) : <div />}
      <Button onClick={onNext} disabled={disabled}>
        {nextLabel ?? "Continuar"} <ArrowRight className="ml-1 h-4 w-4" />
      </Button>
    </div>
  );
}
