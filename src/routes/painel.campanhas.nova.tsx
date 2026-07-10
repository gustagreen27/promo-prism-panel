import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useServerFn } from "@tanstack/react-start";
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
import { toast } from "sonner";
import { CalendarClock, CheckCircle2, Plus, AlertTriangle } from "lucide-react";

const searchSchema = z.object({
  event_id: z.string().uuid().optional(),
  scheduled_for: z.string().optional(),
});

export const Route = createFileRoute("/painel/campanhas/nova")({
  head: () => ({ meta: [{ title: "Nova campanha — Disparos FR" }] }),
  validateSearch: (s) => searchSchema.parse(s),
  component: Page,
});

type NumberRow = { id: string; display_name: string; phone_masked: string; status: string; daily_cap: number | null };
type TemplateRow = { id: string; name: string; language: string; category: string; body: string };
type ListRow = { id: string; name: string };
type Mode = "now" | "schedule" | "draft";

// Fusos mais usados no Brasil + alguns internacionais
const TIMEZONES = [
  "America/Sao_Paulo", "America/Manaus", "America/Belem", "America/Fortaleza",
  "America/Cuiaba", "America/Rio_Branco", "America/Noronha",
  "America/New_York", "America/Los_Angeles", "Europe/Lisbon", "Europe/London", "Europe/Madrid", "UTC",
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

  const toLocal = (iso?: string) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<Mode>(scheduled_for ? "schedule" : "now");
  const [scheduledAt, setScheduledAt] = useState<string>(toLocal(scheduled_for));
  const [timezone, setTimezone] = useState<string>(Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo");
  const [numbers, setNumbers] = useState<NumberRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [lists, setLists] = useState<ListRow[]>([]);
  const [connectionId, setConnectionId] = useState<string>("");
  const [templateId, setTemplateId] = useState<string>("");
  const [listId, setListId] = useState<string>("");
  const [balance, setBalance] = useState<{ available: number } | null>(null);
  const [rate, setRate] = useState({ send_rate_per_min: 30, batch_size: 25, jitter_ms: 500 });
  const [submitting, setSubmitting] = useState(false);
  const [successCampaignId, setSuccessCampaignId] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [forceConflict, setForceConflict] = useState(false);

  useEffect(() => {
    (async () => {
      const [n, b, l] = await Promise.all([
        fnListNumbers({ data: { workspace_id: workspaceId } }),
        fnBalance({ data: { workspace_id: workspaceId } }),
        supabase.from("contact_lists").select("id,name").eq("workspace_id", workspaceId).limit(50),
      ]);
      setNumbers(n.numbers);
      setBalance(b);
      setLists(((l.data as ListRow[]) || []));
      if (n.numbers.length === 1) setConnectionId(n.numbers[0].id);
    })();
  }, [workspaceId, fnListNumbers, fnBalance]);

  useEffect(() => {
    if (!connectionId) return;
    fnListTemplates({ data: { workspace_id: workspaceId, connection_id: connectionId } }).then((r) => setTemplates(r.templates));
  }, [connectionId, workspaceId, fnListTemplates]);

  // Live conflict check
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

  const selectedTemplate = useMemo(() => templates.find((t) => t.id === templateId), [templates, templateId]);
  const selectedList = useMemo(() => lists.find((l) => l.id === listId), [lists, listId]);

  async function handleSubmit() {
    if (!name || !connectionId || !templateId) {
      toast.error("Preencha nome, número e template");
      return;
    }
    if (mode === "schedule" && !scheduledAt) {
      toast.error("Informe a data/hora do agendamento");
      return;
    }
    if (mode === "schedule" && conflicts.length > 0 && !forceConflict) {
      toast.error("Existe conflito de horário. Marque 'forçar' para prosseguir ou escolha outro horário.");
      return;
    }
    setSubmitting(true);
    try {
      const { campaign } = await fnCreate({
        data: {
          workspace_id: workspaceId,
          name,
          connection_id: connectionId,
          template_id: templateId,
          list_id: listId || null,
          scheduled_at: mode === "schedule" ? new Date(scheduledAt).toISOString() : null,
        },
      });
      if (event_id) {
        try { await fnLink({ data: { event_id, campaign_id: campaign.id } }); } catch { /* non-fatal */ }
      }
      // Persiste configurações extras (fuso + rate) diretamente na tabela
      await supabase.from("wa_campaigns").update({
        timezone,
        send_rate_per_min: rate.send_rate_per_min,
        batch_size: rate.batch_size,
        jitter_ms: rate.jitter_ms,
        status: mode === "schedule" ? "scheduled" : (mode === "now" ? "draft" : "draft"),
      }).eq("id", campaign.id);

      if (mode === "now") {
        const r = await fnStart({ data: { campaign_id: campaign.id } });
        toast.success(r.status === "queued" ? "Campanha na fila!" : "Aguardando aprovação interna.");
      } else if (mode === "schedule") {
        toast.success("Campanha agendada.");
      } else {
        toast.success("Rascunho salvo.");
      }
      setSuccessCampaignId(campaign.id);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar campanha");
    } finally {
      setSubmitting(false);
    }
  }

  function resetForNext() {
    setSuccessCampaignId(null);
    setStep(1); setName(""); setScheduledAt(""); setTemplateId(""); setListId(""); setMode("now"); setConflicts([]); setForceConflict(false);
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle>Nova campanha — passo {step} de 5</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {event_id && (
            <div className="flex items-center gap-2 rounded border border-primary/30 bg-primary/5 p-2 text-xs">
              <CalendarClock className="h-4 w-4" />
              Esta campanha ficará vinculada ao evento da agenda selecionado.
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <div><Label>Nome da campanha</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Boas-vindas outubro" /></div>
              <div><Label>Lista de contatos (opcional)</Label>
                <select className="w-full rounded border px-3 py-2 text-sm" value={listId} onChange={(e) => setListId(e.target.value)}>
                  <option value="">— Sem lista específica —</option>
                  {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <Button onClick={() => setStep(2)} disabled={!name}>Continuar</Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <Label>Número remetente</Label>
              {numbers.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum número liberado.</p> :
                <div className="space-y-2">{numbers.map((n) => (
                  <label key={n.id} className={`flex cursor-pointer items-center gap-3 rounded border p-3 text-sm ${connectionId === n.id ? "border-primary bg-primary/5" : ""}`}>
                    <input type="radio" name="conn" checked={connectionId === n.id} onChange={() => setConnectionId(n.id)} />
                    <div className="flex-1"><div className="font-medium">{n.display_name}</div>
                      <div className="text-xs text-muted-foreground">{n.phone_masked} · {n.status}</div></div>
                  </label>
                ))}</div>}
              <div className="flex gap-2"><Button variant="outline" onClick={() => setStep(1)}>Voltar</Button>
                <Button onClick={() => setStep(3)} disabled={!connectionId}>Continuar</Button></div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <Label>Template</Label>
              {templates.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum template liberado.</p> :
                <div className="space-y-2">{templates.map((t) => (
                  <label key={t.id} className={`block cursor-pointer rounded border p-3 text-sm ${templateId === t.id ? "border-primary bg-primary/5" : ""}`}>
                    <input type="radio" name="tpl" className="mr-2" checked={templateId === t.id} onChange={() => setTemplateId(t.id)} />
                    <span className="font-medium">{t.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{t.language} · {t.category}</span>
                    <div className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{t.body}</div>
                  </label>
                ))}</div>}
              <div className="flex gap-2"><Button variant="outline" onClick={() => setStep(2)}>Voltar</Button>
                <Button onClick={() => setStep(4)} disabled={!templateId}>Continuar</Button></div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div>
                <Label>Modo de envio</Label>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {(["now", "schedule", "draft"] as Mode[]).map((m) => (
                    <label key={m} className={`cursor-pointer rounded border p-3 text-sm ${mode === m ? "border-primary bg-primary/5" : ""}`}>
                      <input type="radio" name="mode" className="mr-2" checked={mode === m} onChange={() => setMode(m)} />
                      <span className="font-medium">{m === "now" ? "Enviar agora" : m === "schedule" ? "Agendar" : "Salvar rascunho"}</span>
                    </label>
                  ))}
                </div>
              </div>

              {mode === "schedule" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><Label>Data/hora</Label>
                    <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></div>
                  <div><Label>Fuso horário</Label>
                    <select className="w-full rounded border px-3 py-2 text-sm" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                      {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                    </select>
                  </div>
                  {conflicts.length > 0 && (
                    <div className="sm:col-span-2 rounded border border-amber-400 bg-amber-50 p-3 text-xs text-amber-900">
                      <div className="mb-1 flex items-center gap-1 font-semibold"><AlertTriangle className="h-4 w-4" /> Conflito de agendamento</div>
                      <ul className="ml-4 list-disc space-y-1">
                        {conflicts.map((c) => (
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

              <div className="rounded border p-3 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ritmo de envio</div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div><Label className="text-xs">Envios/min</Label>
                    <Input type="number" value={rate.send_rate_per_min} onChange={(e) => setRate((r) => ({ ...r, send_rate_per_min: Number(e.target.value) }))} min={1} max={2400} /></div>
                  <div><Label className="text-xs">Lote</Label>
                    <Input type="number" value={rate.batch_size} onChange={(e) => setRate((r) => ({ ...r, batch_size: Number(e.target.value) }))} min={1} max={200} /></div>
                  <div><Label className="text-xs">Jitter (ms)</Label>
                    <Input type="number" value={rate.jitter_ms} onChange={(e) => setRate((r) => ({ ...r, jitter_ms: Number(e.target.value) }))} min={0} max={5000} /></div>
                </div>
              </div>

              <div className="flex gap-2"><Button variant="outline" onClick={() => setStep(3)}>Voltar</Button>
                <Button onClick={() => setStep(5)} disabled={mode === "schedule" && !scheduledAt}>Continuar</Button></div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-3 text-sm">
              <div className="rounded border p-3 space-y-1">
                <div><span className="text-muted-foreground">Campanha:</span> <b>{name}</b></div>
                <div><span className="text-muted-foreground">Modo:</span> <Badge variant="outline">{mode === "now" ? "Enviar agora" : mode === "schedule" ? "Agendar" : "Rascunho"}</Badge></div>
                {mode === "schedule" && <div><span className="text-muted-foreground">Quando:</span> {new Date(scheduledAt).toLocaleString("pt-BR")} ({timezone})</div>}
                <div><span className="text-muted-foreground">Lista:</span> {selectedList?.name || "—"}</div>
                <div><span className="text-muted-foreground">Número:</span> {numbers.find((n) => n.id === connectionId)?.display_name}</div>
                <div><span className="text-muted-foreground">Template:</span> {selectedTemplate?.name}</div>
                <div><span className="text-muted-foreground">Ritmo:</span> {rate.send_rate_per_min}/min · lote {rate.batch_size}</div>
                <div><span className="text-muted-foreground">Saldo:</span> {balance?.available ?? "—"} mensagens</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setStep(4)}>Voltar</Button>
                <Button onClick={handleSubmit} disabled={submitting}>
                  {mode === "now" ? "Enviar agora" : mode === "schedule" ? "Agendar campanha" : "Salvar rascunho"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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
