import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Rocket, Send, Sparkles, AlertTriangle, CheckCircle2, Info, Plus, X, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Stepper } from "@/components/admin/stepper";
import { StatusBadge, AlertBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { listClients } from "@/lib/clients.functions";
import { listProjects } from "@/lib/projects.functions";
import { listWabas } from "@/lib/wa-wabas.functions";
import { listNumbers } from "@/lib/whatsapp-numbers.functions";
import { listTemplates, syncTemplatesByWaba } from "@/lib/whatsapp-templates.functions";
import { listLists } from "@/lib/contact-lists.functions";
import { previewAudience, renderPreview, createCampaignFromWizard } from "@/lib/wa-wizard.functions";
import { availableStock, buildRecipients, startWaCampaign } from "@/lib/wa-campaigns.functions";
import { DEFAULT_TOKENS, metaVarsIn } from "@/lib/wa-variables";

export const Route = createFileRoute("/_authenticated/admin/whatsapp-campanhas/novo")({
  head: () => ({ meta: [{ title: "Nova campanha — WhatsApp" }] }),
  component: WizardPage,
});

const STEPS = [
  { id: "dados", label: "Dados", description: "Nome, cliente, agendamento" },
  { id: "publico", label: "Público", description: "Lista e filtros" },
  { id: "whatsapp", label: "WhatsApp", description: "WABA, número, template" },
  { id: "variaveis", label: "Variáveis", description: "Mapear {{n}} do template" },
  { id: "botao", label: "Botão / URL", description: "URLs dinâmicas" },
  { id: "revisao", label: "Revisão", description: "Confira antes de enviar" },
  { id: "envio", label: "Envio", description: "Fila e progresso" },
];

type WizardState = {
  // step 1
  name: string;
  client_id: string | null;
  project_id: string | null;
  responsavel_id: string | null;
  scheduled_at: string | null;
  imediato: boolean;
  // step 2
  list_id: string | null;
  tag_filters: string[];
  // step 3
  waba_ref_id: string | null;
  connection_id: string | null;
  template_id: string | null;
  // step 4
  variables_mapping: Record<string, string>;
  custom_fields: Record<string, string>;
  // step 5
  button_url_mapping: Record<string, string>;
  // step 1 extras
  notes: string;
  send_rate_per_min: number;
  batch_size: number;
  jitter_ms: number;
  max_per_hour: number | null;
  max_per_day: number | null;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string;
  abort_on_failure_rate: number | null;
  min_processed_for_abort: number;
};

const initial: WizardState = {
  name: "",
  client_id: null,
  project_id: null,
  responsavel_id: null,
  scheduled_at: null,
  imediato: true,
  list_id: null,
  tag_filters: [],
  waba_ref_id: null,
  connection_id: null,
  template_id: null,
  variables_mapping: {},
  custom_fields: {},
  button_url_mapping: {},
  notes: "",
  send_rate_per_min: 40,
  batch_size: 25,
  jitter_ms: 0,
  max_per_hour: null,
  max_per_day: null,
  quiet_hours_start: null,
  quiet_hours_end: null,
  timezone: "America/Sao_Paulo",
  abort_on_failure_rate: null,
  min_processed_for_abort: 50,
};

const NONE = "__none__";

function WizardPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(initial);
  const [campaignId, setCampaignId] = useState<string | null>(null);

  const clientsFn = useServerFn(listClients);
  const projectsFn = useServerFn(listProjects);
  const wabasFn = useServerFn(listWabas);
  const numbersFn = useServerFn(listNumbers);
  const templatesFn = useServerFn(listTemplates);
  const syncTplFn = useServerFn(syncTemplatesByWaba);
  const syncMut = useMutation({
    mutationFn: (wabaRefId: string) => syncTplFn({ data: { waba_ref_id: wabaRefId } }),
    onSuccess: (r: any) => {
      toast.success(`Sincronizado: ${r.synced}/${r.total} template(s) atualizados da Meta.`);
      qc.invalidateQueries({ queryKey: ["wa-templates"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao sincronizar templates"),
  });
  const listsFn = useServerFn(listLists);
  const previewAud = useServerFn(previewAudience);
  const renderFn = useServerFn(renderPreview);
  const stockFn = useServerFn(availableStock);
  const createFn = useServerFn(createCampaignFromWizard);
  const buildFn = useServerFn(buildRecipients);
  const startFn = useServerFn(startWaCampaign);

  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => clientsFn() });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => projectsFn() });
  const { data: wabas = [] } = useQuery({ queryKey: ["wa-wabas"], queryFn: () => wabasFn() });
  const { data: numbers = [] } = useQuery({ queryKey: ["wa-numeros"], queryFn: () => numbersFn() });
  const { data: templates = [] } = useQuery({ queryKey: ["wa-templates"], queryFn: () => templatesFn() });
  const { data: lists = [] } = useQuery({ queryKey: ["contact-lists"], queryFn: () => listsFn() });

  const numbersOfWaba = useMemo(
    () => (numbers as any[]).filter((n) => !state.waba_ref_id || n.waba_ref_id === state.waba_ref_id),
    [numbers, state.waba_ref_id],
  );
  const templatesOfWaba = useMemo(
    () =>
      (templates as any[]).filter(
        (t) => (!state.waba_ref_id || t.waba_ref_id === state.waba_ref_id) && t.status === "approved",
      ),
    [templates, state.waba_ref_id],
  );
  const selectedNumber = useMemo(() => numbersOfWaba.find((n: any) => n.id === state.connection_id), [numbersOfWaba, state.connection_id]);
  const selectedTemplate = useMemo(() => templatesOfWaba.find((t: any) => t.id === state.template_id), [templatesOfWaba, state.template_id]);
  const selectedClient = clients.find((c: any) => c.id === state.client_id);
  const selectedProject = projects.find((p: any) => p.id === state.project_id);
  const selectedList = lists.find((l: any) => l.id === state.list_id);

  const set = <K extends keyof WizardState>(k: K, v: WizardState[K]) => setState((s) => ({ ...s, [k]: v }));

  // Audience preview
  const audienceQ = useQuery({
    enabled: !!state.list_id,
    queryKey: ["wizard-audience", state.list_id, state.tag_filters],
    queryFn: () => previewAud({ data: { list_id: state.list_id!, tag_filters: state.tag_filters } }),
  });

  // Body variables list
  const bodyVars = useMemo(() => (selectedTemplate ? metaVarsIn(selectedTemplate.body ?? "") : []), [selectedTemplate]);
  const buttonUrlVars = useMemo(() => {
    if (!selectedTemplate) return [] as number[];
    const btns = (selectedTemplate.buttons ?? []) as any[];
    const urls = btns.filter((b) => (b?.type ?? "").toLowerCase() === "url").map((b) => String(b?.url ?? ""));
    const all = new Set<number>();
    for (const u of urls) metaVarsIn(u).forEach((n) => all.add(n));
    return [...all].sort();
  }, [selectedTemplate]);

  // Live preview
  const previewQ = useQuery({
    enabled: !!selectedTemplate && (step === 3 || step === 4 || step === 5),
    queryKey: ["wizard-preview", state.template_id, state.variables_mapping, state.button_url_mapping, audienceQ.data?.sample?.[0]?.id, state.client_id, state.project_id],
    queryFn: () =>
      renderFn({
        data: {
          template_id: state.template_id!,
          contact_id: audienceQ.data?.sample?.[0]?.id ?? undefined,
          client_id: state.client_id,
          project_id: state.project_id,
          variables_mapping: state.variables_mapping,
          button_url_mapping: state.button_url_mapping,
        },
      }),
  });

  const stockQ = useQuery({
    enabled: step === 5,
    queryKey: ["wizard-stock", state.client_id, state.project_id],
    queryFn: () => stockFn({ data: { client_id: state.client_id, project_id: state.project_id } }),
  });

  const canGoNext = (() => {
    if (step === 0) return state.name.trim().length > 0 && (state.imediato || !!state.scheduled_at);
    if (step === 1) return !!state.list_id && (audienceQ.data?.total ?? 0) > 0;
    if (step === 2) return !!state.connection_id && !!state.template_id;
    if (step === 3) return bodyVars.every((n) => (state.variables_mapping[String(n)] ?? "").trim().length > 0);
    if (step === 4) return buttonUrlVars.every((n) => (state.button_url_mapping[String(n)] ?? "").trim().length > 0);
    return true;
  })();

  const createMut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          name: state.name.trim(),
          client_id: state.client_id,
          project_id: state.project_id,
          responsavel_id: state.responsavel_id,
          connection_id: state.connection_id!,
          template_id: state.template_id!,
          list_id: state.list_id!,
          tag_filters: state.tag_filters,
          scheduled_at: state.imediato ? null : state.scheduled_at,
          send_rate_per_min: state.send_rate_per_min,
          batch_size: state.batch_size,
          jitter_ms: state.jitter_ms,
          max_per_hour: state.max_per_hour,
          max_per_day: state.max_per_day,
          quiet_hours_start: state.quiet_hours_start,
          quiet_hours_end: state.quiet_hours_end,
          timezone: state.timezone,
          abort_on_failure_rate: state.abort_on_failure_rate,
          min_processed_for_abort: state.min_processed_for_abort,
          notes: state.notes || null,
          variables_mapping: state.variables_mapping,
          button_url_mapping: state.button_url_mapping,
          custom_fields: state.custom_fields,
        },
      }),
    onSuccess: async (row: any) => {
      setCampaignId(row.id);
      toast.success("Campanha criada");
      try {
        const built = await buildFn({ data: { id: row.id } });
        toast.info(`${built.total} destinatários enfileirados`);
      } catch (e: any) {
        toast.error(e?.message ?? "Erro ao gerar destinatários");
      }
      qc.invalidateQueries({ queryKey: ["wa-campaigns"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao criar campanha"),
  });

  const startMut = useMutation({
    mutationFn: () => startFn({ data: { id: campaignId! } }),
    onSuccess: () => {
      toast.success("Envio iniciado");
      nav({ to: "/admin/whatsapp-campanhas/$id", params: { id: campaignId! } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao iniciar"),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nova campanha WhatsApp"
        description="Fluxo guiado em 7 etapas: dados, público, WhatsApp, variáveis, botão, revisão e envio."
        actions={
          <Button variant="ghost" onClick={() => nav({ to: "/admin/whatsapp-campanhas" })}>
            <ArrowLeft className="mr-2 h-4 w-4" />Voltar
          </Button>
        }
      />

      <div className="rounded-xl border bg-card p-4">
        <Stepper steps={STEPS} currentIndex={step} onStepClick={(i) => i < step && setStep(i)} />
      </div>

      {/* STEP 1 — Dados */}
      {step === 0 && (
        <Card>
          <CardHeader><CardTitle>Dados da campanha</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label>Nome *</Label><Input value={state.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: Ativação outubro" /></div>
            <div><Label>Cliente</Label>
              <Select value={state.client_id ?? NONE} onValueChange={(v) => set("client_id", v === NONE ? null : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Projeto</Label>
              <Select value={state.project_id ?? NONE} onValueChange={(v) => set("project_id", v === NONE ? null : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {projects.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Envio</Label>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button type="button" variant={state.imediato ? "default" : "outline"} size="sm" onClick={() => { set("imediato", true); set("scheduled_at", null); }}>
                  Imediato
                </Button>
                <Button type="button" variant={!state.imediato ? "default" : "outline"} size="sm" onClick={() => set("imediato", false)}>
                  Agendado
                </Button>
                {!state.imediato && (
                  <Input
                    type="datetime-local"
                    className="max-w-xs"
                    value={state.scheduled_at ?? ""}
                    onChange={(e) => set("scheduled_at", e.target.value || null)}
                  />
                )}
              </div>
            </div>
            <div>
              <Label>Taxa de envio (msg/min)</Label>
              <Input type="number" min={1} max={2400} value={state.send_rate_per_min} onChange={(e) => set("send_rate_per_min", Number(e.target.value) || 40)} />
              <p className="text-xs text-muted-foreground mt-1">Limite superior de mensagens por minuto.</p>
            </div>
            <div>
              <Label>Lote por ciclo</Label>
              <Input type="number" min={1} max={500} value={state.batch_size} onChange={(e) => set("batch_size", Number(e.target.value) || 25)} />
              <p className="text-xs text-muted-foreground mt-1">Quantidade processada a cada tick do worker.</p>
            </div>
            <div>
              <Label>Jitter (ms)</Label>
              <Input type="number" min={0} max={60000} value={state.jitter_ms} onChange={(e) => set("jitter_ms", Number(e.target.value) || 0)} />
              <p className="text-xs text-muted-foreground mt-1">Atraso aleatório entre envios do lote (0 = sem jitter).</p>
            </div>
            <div className="sm:col-span-2 border-t pt-4">
              <Label className="text-sm font-semibold">Limites por período (cotas Meta)</Label>
              <p className="text-xs text-muted-foreground">Deixe vazio para não limitar. Ao atingir, a campanha aguarda o próximo ciclo dentro da janela.</p>
            </div>
            <div>
              <Label>Máx. por hora</Label>
              <Input type="number" min={1} placeholder="—" value={state.max_per_hour ?? ""} onChange={(e) => set("max_per_hour", e.target.value ? Number(e.target.value) : null)} />
            </div>
            <div>
              <Label>Máx. por dia</Label>
              <Input type="number" min={1} placeholder="Ex.: 1000 (tier inicial Meta)" value={state.max_per_day ?? ""} onChange={(e) => set("max_per_day", e.target.value ? Number(e.target.value) : null)} />
            </div>
            <div className="sm:col-span-2 border-t pt-4">
              <Label className="text-sm font-semibold">Janela de silêncio (não enviar)</Label>
              <p className="text-xs text-muted-foreground">Fora deste intervalo, o worker segue enviando. Vazio = 24/7.</p>
            </div>
            <div>
              <Label>Início (HH:MM)</Label>
              <Input type="time" value={state.quiet_hours_start ?? ""} onChange={(e) => set("quiet_hours_start", e.target.value || null)} />
            </div>
            <div>
              <Label>Fim (HH:MM)</Label>
              <Input type="time" value={state.quiet_hours_end ?? ""} onChange={(e) => set("quiet_hours_end", e.target.value || null)} />
            </div>
            <div>
              <Label>Fuso horário</Label>
              <Input value={state.timezone} onChange={(e) => set("timezone", e.target.value || "America/Sao_Paulo")} />
            </div>
            <div className="sm:col-span-2 border-t pt-4">
              <Label className="text-sm font-semibold">Auto-pausa por taxa de falha</Label>
              <p className="text-xs text-muted-foreground">Se muitos envios falharem, pausa automaticamente para proteger a qualidade do número.</p>
            </div>
            <div>
              <Label>Taxa máxima de falha (%)</Label>
              <Input
                type="number" min={0} max={100} step={1}
                placeholder="—"
                value={state.abort_on_failure_rate != null ? Math.round(state.abort_on_failure_rate * 100) : ""}
                onChange={(e) => set("abort_on_failure_rate", e.target.value ? Number(e.target.value) / 100 : null)}
              />
            </div>
            <div>
              <Label>Mínimo processado antes de pausar</Label>
              <Input type="number" min={1} value={state.min_processed_for_abort} onChange={(e) => set("min_processed_for_abort", Number(e.target.value) || 50)} />
            </div>
            <div className="sm:col-span-2"><Label>Observações</Label><Textarea rows={2} value={state.notes} onChange={(e) => set("notes", e.target.value)} /></div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2 — Público */}
      {step === 1 && (
        <Card>
          <CardHeader><CardTitle>Público</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Lista de contatos *</Label>
              <Select value={state.list_id ?? NONE} onValueChange={(v) => set("list_id", v === NONE ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione uma lista" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {lists.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {audienceQ.data && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatMini label="Total final" value={audienceQ.data.total} highlight />
                <StatMini label="Contatos brutos" value={audienceQ.data.raw_count} />
                <StatMini label="Duplicados removidos" value={audienceQ.data.duplicates_removed} />
                <StatMini label="Opt-outs removidos" value={audienceQ.data.opt_out_removed} />
              </div>
            )}
            {audienceQ.data && audienceQ.data.total === 0 && state.list_id && (
              <p className="text-sm text-destructive flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Nenhum contato elegível após filtros e opt-outs.</p>
            )}
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Info className="h-3 w-3" /> Contatos sem opt-in ou com opt-out são removidos automaticamente. Duplicados por telefone também.
            </p>
          </CardContent>
        </Card>
      )}

      {/* STEP 3 — WhatsApp */}
      {step === 2 && (
        <Card>
          <CardHeader><CardTitle>WhatsApp</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div>
              <Label>WABA</Label>
              <Select value={state.waba_ref_id ?? NONE} onValueChange={(v) => { set("waba_ref_id", v === NONE ? null : v); set("connection_id", null); set("template_id", null); }}>
                <SelectTrigger><SelectValue placeholder="Selecione a WABA" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {(wabas as any[]).map((w) => <SelectItem key={w.id} value={w.id}>{w.nome_interno}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Número remetente *</Label>
              <Select value={state.connection_id ?? NONE} onValueChange={(v) => set("connection_id", v === NONE ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {numbersOfWaba.map((n: any) => <SelectItem key={n.id} value={n.id}>{n.display_phone ?? n.name} — {n.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {selectedNumber && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <StatusBadge status={selectedNumber.status} />
                  {selectedNumber.quality_rating && <StatusBadge status={selectedNumber.quality_rating} />}
                  {selectedNumber.messaging_limit && <Badge variant="outline">Tier {selectedNumber.messaging_limit}</Badge>}
                </div>
              )}
            </div>
            <div>
              <Label>Template aprovado *</Label>
              <Select value={state.template_id ?? NONE} onValueChange={(v) => set("template_id", v === NONE ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {templatesOfWaba.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name} ({t.language})</SelectItem>)}
                </SelectContent>
              </Select>
              {selectedTemplate && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <StatusBadge status={selectedTemplate.status} />
                  <Badge variant="outline">{selectedTemplate.category}</Badge>
                  <Badge variant="outline">{selectedTemplate.language}</Badge>
                </div>
              )}
            </div>
            {selectedTemplate && (
              <div className="lg:col-span-3 rounded-md border bg-muted/30 p-4 whitespace-pre-wrap text-sm">
                {selectedTemplate.header_text && <div className="font-semibold mb-2">{selectedTemplate.header_text}</div>}
                {selectedTemplate.body}
                {selectedTemplate.footer && <div className="mt-2 text-xs text-muted-foreground">{selectedTemplate.footer}</div>}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* STEP 4 — Variáveis */}
      {step === 3 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Mapear variáveis do template</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              {bodyVars.length === 0 && <p className="text-sm text-muted-foreground">Este template não tem variáveis no corpo.</p>}
              {bodyVars.map((n) => (
                <VariableEditor
                  key={n}
                  label={`{{${n}}}`}
                  value={state.variables_mapping[String(n)] ?? ""}
                  onChange={(v) => setState((s) => ({ ...s, variables_mapping: { ...s.variables_mapping, [String(n)]: v } }))}
                  customFieldsPool={Object.keys(state.custom_fields)}
                />
              ))}
              <Separator />
              <CustomFieldsEditor
                fields={state.custom_fields}
                onChange={(cf) => set("custom_fields", cf)}
              />
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 flex gap-2">
                <Sparkles className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">Sintaxe de fallback</div>
                  Use <code>{"{primeiro_nome|nome|\"cliente\"}"}</code> — se o campo primeiro_nome estiver vazio, tenta nome; se todos vazios, usa o texto literal “cliente”.
                </div>
              </div>
            </CardContent>
          </Card>
          <PreviewCard previewQ={previewQ} contact={audienceQ.data?.sample?.[0]} />
        </div>
      )}

      {/* STEP 5 — Botão / URL */}
      {step === 4 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Botões e URL dinâmica</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              {buttonUrlVars.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma variável dinâmica nos botões deste template.</p>
              ) : (
                buttonUrlVars.map((n) => (
                  <VariableEditor
                    key={n}
                    label={`URL {{${n}}}`}
                    value={state.button_url_mapping[String(n)] ?? ""}
                    onChange={(v) => setState((s) => ({ ...s, button_url_mapping: { ...s.button_url_mapping, [String(n)]: v } }))}
                    customFieldsPool={Object.keys(state.custom_fields)}
                    placeholder="ex.: comprovante/{codigo_comprovante}"
                  />
                ))
              )}
            </CardContent>
          </Card>
          <PreviewCard previewQ={previewQ} contact={audienceQ.data?.sample?.[0]} />
        </div>
      )}

      {/* STEP 6 — Revisão */}
      {step === 5 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Revisão final</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              <ReviewRow label="Campanha" value={state.name} />
              <ReviewRow label="Cliente" value={selectedClient?.name ?? "—"} />
              <ReviewRow label="Projeto" value={selectedProject?.name ?? "—"} />
              <ReviewRow label="Número" value={selectedNumber ? `${selectedNumber.display_phone ?? ""} — ${selectedNumber.name}` : "—"} />
              <ReviewRow label="Template" value={selectedTemplate ? `${selectedTemplate.name} (${selectedTemplate.language})` : "—"} />
              <ReviewRow label="Lista" value={selectedList?.name ?? "—"} />
              <ReviewRow label="Destinatários" value={String(audienceQ.data?.total ?? 0)} />
              <ReviewRow label="Agendamento" value={state.imediato ? "Imediato" : (state.scheduled_at ?? "—")} />
              <ReviewRow label="Taxa" value={`${state.send_rate_per_min} msg/min`} />
              <Separator />
              <PreviewCard previewQ={previewQ} contact={audienceQ.data?.sample?.[0]} embedded />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Estoque & alertas</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Estoque disponível</span>
                <Badge variant={stockQ.data != null && stockQ.data >= (audienceQ.data?.total ?? 0) ? "default" : "destructive"}>
                  {stockQ.data ?? "—"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Necessário</span>
                <Badge variant="outline">{audienceQ.data?.total ?? 0}</Badge>
              </div>
              {audienceQ.data && audienceQ.data.opt_out_removed > 0 && (
                <AlertBadge tone="info">{audienceQ.data.opt_out_removed} opt-outs removidos</AlertBadge>
              )}
              {(previewQ.data?.warnings ?? []).length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 space-y-1">
                  {previewQ.data!.warnings.map((w, i) => <div key={i}>• {w}</div>)}
                </div>
              )}
              {stockQ.data != null && stockQ.data < (audienceQ.data?.total ?? 0) && (
                <AlertBadge tone="danger">Estoque insuficiente</AlertBadge>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* STEP 7 — Envio */}
      {step === 6 && (
        <Card>
          <CardHeader><CardTitle>Envio</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {!campaignId ? (
              <>
                <p className="text-sm text-muted-foreground">Clique para criar a campanha e gerar a fila de destinatários.</p>
                <Button size="lg" onClick={() => createMut.mutate()} disabled={createMut.isPending}>
                  <Rocket className="mr-2 h-4 w-4" /> Criar campanha e gerar fila
                </Button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Campanha criada. Destinatários enfileirados.
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => startMut.mutate()} disabled={startMut.isPending}>
                    <Send className="mr-2 h-4 w-4" /> Iniciar envio agora
                  </Button>
                  <Button variant="outline" onClick={() => nav({ to: "/admin/whatsapp-campanhas/$id", params: { id: campaignId } })}>
                    Abrir campanha
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Nav */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ArrowLeft className="mr-2 h-4 w-4" />Voltar
        </Button>
        {step < STEPS.length - 1 && (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canGoNext}>
            Próximo <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

/* -------------------------- subcomponents -------------------------- */

function StatMini({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : "bg-card"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold ${highlight ? "text-primary" : ""}`}>{value.toLocaleString("pt-BR")}</div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-dashed pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function VariableEditor({
  label,
  value,
  onChange,
  customFieldsPool,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  customFieldsPool: string[];
  placeholder?: string;
}) {
  const insertToken = (token: string) => onChange((value ?? "") + `{${token}}`);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <Label className="font-mono">{label}</Label>
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? 'Ex.: Olá {primeiro_nome|"cliente"}, tudo bem?'}
        className="font-mono text-sm"
      />
      <div className="mt-2 flex flex-wrap gap-1">
        {[...DEFAULT_TOKENS, ...customFieldsPool].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => insertToken(t)}
            className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-mono text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          >
            {`{${t}}`}
          </button>
        ))}
      </div>
    </div>
  );
}

function CustomFieldsEditor({ fields, onChange }: { fields: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Campos personalizados</div>
      {Object.entries(fields).map(([k, v]) => (
        <div key={k} className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{`{${k}}`}</span>
          <Input value={v} onChange={(e) => onChange({ ...fields, [k]: e.target.value })} />
          <Button type="button" variant="ghost" size="icon" onClick={() => { const cp = { ...fields }; delete cp[k]; onChange(cp); }}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Input placeholder="nome_campo" value={newKey} onChange={(e) => setNewKey(e.target.value.replace(/[^a-z0-9_]/gi, "_").toLowerCase())} className="max-w-[150px] font-mono text-xs" />
        <Input placeholder="valor padrão" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
        <Button type="button" variant="outline" size="sm" onClick={() => { if (newKey) { onChange({ ...fields, [newKey]: newValue }); setNewKey(""); setNewValue(""); } }}>
          <Plus className="h-3 w-3 mr-1" />Add
        </Button>
      </div>
    </div>
  );
}

function PreviewCard({ previewQ, contact, embedded }: { previewQ: any; contact?: any; embedded?: boolean }) {
  const content = (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Preview com:</span>
        <Badge variant="outline">{contact?.name ?? contact?.phone ?? "sem contato de amostra"}</Badge>
      </div>
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 whitespace-pre-wrap text-sm text-emerald-950">
        {previewQ.data?.header && <div className="font-semibold mb-1">{previewQ.data.header}</div>}
        {previewQ.data?.body ?? "…"}
        {previewQ.data?.footer && <div className="mt-2 text-xs opacity-70">{previewQ.data.footer}</div>}
      </div>
      {(previewQ.data?.buttons ?? []).length > 0 && (
        <div className="space-y-1">
          {previewQ.data.buttons.map((b: any, i: number) => (
            <div key={i} className="rounded-md border bg-card p-2 text-xs">
              <div className="font-medium">{b.text}</div>
              {b.url && <div className="text-muted-foreground truncate">{b.url}</div>}
            </div>
          ))}
        </div>
      )}
      {(previewQ.data?.warnings ?? []).length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 space-y-1">
          {previewQ.data.warnings.map((w: string, i: number) => <div key={i}>⚠ {w}</div>)}
        </div>
      )}
    </div>
  );
  if (embedded) return content;
  return (
    <Card>
      <CardHeader><CardTitle>Prévia</CardTitle></CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
