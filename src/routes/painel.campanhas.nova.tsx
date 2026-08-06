import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  listMyNumbers, listMyTemplates, getMyBalance, createClientCampaign, startClientCampaign,
} from "@/lib/client-panel.functions";
import { adminListAllNumbers, adminListAllTemplates } from "@/lib/admin-dispatch.functions";
import { startWaCampaign as adminStartWaCampaign, scheduleWaCampaign as adminScheduleWaCampaign } from "@/lib/wa-campaigns.functions";
import { linkEventToCampaign } from "@/lib/calendar.functions";
import { checkSchedulingConflict } from "@/lib/wa-schedule.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  CalendarClock, CheckCircle2, Plus, AlertTriangle, ArrowLeft, ArrowRight,
  Phone, MessageSquareText, Save, Clock, Signal, Wifi, WifiOff, Loader2,
  Send, Pause, Play, Ban, XOctagon, Timer, Users2, Activity, PhoneCall, Sliders,
  BarChart3, Image as ImageIcon, Video as VideoIcon, FileText, Upload, X, Link2,
  Info, Zap,
} from "lucide-react";
import { Stepper, type WizardStep } from "@/components/campaigns/wizard/Stepper";
import { WhatsAppPreview } from "@/components/campaigns/wizard/WhatsAppPreview";
import { ContactsStep, type ContactSelValue } from "@/components/campaigns/wizard/ContactsStep";
import { SelectionPreflight } from "@/components/admin/selection-preflight";

import { metaVarsIn, renderMapping, buildContext } from "@/lib/wa-variables";
import { cn } from "@/lib/utils";
import { formatCallingCode, getCountryCallingCode } from "@/lib/phone-country";

const searchSchema = z.object({
  event_id: z.string().uuid().optional(),
  scheduled_for: z.string().optional(),
});

export const Route = createFileRoute("/painel/campanhas/nova")({
  head: () => ({ meta: [{ title: "Nova campanha — Disparos FR" }] }),
  validateSearch: (s) => searchSchema.parse(s),
  component: Page,
});

function Page() {
  const { workspaceId } = Route.useRouteContext() as { workspaceId: string };
  const { event_id, scheduled_for } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <CampaignWizard
      workspaceId={workspaceId}
      event_id={event_id}
      scheduled_for={scheduled_for}
      onExit={() => navigate({ to: "/painel/campanhas" })}
      onOpenCalendar={() => navigate({ to: "/painel/agenda" })}
    />
  );
}

type NumberRow = {
  id: string; display_name: string; phone_masked: string; status: string;
  phone_display?: string | null; phone_country_code?: string | null;
  phone_number_id?: string | null; waba_id?: string | null;
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
  { id: 1, label: "Contatos", short: "Contatos" },
  { id: 2, label: "Ações", short: "Ações" },
  { id: 3, label: "Revisão", short: "Revisão" },
  { id: 4, label: "Envio", short: "Envio" },
  { id: 5, label: "Resultados", short: "Resultados" },
];

// ─────────────────────────────────────────────────────────────────
// Rate limiter / Passo 02 — Configurações de Disparo
// Fields realmente consumidos pelo worker (wa-queue.server.ts) e persistidos
// em wa_campaigns: rate_per_second, max_concurrency, target_per_hour,
// scheduled_pause_enabled, pause_every_messages, pause_duration_seconds.
// ─────────────────────────────────────────────────────────────────
type DispatchPreset =
  | "economico"
  | "intermediario"
  | "alto_volume"
  | "muito_alto"
  | "maximo"
  | "custom";
type DispatchConfig = {
  preset: DispatchPreset;
  target_per_hour: number;      // meta operacional (mensagens/h)
  rate_per_second: number;      // rate_per_second do rate limiter global (por phone_number_id)
  max_concurrency: number;      // requisições HTTP simultâneas
  scheduled_pause_enabled: boolean;
  pause_every_messages: number; // usado apenas se scheduled_pause_enabled
  pause_duration_seconds: number; // usado apenas se scheduled_pause_enabled
};

type PresetSpec = {
  label: string;
  target_per_hour: number;
  rate_per_second: number;
  max_concurrency: number;
};

const DISPATCH_PRESETS: Record<Exclude<DispatchPreset, "custom">, PresetSpec> = {
  economico:      { label: "Econômico — 20 mil/h — 7 msg/s",     target_per_hour: 20_000,  rate_per_second: 7,  max_concurrency: 15  },
  intermediario:  { label: "Intermediário — 50 mil/h — 15 msg/s", target_per_hour: 50_000,  rate_per_second: 15, max_concurrency: 40  },
  alto_volume:    { label: "Alto volume — 100 mil/h — 30 msg/s",  target_per_hour: 100_000, rate_per_second: 30, max_concurrency: 80  },
  muito_alto:     { label: "Muito alto — 200 mil/h — 60 msg/s",   target_per_hour: 200_000, rate_per_second: 60, max_concurrency: 120 },
  maximo:         { label: "Máximo — 288 mil/h — 80 msg/s",       target_per_hour: 288_000, rate_per_second: 80, max_concurrency: 160 },
};

const MAX_RATE_PER_SECOND = 80;
const MAX_CONCURRENCY_UI = 300;
const MAX_TARGET_PER_HOUR = 288_000;

function defaultDispatch(preset: DispatchPreset = "economico"): DispatchConfig {
  const p = preset === "custom" ? DISPATCH_PRESETS.economico : DISPATCH_PRESETS[preset];
  return {
    preset,
    target_per_hour: p.target_per_hour,
    rate_per_second: p.rate_per_second,
    max_concurrency: p.max_concurrency,
    scheduled_pause_enabled: false,
    pause_every_messages: 5000,
    pause_duration_seconds: 60,
  };
}

// ─────────────────────────────────────────────────────────────────
// Fluxo de resposta — configuração salva em wa_campaigns.response_flow_*
// Aplicado pelo webhook quando o contato responder dentro da janela 24h.
// ─────────────────────────────────────────────────────────────────
export type ResponseFlowConfig = {
  enabled: boolean;
  auto_reply_text: string;
  assign_status: "open" | "waiting" | "in_progress" | "resolved" | "archived" | "none";
  tags: string[];
  cooldown_minutes: number;
  cta_enabled: boolean;
  cta_button_text: string;
  cta_url: string;
  cta_header: string;
  cta_footer: string;
};

function defaultResponseFlow(): ResponseFlowConfig {
  return {
    enabled: false,
    auto_reply_text: "",
    assign_status: "in_progress",
    tags: [],
    cooldown_minutes: 60,
    cta_enabled: false,
    cta_button_text: "",
    cta_url: "",
    cta_header: "",
    cta_footer: "",
  };
}


export interface CampaignWizardProps {
  workspaceId: string;
  event_id?: string;
  scheduled_for?: string;
  onExit?: () => void;
  onOpenCalendar?: () => void;
  /** Se true, usa fetchers administrativos (todos os números/templates, sem filtro de grants). */
  adminMode?: boolean;
}

export function CampaignWizard({ workspaceId, event_id, scheduled_for, onExit, onOpenCalendar, adminMode }: CampaignWizardProps) {
  const fnListNumbers = useServerFn(adminMode ? adminListAllNumbers : listMyNumbers);
  const fnListTemplates = useServerFn(adminMode ? adminListAllTemplates : listMyTemplates);
  const fnBalance = useServerFn(getMyBalance);
  const fnCreate = useServerFn(createClientCampaign);
  const fnStart = useServerFn(startClientCampaign);
  const fnAdminStart = useServerFn(adminStartWaCampaign);
  const fnAdminSchedule = useServerFn(adminScheduleWaCampaign);
  const fnLink = useServerFn(linkEventToCampaign);
  const fnConflict = useServerFn(checkSchedulingConflict);

  const DRAFT_KEY = `wa_wizard_draft_${workspaceId}`;

  const toLocal = (iso?: string) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");

  // Wizard
  const [step, setStep] = useState(1);
  const [maxReached, setMaxReached] = useState(1);
  const [name, setName] = useState("");
  const [connectionId, setConnectionId] = useState<string>("");
  const [templateId, setTemplateId] = useState<string>("");
  const [contactSel, setContactSel] = useState<ContactSelValue | null>(null);
  const [dispatch, setDispatch] = useState<DispatchConfig>(defaultDispatch("economico"));
  const [responseFlow, setResponseFlow] = useState<ResponseFlowConfig>(defaultResponseFlow());
  const [mode, setMode] = useState<Mode>(scheduled_for ? "schedule" : "now");
  const [scheduledAt, setScheduledAt] = useState<string>(toLocal(scheduled_for));
  const [timezone, setTimezone] = useState<string>(Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo");
  const [forceConflict, setForceConflict] = useState(false);
  const [bodyVars, setBodyVars] = useState<Record<string, string>>({});
  const [btnVars, setBtnVars] = useState<Record<string, string>>({});
  const [headerMediaUrl, setHeaderMediaUrl] = useState<string>("");
  const [headerMediaMeta, setHeaderMediaMeta] = useState<{ name?: string; size?: number; contentType?: string } | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [preflightVerdict, setPreflightVerdict] = useState<"green" | "yellow" | "red" | null>(null);


  // Data
  const [numbers, setNumbers] = useState<NumberRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [balance, setBalance] = useState<{ available: number; unit_price_cents?: number } | null>(null);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [showRestore, setShowRestore] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);

  // Live progress
  const [progress, setProgress] = useState<{
    status: string; total: number; sent: number; delivered: number; failed: number;
    pending: number; processing: number; accepted?: number; read?: number;
  } | null>(null);

  // -------- Load reference data --------
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

  // -------- Draft persistence --------
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
      if (d.dispatch && typeof d.dispatch === "object") setDispatch({ ...defaultDispatch(), ...d.dispatch });
      if (d.responseFlow && typeof d.responseFlow === "object") setResponseFlow({ ...defaultResponseFlow(), ...d.responseFlow });
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
  useEffect(() => {
    if (campaignId) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          name, connectionId, templateId, contactSel, dispatch, responseFlow, mode, scheduledAt, timezone, step, maxReached,
          savedAt: Date.now(),
        }));
      } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(t);
  }, [name, connectionId, templateId, contactSel, dispatch, responseFlow, mode, scheduledAt, timezone, step, maxReached, campaignId, DRAFT_KEY]);

  // -------- Conflict check --------
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

  // -------- Live progress polling + realtime --------
  const [recipientsLive, setRecipientsLive] = useState<Array<{
    id: string; name: string | null; phone: string; status: string;
    failed_reason?: string | null; error_code?: string | null;
  }>>([]);
  const [recSearch, setRecSearch] = useState("");
  const [recFilter, setRecFilter] = useState<"all" | "processing" | "accepted" | "sent" | "delivered" | "read" | "failed">("all");

  useEffect(() => {
    if (!campaignId || step < 4) return;
    let alive = true;
    async function loadCamp() {
      const { data } = await supabase
        .from("wa_campaigns")
        .select("status,progress,total_recipients")
        .eq("id", campaignId!)
        .maybeSingle();
      if (!alive || !data) return;
      const p = (data.progress as any) ?? {};
      setProgress({
        status: data.status,
        total: data.total_recipients ?? 0,
        sent: p.sent ?? 0,
        delivered: p.delivered ?? 0,
        failed: p.failed ?? 0,
        pending: p.pending ?? 0,
        processing: p.processing ?? 0,
        accepted: p.accepted ?? 0,
        read: p.read ?? 0,
      } as any);
    }
    async function loadRecipients() {
      const { data: rs } = await supabase
        .from("campaign_recipients")
        .select("id, phone, status, failed_reason, error_code, contact_name")
        .eq("campaign_id", campaignId!)
        .order("created_at", { ascending: true })
        .limit(500);
      if (!alive) return;
      setRecipientsLive(
        (rs ?? []).map((r: any) => ({
          id: r.id,
          name: r.contact_name ?? null,
          phone: r.phone,
          status: r.status,
          failed_reason: r.failed_reason,
          error_code: r.error_code,
        })),
      );
    }
    loadCamp();
    loadRecipients();
    // Polling fallback (mais espaçado; realtime cobre atualizações rápidas)
    const pollId = setInterval(() => { loadCamp(); loadRecipients(); }, 20000);
    // Realtime — atualiza sem esperar o polling.
    // Frente 4: NÃO ouvir campaign_recipients direto (1M UPDATEs em campanhas grandes).
    // wa_campaigns é atualizado por trigger e reflete sent/delivered/read/failed/progress.
    const chan = supabase
      .channel(`camp-live-${campaignId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "wa_campaigns", filter: `id=eq.${campaignId}` },
        () => { loadCamp(); loadRecipients(); },
      )
      .subscribe();
    return () => { alive = false; clearInterval(pollId); supabase.removeChannel(chan); };
  }, [campaignId, step]);

  const filteredRecipients = useMemo(() => {
    const q = recSearch.trim().toLowerCase();
    return recipientsLive.filter((r) => {
      if (q) {
        const hay = `${r.name ?? ""} ${r.phone ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (recFilter === "all") return true;
      const s = (r.status || "").toLowerCase();
      if (recFilter === "failed") return s === "failed";
      if (recFilter === "processing") return s === "processing" || s === "pending";
      return s === recFilter;
    });
  }, [recipientsLive, recSearch, recFilter]);


  // -------- Derived --------
  const selectedNumber = useMemo(() => numbers.find((n) => n.id === connectionId), [numbers, connectionId]);
  const selectedTemplate = useMemo(() => templates.find((t) => t.id === templateId), [templates, templateId]);
  const validContacts = contactSel?.valid ?? 0;
  const selectedAudienceCode = useMemo(() => {
    const contacts = contactSel?.contacts ?? [];
    if (!contacts.length) return null;
    const counts = new Map<string, number>();
    for (const c of contacts) {
      const code = getCountryCallingCode(c.phone);
      if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    let code: string | null = null;
    let count = 0;
    for (const [k, v] of counts) {
      if (v > count) { code = k; count = v; }
    }
    return code;
  }, [contactSel]);
  const senderCode = selectedNumber?.phone_country_code ?? getCountryCallingCode(selectedNumber?.phone_display ?? selectedNumber?.phone_masked);
  const ddiDifferent = !!selectedAudienceCode && !!senderCode && selectedAudienceCode !== senderCode;
  // Duração estimada usa a taxa efetiva do rate limiter (msg/s).
  const estimatedDurationMin = useMemo(() => {
    if (!validContacts || dispatch.rate_per_second <= 0) return 0;
    return Math.ceil(validContacts / dispatch.rate_per_second / 60);
  }, [validContacts, dispatch.rate_per_second]);
  const estimatedCostCents = useMemo(() => (balance?.unit_price_cents ?? 15) * validContacts, [balance, validContacts]);

  // Template-driven variable maps
  const tplBodyVarNums = useMemo(
    () => (selectedTemplate ? metaVarsIn(selectedTemplate.body ?? "") : []),
    [selectedTemplate]
  );
  const tplHeaderType = useMemo(
    () => (selectedTemplate?.header_type ?? "").toString().toLowerCase(),
    [selectedTemplate]
  );
  const tplRequiresMedia = ["image", "video", "document"].includes(tplHeaderType);
  const tplUrlButton = useMemo(() => {
    const btns = (selectedTemplate?.buttons ?? []) as any[];
    return btns.find((b) => (b?.type || "").toString().toLowerCase() === "url" && b?.url);
  }, [selectedTemplate]);
  const tplUrlVarNums = useMemo(
    () => (tplUrlButton?.url ? metaVarsIn(String(tplUrlButton.url)) : []),
    [tplUrlButton]
  );

  // Reset mappings when template changes
  useEffect(() => {
    setBodyVars({});
    setBtnVars({});
    setHeaderMediaUrl("");
    setHeaderMediaMeta(null);
  }, [templateId]);

  // ---- Preview data (substitui {{n}} pelas variáveis e resolve {nome}, {telefone}... com o 1º lead) ----
  const previewCtx = useMemo(() => {
    const first = contactSel?.contacts?.[0];
    return buildContext({ contact: first ? { name: first.name ?? "", phone: first.phone ?? "" } : {} });
  }, [contactSel]);

  const substituteVars = useCallback((text: string, vars: Record<string, string>) => {
    if (!text) return "";
    return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => {
      const v = vars[String(n)];
      return v && v.trim() !== "" ? v : `{{${n}}}`;
    });
  }, []);

  const resolveTokens = useCallback(
    (text: string) => (text ? renderMapping(text, previewCtx) : ""),
    [previewCtx],
  );

  const previewBody = useMemo(
    () => resolveTokens(substituteVars(selectedTemplate?.body ?? "", bodyVars)),
    [selectedTemplate, bodyVars, substituteVars, resolveTokens],
  );
  const previewHeaderText = useMemo(
    () => (selectedTemplate?.header_text ? resolveTokens(substituteVars(selectedTemplate.header_text, bodyVars)) : undefined),
    [selectedTemplate, bodyVars, substituteVars, resolveTokens],
  );
  const previewButtons = useMemo(() => {
    const btns = (selectedTemplate?.buttons ?? []) as any[];
    return btns.map((b) => {
      const t = (b?.type ?? "").toString().toLowerCase();
      if (t === "url" && typeof b?.url === "string") {
        return { ...b, url: resolveTokens(substituteVars(b.url, btnVars)) };
      }
      return b;
    });
  }, [selectedTemplate, btnVars, substituteVars, resolveTokens]);
  const previewHeader = useMemo(() => {
    if (!selectedTemplate) return null;
    const type = selectedTemplate.header_type ?? undefined;
    const t = (type ?? "").toString().toLowerCase();
    if (["image", "video", "document"].includes(t)) {
      return { type, media_type: t, media_url: headerMediaUrl || undefined };
    }
    return { type, text: previewHeaderText };
  }, [selectedTemplate, headerMediaUrl, previewHeaderText]);

  // Human-readable file size
  const formatSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return "";
    const units = ["B", "KB", "MB", "GB"];
    let i = 0; let v = bytes;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
  };

  // Missing-field list for Step 2 (used for the inline summary and per-field flags)
  const step2Missing = useMemo(() => {
    const items: string[] = [];
    if (!connectionId) items.push("Selecione o número de WhatsApp de envio");
    if (!templateId) items.push("Selecione o template aprovado");
    if (tplRequiresMedia && !headerMediaUrl.trim()) items.push(`Envie a mídia do cabeçalho (${tplHeaderType})`);
    for (const n of tplBodyVarNums) {
      if (!(bodyVars[String(n)] ?? "").trim()) items.push(`Preencha a variável {{${n}}} do corpo`);
    }
    for (const n of tplUrlVarNums) {
      if (!(btnVars[String(n)] ?? "").trim()) items.push(`Preencha a variável {{${n}}} da URL do botão`);
    }
    if (dispatch.rate_per_second <= 0) items.push("Mensagens por segundo deve ser maior que zero");
    if (dispatch.max_concurrency < 1) items.push("Concorrência máxima deve ser pelo menos 1");
    if (dispatch.scheduled_pause_enabled) {
      if (dispatch.pause_every_messages < 1) items.push("Pausa programada: informe a quantidade de envios");
      if (dispatch.pause_duration_seconds < 1) items.push("Pausa programada: informe a duração em segundos");
    }
    return items;
  }, [connectionId, templateId, tplRequiresMedia, headerMediaUrl, tplHeaderType, tplBodyVarNums, bodyVars, tplUrlVarNums, btnVars, dispatch]);

  // -------- Navigation --------
  const canAdvance = useCallback((from: number): boolean => {
    if (from === 1) return !!contactSel?.list_id;
    if (from === 2) {
      if (!connectionId || !templateId) return false;
      if (dispatch.rate_per_second <= 0 || dispatch.max_concurrency < 1) return false;
      if (dispatch.scheduled_pause_enabled && (dispatch.pause_every_messages < 1 || dispatch.pause_duration_seconds < 1)) return false;
      if (tplRequiresMedia && !headerMediaUrl.trim()) return false;
      for (const n of tplBodyVarNums) if (!(bodyVars[String(n)] ?? "").trim()) return false;
      for (const n of tplUrlVarNums) if (!(btnVars[String(n)] ?? "").trim()) return false;
      return true;
    }
    if (from === 3) return !!name.trim();
    return true;
  }, [contactSel, connectionId, templateId, dispatch, name, tplRequiresMedia, headerMediaUrl, tplBodyVarNums, bodyVars, tplUrlVarNums, btnVars]);

  function goTo(id: number) { if (id <= maxReached) setStep(id); }
  function next() {
    if (!canAdvance(step)) { toast.error("Preencha os campos obrigatórios"); return; }
    const nxt = Math.min(step + 1, STEPS.length);
    setStep(nxt);
    setMaxReached((m) => Math.max(m, nxt));
  }
  function back() { setStep((s) => Math.max(1, s - 1)); }

  // Upload header media -> long-lived signed URL (bucket is private).
  async function uploadHeaderMedia(file: File) {
    setUploadingMedia(true);
    try {
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const key = `${workspaceId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("campaign-images").upload(key, file, {
        cacheControl: "3600", upsert: false, contentType: file.type || undefined,
      });
      if (upErr) throw upErr;
      // 7 days — Meta downloads the URL at send time.
      const { data: signed, error: sErr } = await supabase.storage.from("campaign-images")
        .createSignedUrl(key, 60 * 60 * 24 * 7);
      if (sErr || !signed?.signedUrl) throw sErr ?? new Error("Falha ao gerar URL");
      setHeaderMediaUrl(signed.signedUrl);
      setHeaderMediaMeta({ name: file.name, size: file.size, contentType: file.type || undefined });
      toast.success("Mídia carregada.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro no upload da mídia");
    } finally {
      setUploadingMedia(false);
    }
  }

  // -------- Submit --------
  async function handleSubmit(finalMode: Mode) {
    if (!name.trim() || !connectionId || !templateId || !contactSel?.list_id) {
      toast.error("Faltam informações. Volte às etapas anteriores.");
      return;
    }
    if (tplRequiresMedia && !headerMediaUrl.trim()) {
      toast.error("Envie a mídia do cabeçalho do template."); return;
    }
    for (const n of tplBodyVarNums) {
      if (!(bodyVars[String(n)] ?? "").trim()) { toast.error(`Preencha a variável {{${n}}} do corpo.`); return; }
    }
    for (const n of tplUrlVarNums) {
      if (!(btnVars[String(n)] ?? "").trim()) { toast.error(`Preencha a variável {{${n}}} da URL do botão.`); return; }
    }
    if (finalMode === "schedule" && !scheduledAt) { toast.error("Informe a data/hora do agendamento"); return; }
    if (finalMode === "schedule" && conflicts.length > 0 && !forceConflict) {
      toast.error("Existe conflito de horário. Marque 'forçar' para prosseguir."); return;
    }
    setSubmitting(true);
    try {
      const dispatchPayload = {
        target_per_hour: dispatch.target_per_hour,
        rate_per_second: dispatch.rate_per_second,
        max_concurrency: dispatch.max_concurrency,
        scheduled_pause_enabled: dispatch.scheduled_pause_enabled,
        pause_every_messages: dispatch.scheduled_pause_enabled ? dispatch.pause_every_messages : null,
        pause_duration_seconds: dispatch.scheduled_pause_enabled ? dispatch.pause_duration_seconds : null,
      };
      const { campaign } = await fnCreate({
        data: {
          workspace_id: workspaceId,
          name: name.trim(),
          connection_id: connectionId,
          template_id: templateId,
          list_id: contactSel.list_id,
          variables_mapping: bodyVars,
          button_url_mapping: btnVars,
          header_media_url: headerMediaUrl || null,
          scheduled_at: finalMode === "schedule" ? new Date(scheduledAt).toISOString() : null,
          response_flow_enabled: responseFlow.enabled,
          response_flow_config: responseFlow.enabled ? {
            auto_reply_text: responseFlow.auto_reply_text.trim() || null,
            assign_status: responseFlow.assign_status === "none" ? null : responseFlow.assign_status,
            tags: responseFlow.tags,
            cooldown_minutes: responseFlow.cooldown_minutes,
            cta_enabled: !!(responseFlow.cta_enabled && responseFlow.cta_button_text.trim() && responseFlow.cta_url.trim()),
            cta_button_text: responseFlow.cta_button_text.trim() || null,
            cta_url: responseFlow.cta_url.trim() || null,
            cta_header: responseFlow.cta_header.trim() || null,
            cta_footer: responseFlow.cta_footer.trim() || null,
          } : null,

          ...dispatchPayload,
        },
      });
      if (event_id) {
        try { await fnLink({ data: { event_id, campaign_id: campaign.id } }); } catch { /* non-fatal */ }
      }
      // Timezone + reforço da config do rate limiter (garante persistência mesmo no adminMode).
      await supabase.from("wa_campaigns").update({
        timezone,
        ...dispatchPayload,
      } as any).eq("id", campaign.id);

      if (finalMode === "now") {
        if (adminMode) {
          await fnAdminStart({ data: { id: campaign.id } });
          toast.success("Campanha iniciada.");
        } else {
          const r = await fnStart({ data: { campaign_id: campaign.id } });
          toast.success(r.status === "queued" ? "Campanha na fila!" : "Aguardando aprovação.");
        }
      } else if (finalMode === "schedule") {
        if (adminMode) {
          await fnAdminSchedule({ data: { id: campaign.id, scheduled_at: new Date(scheduledAt).toISOString() } });
        } else {
          await supabase.from("wa_campaigns").update({
            status: "scheduled",
            scheduled_at: new Date(scheduledAt).toISOString(),
          }).eq("id", campaign.id);
        }
        toast.success("Campanha agendada.");
      } else {
        toast.success("Rascunho salvo.");
      }
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      setCampaignId(campaign.id);
      if (finalMode === "now") {
        // Stay on step 4 to show live progress
      } else {
        // Jump straight to Resultados card
        setStep(5); setMaxReached(5);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar campanha");
    } finally {
      setSubmitting(false);
    }
  }

  // -------- Pause / cancel --------
  async function pauseCampaign() {
    if (!campaignId) return;
    const { error } = await supabase.from("wa_campaigns")
      .update({ status: "paused", paused_at: new Date().toISOString() })
      .eq("id", campaignId);
    if (error) toast.error(error.message); else toast.success("Campanha pausada");
  }
  async function resumeCampaign() {
    if (!campaignId) return;
    const { error } = await supabase.from("wa_campaigns")
      .update({ status: "running", resumed_at: new Date().toISOString() })
      .eq("id", campaignId);
    if (error) toast.error(error.message); else toast.success("Campanha retomada");
  }
  async function cancelCampaign(force = false) {
    if (!campaignId) return;
    if (!force && !confirm("Cancelar esta campanha? Contatos pendentes não serão enviados.")) return;
    await supabase.from("campaign_recipients")
      .update({ status: "cancelled" })
      .eq("campaign_id", campaignId)
      .eq("status", "pending");
    const { error } = await supabase.from("wa_campaigns")
      .update({ status: "cancelled", canceled_at: new Date().toISOString(), finished_at: new Date().toISOString() })
      .eq("id", campaignId);
    if (error) toast.error(error.message); else toast.success(force ? "Cancelamento forçado" : "Campanha cancelada");
  }

  function resetForNext() {
    setCampaignId(null); setProgress(null);
    setStep(1); setMaxReached(1);
    setName(""); setTemplateId(""); setContactSel(null);
    setMode("now"); setScheduledAt(""); setConflicts([]); setForceConflict(false);
  }

  const isDone = progress && ["completed", "partial", "cancelled", "error"].includes(progress.status);

  return (
    <>
      <Card className="mb-4">
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1">
              <Label className="text-xs">Nome da campanha</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Boas-vindas de Outubro" className="mt-1" maxLength={160} />
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

      {/* ============== STEP 1 — CONTATOS ============== */}
      {step === 1 && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div>
              <h2 className="text-lg font-semibold">Selecione os destinatários</h2>
              <p className="text-sm text-muted-foreground">Escolha para quem você deseja enviar a mensagem</p>
            </div>
            <ContactsStep workspaceId={workspaceId} value={contactSel} onChange={setContactSel} />
            <NavFooter onNext={next} onBack={null} disabled={!canAdvance(1)} nextLabel="Próximo" />
          </CardContent>
        </Card>
      )}

      {/* ============== STEP 2 — AÇÕES ============== */}
      {step === 2 && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div>
              <h2 className="text-lg font-semibold">Componha suas ações</h2>
              <p className="text-sm text-muted-foreground">Selecione o número, o template e configure o ritmo do disparo</p>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
              <div className="space-y-4">
                {/* Número + Template */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="mb-1 flex items-center gap-1.5 text-xs uppercase tracking-wide">
                      <PhoneCall className="h-3.5 w-3.5" /> WhatsApp de envio *
                    </Label>
                    <select
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={connectionId}
                      onChange={(e) => { setConnectionId(e.target.value); setTemplateId(""); }}
                    >
                      <option value="">— Selecione um número —</option>
                      {numbers.map((n) => (
                        <option key={n.id} value={n.id}>
                          {(n.phone_display ?? n.phone_masked)} — {n.display_name}{n.phone_number_id ? ` · ID ${n.phone_number_id}` : ""}
                        </option>
                      ))}
                    </select>
                    {selectedNumber && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                        {String(selectedNumber.status).toLowerCase().match(/active|connected/)
                          ? <Badge variant="secondary" className="gap-1"><Wifi className="h-3 w-3" /> {selectedNumber.status}</Badge>
                          : <Badge variant="destructive" className="gap-1"><WifiOff className="h-3 w-3" /> {selectedNumber.status}</Badge>}
                        {selectedNumber.quality_rating && (
                          <Badge variant="outline" className="gap-1"><Signal className="h-3 w-3" /> {selectedNumber.quality_rating}</Badge>
                        )}
                        {selectedNumber.messaging_limit_tier && (
                          <Badge variant="outline">Tier: {selectedNumber.messaging_limit_tier}</Badge>
                        )}
                        {senderCode && <Badge variant="outline">DDI {formatCallingCode(senderCode)}</Badge>}
                      </div>
                    )}
                    {ddiDifferent && (
                      <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                        A lista selecionada é {formatCallingCode(selectedAudienceCode)} e o WhatsApp de envio é {formatCallingCode(senderCode)}. O envio internacional está liberado; os destinatários serão enviados com o DDI salvo na lista.
                      </div>
                    )}
                  </div>
                  <div>
                    <Label className="mb-1 flex items-center gap-1.5 text-xs uppercase tracking-wide">
                      <MessageSquareText className="h-3.5 w-3.5" /> Template *
                    </Label>
                    <select
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={templateId}
                      onChange={(e) => setTemplateId(e.target.value)}
                      disabled={!connectionId}
                    >
                      <option value="">
                        {!connectionId ? "— Selecione o número primeiro —" : "— Selecione um template —"}
                      </option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>{t.name} ({t.language})</option>
                      ))}
                    </select>
                    {connectionId && templates.length === 0 && (
                      <div className="mt-1 text-[11px] text-muted-foreground">Nenhum template aprovado para este número.</div>
                    )}
                  </div>
                </div>

                {adminMode && connectionId && templateId && (
                  <SelectionPreflight
                    connectionId={connectionId}
                    templateId={templateId}
                    totalRecipients={validContacts}
                    onVerdict={setPreflightVerdict}
                  />
                )}


                {/* Conteúdo dinâmico do template */}
                {selectedTemplate && (tplRequiresMedia || tplBodyVarNums.length > 0 || tplUrlVarNums.length > 0) && (
                  <div className="rounded-lg border p-4 space-y-4">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <MessageSquareText className="h-4 w-4" /> Conteúdo do template
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Preencha as variáveis dinâmicas do template selecionado.
                      </div>
                    </div>

                    {tplRequiresMedia && (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wide">
                            {tplHeaderType === "video" ? <VideoIcon className="h-3.5 w-3.5" />
                              : tplHeaderType === "document" ? <FileText className="h-3.5 w-3.5" />
                              : <ImageIcon className="h-3.5 w-3.5" />}
                            Mídia do cabeçalho*
                          </Label>
                          <div className="flex items-center gap-1.5">
                            <Badge variant="secondary" className="text-[10px] uppercase">{tplHeaderType}</Badge>
                            {headerMediaMeta?.size ? (
                              <Badge variant="outline" className="text-[10px]">{formatSize(headerMediaMeta.size)}</Badge>
                            ) : null}
                            {headerMediaUrl ? (
                              <Badge className="bg-emerald-600 text-white text-[10px]">Pronto</Badge>
                            ) : uploadingMedia ? (
                              <Badge variant="outline" className="text-[10px]">Enviando…</Badge>
                            ) : (
                              <Badge variant="destructive" className="text-[10px]">Obrigatório</Badge>
                            )}
                          </div>
                        </div>

                        {headerMediaUrl ? (
                          <div className={cn(
                            "space-y-2 rounded-lg border p-2",
                            "bg-muted/20"
                          )}>
                            <div className="w-full overflow-hidden rounded-md bg-black/5">
                              {tplHeaderType === "image" && (
                                <img
                                  src={headerMediaUrl}
                                  alt="Prévia da mídia do cabeçalho"
                                  className="mx-auto block h-auto w-full max-h-72 object-contain"
                                />
                              )}
                              {tplHeaderType === "video" && (
                                <video
                                  src={headerMediaUrl}
                                  controls
                                  playsInline
                                  className="mx-auto block h-auto w-full max-h-72 bg-black"
                                />
                              )}
                              {tplHeaderType === "document" && (
                                <a href={headerMediaUrl} target="_blank" rel="noreferrer"
                                  className="flex items-center gap-2 p-4 text-sm text-primary underline">
                                  <FileText className="h-4 w-4" />
                                  {headerMediaMeta?.name || "Abrir documento"}
                                </a>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                              <span className="truncate max-w-[70%]" title={headerMediaMeta?.name || headerMediaUrl}>
                                {headerMediaMeta?.name || headerMediaUrl}
                              </span>
                              <div className="flex flex-wrap gap-2">
                                <Button type="button" variant="outline" size="sm"
                                  onClick={() => { setHeaderMediaUrl(""); setHeaderMediaMeta(null); }}>
                                  <X className="mr-1 h-3.5 w-3.5" /> Remover
                                </Button>
                                <label className="inline-flex cursor-pointer">
                                  <Input type="file" className="hidden"
                                    accept={tplHeaderType === "image" ? "image/*" : tplHeaderType === "video" ? "video/*" : "*"}
                                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadHeaderMedia(f); e.currentTarget.value = ""; }} />
                                  <span className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:bg-muted">
                                    <Upload className="h-3.5 w-3.5" /> Substituir
                                  </span>
                                </label>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className={cn(
                            "space-y-2 rounded-lg border border-dashed p-3",
                            "border-destructive/40"
                          )}>
                            <label className="inline-flex cursor-pointer">
                              <Input type="file" className="hidden"
                                accept={tplHeaderType === "image" ? "image/*" : tplHeaderType === "video" ? "video/*" : "*"}
                                onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadHeaderMedia(f); e.currentTarget.value = ""; }}
                                disabled={uploadingMedia} />
                              <span className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-muted">
                                {uploadingMedia ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                {uploadingMedia ? "Enviando..." : `Fazer upload de ${tplHeaderType}`}
                              </span>
                            </label>
                            <div className="flex items-center gap-2">
                              <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                              <Input placeholder="ou cole uma URL pública da mídia"
                                value={headerMediaUrl}
                                onChange={(e) => { setHeaderMediaUrl(e.target.value); setHeaderMediaMeta(null); }} />
                            </div>
                            <p className="text-[11px] text-destructive">
                              Este template exige {tplHeaderType === "image" ? "uma imagem" : tplHeaderType === "video" ? "um vídeo" : "um documento"} no cabeçalho.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {tplBodyVarNums.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-wide">Variáveis do corpo</Label>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {tplBodyVarNums.map((n) => {
                            const val = bodyVars[String(n)] ?? "";
                            const missing = !val.trim();
                            return (
                              <div key={`body-${n}`}>
                                <Label className="flex items-center justify-between text-[11px] text-muted-foreground">
                                  <span>{`{{${n}}}`}</span>
                                  {missing && <span className="text-destructive">obrigatório</span>}
                                </Label>
                                <Input
                                  value={val}
                                  onChange={(e) => setBodyVars((v) => ({ ...v, [String(n)]: e.target.value }))}
                                  placeholder='Valor fixo ou token, ex: {nome|"Cliente"}'
                                  aria-invalid={missing}
                                  className={cn(missing && "border-destructive focus-visible:ring-destructive")}
                                />
                              </div>
                            );
                          })}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Tokens suportados: <code>{'{nome}'}</code>, <code>{'{email}'}</code>, <code>{'{telefone}'}</code>, <code>{'{cliente.nome}'}</code>, com fallback <code>{'{campo|"padrão"}'}</code>.
                        </p>
                      </div>
                    )}

                    {tplUrlVarNums.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-wide">
                          Variável da URL do botão{tplUrlButton?.text ? ` — "${tplUrlButton.text}"` : ""}
                        </Label>
                        <div className="rounded-md border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground break-all">
                          {String(tplUrlButton?.url ?? "")}
                        </div>
                        {(() => {
                          const raw = String(tplUrlButton?.url ?? "");
                          const trackedHosts = ["disparosfr.com", "www.disparosfr.com"];
                          let host = "";
                          try { host = new URL(raw.replace(/\{\{\d+\}\}/g, "x")).hostname; } catch { host = ""; }
                          const tracked = trackedHosts.includes(host);
                          return tracked ? (
                            <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-[11px] text-primary">
                              Link rastreado: preencha a variável com o <strong>slug</strong> da campanha criada em
                              {" "}<code>/admin/campaigns</code> (ex.: <code>bigode</code>). Os cliques aparecem em tempo real.
                            </div>
                          ) : (
                            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-[11px] text-amber-700 dark:text-amber-400">
                              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              <div>
                                Este botão aponta para <strong>{host || "domínio externo"}</strong>, fora do rastreio — os cliques
                                <strong> não serão contabilizados</strong>. Para medir cliques, aprove um template cuja URL do botão seja
                                {" "}<code>https://disparosfr.com/{"{{1}}"}</code> e informe aqui o slug da campanha (o destino final continua o mesmo,
                                configurado em <code>/admin/campaigns</code>).
                              </div>
                            </div>
                          );
                        })()}

                        <div className="grid gap-2 sm:grid-cols-2">
                          {tplUrlVarNums.map((n) => {
                            const val = btnVars[String(n)] ?? "";
                            const missing = !val.trim();
                            return (
                              <div key={`btn-${n}`}>
                                <Label className="flex items-center justify-between text-[11px] text-muted-foreground">
                                  <span>{`{{${n}}} da URL`}</span>
                                  {missing && <span className="text-destructive">obrigatório</span>}
                                </Label>
                                <Input
                                  value={val}
                                  onChange={(e) => setBtnVars((v) => ({ ...v, [String(n)]: e.target.value }))}
                                  placeholder="Valor a inserir no link"
                                  aria-invalid={missing}
                                  className={cn(missing && "border-destructive focus-visible:ring-destructive")}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {step2Missing.length > 0 && (
                      <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div className="space-y-1">
                          <div className="font-semibold">Preencha antes de avançar para a revisão:</div>
                          <ul className="list-disc pl-4 space-y-0.5">
                            {step2Missing.map((m, i) => <li key={i}>{m}</li>)}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                )}



                {/* Config — Rate limiter (Passo 02) */}
                <DispatchConfigCard value={dispatch} onChange={setDispatch} />

                {/* Fluxo de resposta — aplica-se ao webhook quando o contato responde na janela 24h */}
                <ResponseFlowCard value={responseFlow} onChange={setResponseFlow} />

              </div>

              <div>
                <Label className="mb-1 block text-xs">Pré-visualização</Label>
                <WhatsAppPreview
                  senderName={selectedNumber?.display_name}
                  header={previewHeader}
                  body={previewBody}
                  footer={selectedTemplate?.footer ?? null}
                  buttons={previewButtons}
                />
              </div>
            </div>

            <NavFooter onNext={next} onBack={back} disabled={!canAdvance(2)} nextLabel="Próximo" />
          </CardContent>
        </Card>
      )}

      {/* ============== STEP 3 — REVISÃO ============== */}
      {step === 3 && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div>
              <h2 className="text-lg font-semibold">Revise e confirme</h2>
              <p className="text-sm text-muted-foreground">Verifique os detalhes antes de executar as ações</p>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
              <div className="space-y-3">
                <div className="rounded-lg border">
                  <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Users2 className="h-4 w-4" /> DESTINATÁRIOS
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => goTo(1)}>Editar</Button>
                  </div>
                  <div className="p-3 text-sm">
                    <div className="rounded-md border p-3">
                      <div className="font-semibold">{contactSel?.valid ?? 0} contatos selecionados</div>
                      <div className="text-xs text-muted-foreground">De um total de {contactSel?.total ?? 0} · lista "{contactSel?.list_name}"</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border">
                  <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <MessageSquareText className="h-4 w-4" /> AÇÕES
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => goTo(2)}>Editar</Button>
                  </div>
                  <div className="space-y-2 p-3 text-sm">
                    <ReviewRow label="Nome" value={name || <em className="text-muted-foreground">sem nome</em>} />
                    <ReviewRow label="Número" value={selectedNumber ? `${selectedNumber.display_name} (${selectedNumber.phone_masked})` : "—"} />
                    <ReviewRow label="Template" value={selectedTemplate?.name ?? "—"} />
                    {tplRequiresMedia && (
                      <ReviewRow label={`Mídia (${tplHeaderType})`} value={headerMediaUrl
                        ? <a href={headerMediaUrl} target="_blank" rel="noreferrer" className="text-primary underline">Ver mídia</a>
                        : <em className="text-muted-foreground">não enviada</em>} />
                    )}
                    {tplBodyVarNums.map((n) => (
                      <ReviewRow key={`rv-body-${n}`} label={`Var. corpo {{${n}}}`}
                        value={bodyVars[String(n)] || <em className="text-muted-foreground">vazio</em>} />
                    ))}
                    {tplUrlVarNums.map((n) => (
                      <ReviewRow key={`rv-btn-${n}`} label={`Var. URL {{${n}}}`}
                        value={btnVars[String(n)] || <em className="text-muted-foreground">vazio</em>} />
                    ))}
                    {mode === "schedule" && scheduledAt && (
                      <ReviewRow label="Agendamento"
                        value={`${new Date(scheduledAt).toLocaleString("pt-BR")} (${timezone})`} />
                    )}
                    <ReviewRow label="Velocidade" value={`${dispatch.rate_per_second} msg/s · ~${Math.round(1000 / Math.max(1, dispatch.rate_per_second))} ms`} />
                    <ReviewRow label="Meta operacional" value={`${dispatch.target_per_hour.toLocaleString("pt-BR")} msgs/h`} />
                    <ReviewRow label="Concorrência máx." value={`${dispatch.max_concurrency} requisições`} />
                    <ReviewRow label="Pausa programada" value={
                      dispatch.scheduled_pause_enabled
                        ? `${dispatch.pause_duration_seconds}s a cada ${dispatch.pause_every_messages.toLocaleString("pt-BR")} envios`
                        : "desativada"
                    } />
                    <ReviewRow label="Duração estimada" value={estimatedDurationMin > 60 ? `${Math.floor(estimatedDurationMin / 60)}h ${estimatedDurationMin % 60}min` : `${estimatedDurationMin} min`} />
                    <ReviewRow label="Custo estimado" value={`R$ ${(estimatedCostCents / 100).toFixed(2)}`} />
                    {!adminMode && (
                      <ReviewRow label="Saldo (msgs)" value={balance?.available?.toLocaleString("pt-BR") ?? "—"} />
                    )}
                  </div>
                </div>

                {!adminMode && balance && balance.available < validContacts && (
                  <div className="flex items-start gap-2 rounded border border-amber-400 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>Saldo insuficiente. Você tem <b>{balance.available}</b> mensagens e precisa de <b>{validContacts}</b>.</div>
                  </div>
                )}
              </div>

              <div>
                <Label className="mb-1 block text-xs">Prévia da mensagem</Label>
                <WhatsAppPreview
                  senderName={selectedNumber?.display_name}
                  header={previewHeader}
                  body={previewBody}
                  footer={selectedTemplate?.footer ?? null}
                  buttons={previewButtons}
                />
              </div>
            </div>

            <NavFooter onNext={next} onBack={back} disabled={!canAdvance(3)} nextLabel="Ir para envio" />
          </CardContent>
        </Card>
      )}

      {/* ============== STEP 4 — ENVIO ============== */}
      {step === 4 && !campaignId && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div>
              <h2 className="text-lg font-semibold">Como você quer enviar?</h2>
              <p className="text-sm text-muted-foreground">Envie imediatamente, agende para depois ou salve como rascunho.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {([
                { m: "now" as Mode, icon: Send, title: "Enviar agora", desc: "Coloca a campanha na fila. O envio acontece em segundo plano." },
                { m: "schedule" as Mode, icon: Clock, title: "Agendar", desc: "Escolha data e horário. Executa automaticamente." },
                { m: "draft" as Mode, icon: Save, title: "Salvar rascunho", desc: "Guarda a campanha sem enviar." },
              ]).map(({ m, icon: Icon, title, desc }) => (
                <button key={m} type="button" onClick={() => setMode(m)}
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
                {mode === "now" ? "Realizar Disparo" : mode === "schedule" ? "Agendar Campanha" : "Salvar Rascunho"}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              O disparo é executado em segundo plano. Você pode fechar esta página, criar outra campanha ou usar outros módulos sem interromper o envio.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Live progress after send */}
      {step === 4 && campaignId && progress && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  {isDone ? "Envio concluído" : "Enviando mensagens..."}
                </h2>
                <p className="text-sm text-muted-foreground">Campanha "{name}"</p>
              </div>

              <div>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-semibold">Progresso</span>
                  <span>{progress.total ? Math.round(((progress.sent + progress.failed) / progress.total) * 100) : 0}%</span>
                </div>
                <Progress value={progress.total ? ((progress.sent + progress.failed) / progress.total) * 100 : 0} />
                <div className="mt-1 text-right text-xs text-muted-foreground">
                  {progress.sent + progress.failed} / {progress.total} contatos
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <StatCard icon={<Users2 className="h-4 w-4" />} label="Contatos Processados" value={progress.sent + progress.failed} />
                <StatCard icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />} label="Contatos Enviados" value={progress.sent} />
                <StatCard icon={<XOctagon className="h-4 w-4 text-red-500" />} label="Falhas" value={progress.failed} />
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <Sliders className="h-4 w-4" /> Configurações de Envio
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <ConfigBadge icon={<Timer className="h-4 w-4" />} title="Velocidade" subtitle={`~${Math.round(1000 / Math.max(1, dispatch.rate_per_second))} ms · concorrência ${dispatch.max_concurrency}`} value={`${dispatch.rate_per_second} msg/s`} />
                  <ConfigBadge icon={<Clock className="h-4 w-4" />} title="Pausa programada" subtitle={dispatch.scheduled_pause_enabled ? `A cada ${dispatch.pause_every_messages.toLocaleString("pt-BR")} envios` : "Não aplicada"} value={dispatch.scheduled_pause_enabled ? `${dispatch.pause_duration_seconds}s` : "—"} />
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                {progress.status === "running" && (
                  <Button variant="outline" onClick={pauseCampaign}><Pause className="mr-1 h-4 w-4" /> Pausar</Button>
                )}
                {progress.status === "paused" && (
                  <Button variant="outline" onClick={resumeCampaign}><Play className="mr-1 h-4 w-4" /> Retomar</Button>
                )}
                {!isDone && (
                  <>
                    <Button variant="outline" onClick={() => cancelCampaign(false)} className="border-red-300 text-red-600">
                      <Ban className="mr-1 h-4 w-4" /> Cancelar
                    </Button>
                    <Button variant="destructive" onClick={() => cancelCampaign(true)}>
                      <XOctagon className="mr-1 h-4 w-4" /> Forçar Cancelamento
                    </Button>
                  </>
                )}
                {isDone && (
                  <Button onClick={() => setStep(5)} size="lg">
                    Ver Resultados <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 pt-6">
              <div className="flex items-center justify-between text-sm font-semibold">
                <span className="flex items-center gap-2"><Users2 className="h-4 w-4" /> Contatos</span>
                <Badge variant="outline">{progress.total} Total</Badge>
              </div>
              <Input
                value={recSearch}
                onChange={(e) => setRecSearch(e.target.value)}
                placeholder="Pesquisar por nome ou telefone"
                className="h-8 text-xs"
              />
              <div className="flex flex-wrap gap-1">
                {([
                  ["all", "Todos"],
                  ["processing", "Processando"],
                  ["accepted", "Aceitos"],
                  ["sent", "Enviados"],
                  ["delivered", "Entregues"],
                  ["read", "Lidos"],
                  ["failed", "Falhas"],
                ] as const).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setRecFilter(k as any)}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px]",
                      recFilter === k
                        ? "border-primary bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
                {filteredRecipients.length === 0 ? (
                  <div className="rounded-md border p-3 text-center text-xs text-muted-foreground">
                    {recipientsLive.length === 0 ? "Carregando destinatários…" : "Nenhum contato para este filtro."}
                  </div>
                ) : (
                  filteredRecipients.map((r) => {
                    const s = (r.status || "").toLowerCase();
                    const isRead = s === "read" || s === "replied";
                    const isDelivered = s === "delivered";
                    const isSent = s === "sent";
                    const isAccepted = s === "accepted";
                    const isProcessing = s === "processing" || s === "pending";
                    const err = s === "failed" || s === "cancelled";
                    const ok = isRead || isDelivered || isSent || isAccepted;
                    const initial = (r.name?.trim()?.[0] || r.phone?.[0] || "?").toUpperCase();
                    const label =
                      isRead ? "Lido"
                      : isDelivered ? "Entregue"
                      : isSent ? "Enviado"
                      : isAccepted ? "Aceito pela Meta"
                      : err ? "Falhou"
                      : s === "processing" ? "Processando"
                      : "Pendente";
                    return (
                      <div key={r.id} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                        <div className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                          ok ? "bg-emerald-500/15 text-emerald-600"
                             : err ? "bg-red-500/15 text-red-600"
                             : "bg-muted text-muted-foreground",
                        )}>{initial}</div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{r.name || "Sem nome"}</div>
                          <div className="truncate text-[11px] text-muted-foreground">{r.phone}</div>
                          <div className={cn(
                            "mt-0.5 text-[11px] font-medium",
                            err ? "text-red-600"
                              : ok ? "text-emerald-600"
                              : "text-muted-foreground",
                          )}>{label}</div>
                          {err && (r.failed_reason || r.error_code) && (
                            <div className="mt-0.5 text-[11px] text-red-600/90">
                              {r.error_code ? `Código ${r.error_code}. ` : ""}{r.failed_reason ?? ""}
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 pt-0.5" title={r.failed_reason ?? label} aria-label={label}>
                          {isRead ? (
                            <span className="inline-flex text-blue-500">
                              <CheckCircle2 className="h-4 w-4" />
                              <CheckCircle2 className="-ml-2 h-4 w-4" />
                            </span>
                          ) : isDelivered ? (
                            <span className="inline-flex text-emerald-500">
                              <CheckCircle2 className="h-4 w-4" />
                              <CheckCircle2 className="-ml-2 h-4 w-4" />
                            </span>
                          ) : isSent || isAccepted ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                          ) : err ? (
                            <XOctagon className="h-5 w-5 text-red-500" />
                          ) : isProcessing && s === "processing" ? (
                            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                          ) : (
                            <Clock className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="grid grid-cols-3 gap-1 pt-1 text-[10px] text-muted-foreground">
                <div>Aceitos: <span className="font-semibold text-foreground">{progress.accepted ?? 0}</span></div>
                <div>Enviados: <span className="font-semibold text-foreground">{progress.sent}</span></div>
                <div>Entregues: <span className="font-semibold text-foreground">{progress.delivered}</span></div>
                <div>Lidos: <span className="font-semibold text-foreground">{progress.read ?? 0}</span></div>
                <div>Falhas: <span className="font-semibold text-foreground">{progress.failed}</span></div>
                <div>Pendentes: <span className="font-semibold text-foreground">{progress.pending}</span></div>
              </div>
              <p className="pt-2 text-[11px] text-muted-foreground">
                Você pode sair desta página. O envio continua em segundo plano.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ============== STEP 5 — RESULTADOS ============== */}
      {step === 5 && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <BarChart3 className="h-5 w-5 text-primary" /> Resultados
              </h2>
              <p className="text-sm text-muted-foreground">Resumo desta campanha.</p>
            </div>

            {progress ? (
              <div className="grid gap-3 sm:grid-cols-4">
                <StatCard label="Total" value={progress.total} />
                <StatCard label="Enviados" value={progress.sent} icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />} />
                <StatCard label="Entregues" value={progress.delivered} />
                <StatCard label="Falhas" value={progress.failed} icon={<XOctagon className="h-4 w-4 text-red-500" />} />
              </div>
            ) : (
              <div className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
                {mode === "schedule" ? "Campanha agendada. Os resultados aparecem após o envio." : "Rascunho salvo."}
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              {onExit && (
                <Button variant="outline" onClick={onExit}>
                  Ver minhas campanhas
                </Button>
              )}
              <Button variant="secondary" onClick={resetForNext}>
                <Plus className="mr-1 h-4 w-4" /> Criar outra campanha
              </Button>
              {onOpenCalendar && (
                <Button variant="outline" onClick={onOpenCalendar}>
                  <CalendarClock className="mr-1 h-4 w-4" /> Abrir agenda
                </Button>
              )}
            </div>

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
    </>
  );
}

// -------- Helpers --------
function NavFooter({
  onNext, onBack, disabled, nextLabel,
}: { onNext: () => void; onBack: (() => void) | null; disabled?: boolean; nextLabel?: string }) {
  return (
    <div className="flex items-center justify-between pt-4">
      {onBack ? (
        <Button variant="outline" onClick={onBack}><ArrowLeft className="mr-1 h-4 w-4" /> Voltar</Button>
      ) : <div />}
      <Button onClick={onNext} disabled={disabled}>
        {nextLabel ?? "Continuar"} <ArrowRight className="ml-1 h-4 w-4" />
      </Button>
    </div>
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

function RateRow({
  icon, title, subtitle, unit, value, min, max, onChange,
}: { icon: React.ReactNode; title: string; subtitle: string; unit: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-3 rounded-md border p-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-[11px] text-muted-foreground">{subtitle}</div>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => onChange(Math.max(min, value - 1))}>-</Button>
        <div className="flex w-16 items-center justify-center gap-1 rounded border px-2 py-1 text-sm">
          <span className="font-semibold">{value}</span>
          <span className="text-[10px] text-muted-foreground">{unit}</span>
        </div>
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => onChange(Math.min(max, value + 1))}>+</Button>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon?: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}{label}
      </div>
      <div className="text-2xl font-bold">{value.toLocaleString("pt-BR")}</div>
    </div>
  );
}

function ConfigBadge({ icon, title, subtitle, value }: { icon: React.ReactNode; title: string; subtitle: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md border p-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-[11px] text-muted-foreground">{subtitle}</div>
      </div>
      <Badge variant="secondary" className="text-sm">{value}</Badge>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Passo 02 — Configurações de Disparo (rate limiter)
// Espelha exatamente os campos consumidos pelo worker novo em wa_campaigns:
// target_per_hour, rate_per_second, max_concurrency,
// scheduled_pause_enabled, pause_every_messages, pause_duration_seconds.
// O intervalo é apenas exibido (calculado em runtime pelo rate limiter):
//   intervalMs = 1000 / rate_per_second
// ─────────────────────────────────────────────────────────────────
function DispatchConfigCard({
  value,
  onChange,
}: {
  value: DispatchConfig;
  onChange: (patch: DispatchConfig | ((prev: DispatchConfig) => DispatchConfig)) => void;
}) {
  const patch = (p: Partial<DispatchConfig>) =>
    onChange((prev) => ({ ...prev, ...p }));

  const setPreset = (preset: DispatchPreset) => {
    if (preset === "custom") {
      onChange((prev) => ({ ...prev, preset }));
      return;
    }
    const p = DISPATCH_PRESETS[preset];
    onChange((prev) => ({
      ...prev,
      preset,
      target_per_hour: p.target_per_hour,
      rate_per_second: p.rate_per_second,
      max_concurrency: p.max_concurrency,
      scheduled_pause_enabled: false,
    }));
  };

  const isCustom = value.preset === "custom";
  const rate = Math.max(1, value.rate_per_second);
  const intervalMsRaw = 1000 / rate;
  const intervalMsLabel = Number.isInteger(intervalMsRaw)
    ? `${intervalMsRaw} ms`
    : `${intervalMsRaw.toFixed(1).replace(".", ",")} ms`;
  const nominalPerHour = rate * 3600;
  const targetExceedsNominal = value.target_per_hour > nominalPerHour;
  const concurrencyLow = value.max_concurrency < value.rate_per_second;
  const isMaxPreset = value.preset === "maximo" || value.rate_per_second >= MAX_RATE_PER_SECOND;

  const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
  const updRate = (v: number) => {
    const r = clamp(Math.round(v), 1, MAX_RATE_PER_SECOND);
    patch({ preset: "custom", rate_per_second: r });
  };
  const updTarget = (v: number) => {
    const t = clamp(Math.round(v), 100, MAX_TARGET_PER_HOUR);
    // recommendedRate = ceil(hourlyTarget / 3600), limitado ao máximo permitido
    const recommendedRate = clamp(Math.ceil(t / 3600), 1, MAX_RATE_PER_SECOND);
    patch({ preset: "custom", target_per_hour: t, rate_per_second: recommendedRate });
  };
  const updConc = (v: number) => {
    const c = clamp(Math.round(v), 1, MAX_CONCURRENCY_UI);
    patch({ preset: "custom", max_concurrency: c });
  };
  const updPauseEvery = (v: number) => patch({ pause_every_messages: clamp(Math.round(v), 1, 1_000_000) });
  const updPauseDur = (v: number) => patch({ pause_duration_seconds: clamp(Math.round(v), 1, 3600) });

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sliders className="h-4 w-4" /> Configurações de Disparo
        </div>
        <div className="text-xs text-muted-foreground">
          Escolha a velocidade e o comportamento da campanha. A velocidade é controlada
          pelo rate limiter global do número, compartilhado entre todos os workers e campanhas.
        </div>
      </div>

      <div>
        <Label className="mb-1 block text-xs">Preset de velocidade</Label>
        <Select value={value.preset} onValueChange={(v) => setPreset(v as DispatchPreset)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="economico">{DISPATCH_PRESETS.economico.label}</SelectItem>
            <SelectItem value="intermediario">{DISPATCH_PRESETS.intermediario.label}</SelectItem>
            <SelectItem value="alto_volume">{DISPATCH_PRESETS.alto_volume.label}</SelectItem>
            <SelectItem value="muito_alto">{DISPATCH_PRESETS.muito_alto.label}</SelectItem>
            <SelectItem value="maximo">{DISPATCH_PRESETS.maximo.label}</SelectItem>
            <SelectItem value="custom">Personalizado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isMaxPreset && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <Zap className="mt-0.5 h-3.5 w-3.5 flex-none" />
          <span>
            <b>Modo de capacidade máxima.</b> Exige infraestrutura, concorrência e throughput
            disponíveis no número.
          </span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <NumberField
          label="Meta de envios por hora"
          hint="Meta operacional da campanha. A capacidade real dependerá da velocidade configurada, do limite global do número e da resposta da API."
          value={value.target_per_hour}
          min={100} max={MAX_TARGET_PER_HOUR} step={1000}
          onChange={updTarget}
        />
        <NumberField
          label="Mensagens por segundo"
          hint="Velocidade máxima total compartilhada por todas as campanhas e workers deste número."
          value={value.rate_per_second}
          min={1} max={MAX_RATE_PER_SECOND} step={1}
          onChange={updRate}
        />
      </div>

      {targetExceedsNominal && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
          <span>A velocidade configurada não é suficiente para atingir a meta de envios por hora.</span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border bg-muted/40 p-3">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            Intervalo calculado
            <span title="O intervalo é a média usada pelo scheduler para distribuir os envios de forma contínua.">
              <Info className="h-3 w-3 opacity-60" />
            </span>
          </div>
          <div className="text-lg font-semibold">{intervalMsLabel}</div>
          <div className="text-[11px] text-muted-foreground">
            Calculado automaticamente: 1000 dividido pelas mensagens por segundo.
            Aplicado pelo scheduler global, e não como <code>sleep</code> após cada envio.
          </div>
        </div>
        <div>
          <NumberField
            label="Concorrência máxima"
            hint="Quantidade máxima de requisições HTTP simultâneas. Não multiplica a velocidade configurada."
            value={value.max_concurrency}
            min={1} max={MAX_CONCURRENCY_UI} step={1}
            onChange={updConc}
          />
          {concurrencyLow && (
            <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
              <span>Uma concorrência muito baixa pode impedir que a campanha alcance a velocidade configurada.</span>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-md border p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Pausa programada</div>
            <div className="text-[11px] text-muted-foreground">
              Pausa curta contabilizada no total da campanha (não por worker). Desativada por padrão.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {value.scheduled_pause_enabled ? "Ativada" : "Desativada"}
            </span>
            <Switch
              checked={value.scheduled_pause_enabled}
              onCheckedChange={(v) => patch({ scheduled_pause_enabled: !!v })}
            />
          </div>
        </div>
        {value.scheduled_pause_enabled && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <NumberField
              label="Pausar a cada (envios)"
              hint="Ex.: 5.000"
              value={value.pause_every_messages}
              min={1} max={1_000_000} step={100}
              onChange={updPauseEvery}
            />
            <NumberField
              label="Duração da pausa (s)"
              hint="Ex.: 60"
              value={value.pause_duration_seconds}
              min={1} max={3600} step={5}
              onChange={updPauseDur}
            />
          </div>
        )}
      </div>

      <div className="rounded-md border bg-muted/30 p-3 text-xs">
        <div className="mb-1 font-semibold">Resumo da configuração</div>
        <ul className="space-y-0.5 text-muted-foreground">
          <li>Meta operacional: <b>{value.target_per_hour.toLocaleString("pt-BR")}</b> mensagens/h {isCustom ? "(personalizado)" : ""}</li>
          <li>Capacidade nominal: <b>{nominalPerHour.toLocaleString("pt-BR")}</b> tentativas/h</li>
          <li>Velocidade: <b>{value.rate_per_second} msg/s</b></li>
          <li>Intervalo médio: <b>{intervalMsLabel}</b></li>
          <li>Concorrência: <b>{value.max_concurrency}</b></li>
          <li>Pausa programada: <b>{value.scheduled_pause_enabled
            ? `${value.pause_duration_seconds}s a cada ${value.pause_every_messages.toLocaleString("pt-BR")} envios`
            : "desativada"}</b></li>
          <li>Rate limiter: <b>global por número</b></li>
          <li>Distribuição: <b>contínua e sem rajadas</b></li>
        </ul>
        <div className="mt-2 text-[11px] text-muted-foreground">
          O rate efetivo é <b>min(campanha, limite global do número)</b>. Múltiplas campanhas
          no mesmo número compartilham o mesmo teto.
        </div>
      </div>
    </div>
  );
}

function NumberField({
  label, hint, value, min, max, step, onChange,
}: {
  label: string; hint?: string; value: number;
  min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <Label className="mb-1 block text-xs">{label}</Label>
      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="icon" className="h-8 w-8"
          onClick={() => onChange(Math.max(min, value - step))}>-</Button>
        <Input
          type="number"
          value={Number.isFinite(value) ? value : min}
          min={min} max={max} step={step}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
          className="h-8 text-center"
        />
        <Button type="button" variant="outline" size="icon" className="h-8 w-8"
          onClick={() => onChange(Math.min(max, value + step))}>+</Button>
      </div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// ResponseFlowCard — configura a auto-resposta quando o contato
// responder à campanha (dentro da janela 24h). Persistido em
// wa_campaigns.response_flow_enabled + response_flow_config (jsonb).
// Aplicado pelo webhook em src/routes/api/public/whatsapp/webhook.tsx.
// ─────────────────────────────────────────────────────────────────
function ResponseFlowCard({
  value,
  onChange,
}: {
  value: ResponseFlowConfig;
  onChange: (v: ResponseFlowConfig) => void;
}) {
  const [tagsInput, setTagsInput] = useState(value.tags.join(", "));
  useEffect(() => {
    setTagsInput(value.tags.join(", "));
  }, [value.tags]);
  const patch = (p: Partial<ResponseFlowConfig>) => onChange({ ...value, ...p });

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <MessageSquareText className="h-4 w-4" />
          Fluxo de resposta
          {value.enabled && <Badge variant="secondary" className="text-[10px]">Ativo</Badge>}
        </div>
        <Switch checked={value.enabled} onCheckedChange={(v) => patch({ enabled: v })} />
      </div>

      {value.enabled ? (
        <div className="space-y-4 p-3">
          <div>
            <Label className="mb-1 block text-xs">Mensagem automática ao responder</Label>
            <Textarea
              rows={3}
              maxLength={1024}
              placeholder="Olá {{nome}}! Recebemos sua mensagem e um atendente responderá em breve."
              value={value.auto_reply_text}
              onChange={(e) => patch({ auto_reply_text: e.target.value })}
            />
            <div className="mt-1 text-[11px] text-muted-foreground">
              Enviada uma vez por conversa (respeitando o cooldown). Deixe em branco para não enviar texto.
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1 block text-xs">Status da conversa</Label>
              <Select
                value={value.assign_status}
                onValueChange={(v) => patch({ assign_status: v as ResponseFlowConfig["assign_status"] })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Manter atual</SelectItem>
                  <SelectItem value="open">Aberto</SelectItem>
                  <SelectItem value="waiting">Aguardando</SelectItem>
                  <SelectItem value="in_progress">Em atendimento</SelectItem>
                  <SelectItem value="resolved">Resolvido</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-1 block text-xs">Cooldown (minutos)</Label>
              <Input
                type="number"
                min={0}
                max={10080}
                value={value.cooldown_minutes}
                onChange={(e) => patch({ cooldown_minutes: Math.max(0, Number(e.target.value) || 0) })}
              />
              <div className="mt-1 text-[11px] text-muted-foreground">
                Tempo mínimo entre auto-respostas na mesma conversa.
              </div>
            </div>
          </div>

          <div>
            <Label className="mb-1 block text-xs">Tags aplicadas à conversa</Label>
            <Input
              placeholder="lead, quente, política"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              onBlur={() => {
                const tags = tagsInput
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean)
                  .slice(0, 10);
                patch({ tags });
              }}
            />
            <div className="mt-1 text-[11px] text-muted-foreground">
              Separadas por vírgula. Adicionadas automaticamente na conversa quando o contato responder.
            </div>
          </div>

          <div className="rounded-md border bg-muted/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold">Botão com link (CTA URL)</div>
              <Switch
                checked={value.cta_enabled}
                onCheckedChange={(v) => patch({ cta_enabled: v })}
              />
            </div>
            {value.cta_enabled ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="mb-1 block text-xs">Texto do botão *</Label>
                    <Input
                      maxLength={20}
                      placeholder="Abrir link"
                      value={value.cta_button_text}
                      onChange={(e) => patch({ cta_button_text: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs">URL de destino *</Label>
                    <Input
                      type="url"
                      placeholder="https://..."
                      value={value.cta_url}
                      onChange={(e) => patch({ cta_url: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="mb-1 block text-xs">Cabeçalho (opcional)</Label>
                    <Input
                      maxLength={60}
                      placeholder="Título curto"
                      value={value.cta_header}
                      onChange={(e) => patch({ cta_header: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs">Rodapé (opcional)</Label>
                    <Input
                      maxLength={60}
                      placeholder="Texto secundário"
                      value={value.cta_footer}
                      onChange={(e) => patch({ cta_footer: e.target.value })}
                    />
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Substitui a mensagem de texto simples por uma mensagem interativa com botão que abre a URL. O texto acima é usado como corpo da mensagem.
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground">
                Ative para responder com uma mensagem interativa contendo um botão que leva a uma URL.
              </div>
            )}
          </div>

          {/* Pré-visualização estilo WhatsApp */}
          <WhatsAppFlowPreview value={value} />

        </div>

      ) : (
        <div className="p-3 text-xs text-muted-foreground">
          Ative para responder automaticamente ao primeiro retorno do contato e marcar a conversa no módulo de Atendimento.
        </div>
      )}
    </div>
  );
}

// Pré-visualização estilo WhatsApp da mensagem do fluxo de resposta
function WhatsAppFlowPreview({ value }: { value: ResponseFlowConfig }) {
  const text = (value.auto_reply_text ?? "").trim();
  const ctaOn = !!(value.cta_enabled && (value.cta_button_text ?? "").trim() && (value.cta_url ?? "").trim());
  const header = (value.cta_header ?? "").trim();
  const footer = (value.cta_footer ?? "").trim();
  const body = text || (ctaOn ? (value.cta_button_text ?? "").trim() : "");
  const btn = (value.cta_button_text ?? "").trim() || "Abrir link";
  let host = "";
  try { host = new URL(value.cta_url).host.replace(/^www\./, ""); } catch {}
  const time = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  if (!body && !ctaOn) {
    return (
      <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
        Preencha a mensagem ou ative o botão CTA para ver a pré-visualização.
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="mb-2 text-xs font-semibold">Pré-visualização no WhatsApp</div>
      <div
        className="rounded-lg p-4"
        style={{
          background: "#0b141a",
          backgroundImage:
            "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.03) 0, transparent 40%), radial-gradient(circle at 80% 60%, rgba(255,255,255,0.03) 0, transparent 40%)",
        }}
      >
        <div className="flex justify-start">
          <div
            className="relative max-w-[85%] overflow-hidden rounded-lg shadow-sm"
            style={{ background: "#202c33", color: "#e9edef" }}
          >
            {header && (
              <div className="px-3 pt-2 text-sm font-semibold" style={{ color: "#e9edef" }}>
                {header}
              </div>
            )}
            {body && (
              <div className="whitespace-pre-wrap break-words px-3 py-2 text-sm leading-snug">
                {body}
              </div>
            )}
            {footer && (
              <div className="px-3 pb-1 text-[11px]" style={{ color: "#8696a0" }}>
                {footer}
              </div>
            )}
            <div className="flex items-center justify-end gap-1 px-3 pb-1 text-[10px]" style={{ color: "#8696a0" }}>
              <span>{time}</span>
              <svg viewBox="0 0 16 15" width="14" height="14" fill="#53bdeb"><path d="M10.91 3.316l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 8.42a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.148.148.393.128.516-.044l6.687-8.505a.363.363 0 0 0-.51-.693zm3.35 0l-.478-.372a.365.365 0 0 0-.51.063L7.94 9.879a.32.32 0 0 1-.484.033l-.15-.144-.53.67 1.4 1.365c.148.148.393.128.516-.044l6.687-8.505a.363.363 0 0 0-.51-.693z"/></svg>
            </div>
            {ctaOn && (
              <a
                href={value.cta_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 border-t px-3 py-2 text-sm font-medium transition-colors"
                style={{ borderColor: "#2a3942", color: "#53bdeb", background: "#202c33" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                {btn}
              </a>
            )}
          </div>
        </div>
        {ctaOn && host && (
          <div className="mt-2 pl-1 text-[10px]" style={{ color: "#8696a0" }}>
            Abre em {host}
          </div>
        )}
      </div>
    </div>
  );
}

