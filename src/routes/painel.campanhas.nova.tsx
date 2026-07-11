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
} from "lucide-react";
import { Stepper, type WizardStep } from "@/components/campaigns/wizard/Stepper";
import { WhatsAppPreview } from "@/components/campaigns/wizard/WhatsAppPreview";
import { ContactsStep, type ContactSelValue } from "@/components/campaigns/wizard/ContactsStep";
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
  const [rate, setRate] = useState({ interval_s: 10, pause_every: 10, pause_duration_s: 60 });
  const [mode, setMode] = useState<Mode>(scheduled_for ? "schedule" : "now");
  const [scheduledAt, setScheduledAt] = useState<string>(toLocal(scheduled_for));
  const [timezone, setTimezone] = useState<string>(Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo");
  const [forceConflict, setForceConflict] = useState(false);
  const [bodyVars, setBodyVars] = useState<Record<string, string>>({});
  const [btnVars, setBtnVars] = useState<Record<string, string>>({});
  const [headerMediaUrl, setHeaderMediaUrl] = useState<string>("");
  const [headerMediaMeta, setHeaderMediaMeta] = useState<{ name?: string; size?: number; contentType?: string } | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);

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
  useEffect(() => {
    if (campaignId) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          name, connectionId, templateId, contactSel, rate, mode, scheduledAt, timezone, step, maxReached,
          savedAt: Date.now(),
        }));
      } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(t);
  }, [name, connectionId, templateId, contactSel, rate, mode, scheduledAt, timezone, step, maxReached, campaignId, DRAFT_KEY]);

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
        .select("id, phone, status, failed_reason, error_code, contact:contacts(name)")
        .eq("campaign_id", campaignId!)
        .order("created_at", { ascending: true })
        .limit(1000);
      if (!alive) return;
      setRecipientsLive(
        (rs ?? []).map((r: any) => ({
          id: r.id,
          name: r.contact?.name ?? null,
          phone: r.phone,
          status: r.status,
          failed_reason: r.failed_reason,
          error_code: r.error_code,
        })),
      );
    }
    loadCamp();
    loadRecipients();
    // Polling fallback
    const pollId = setInterval(() => { loadCamp(); loadRecipients(); }, 5000);
    // Realtime — atualiza sem esperar o polling
    const chan = supabase
      .channel(`camp-live-${campaignId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "campaign_recipients", filter: `campaign_id=eq.${campaignId}` },
        () => { loadRecipients(); loadCamp(); },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "campaign_recipients", filter: `campaign_id=eq.${campaignId}` },
        () => { loadRecipients(); },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "wa_campaigns", filter: `id=eq.${campaignId}` },
        () => { loadCamp(); },
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
  const ddiMismatch = !!selectedAudienceCode && !!senderCode && selectedAudienceCode !== senderCode;
  const estimatedDurationMin = useMemo(() => {
    if (!validContacts || !rate.interval_s) return 0;
    return Math.ceil((validContacts * rate.interval_s) / 60);
  }, [validContacts, rate.interval_s]);
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
    if (rate.interval_s <= 0) items.push("Defina um intervalo válido entre envios");
    return items;
  }, [connectionId, templateId, tplRequiresMedia, headerMediaUrl, tplHeaderType, tplBodyVarNums, bodyVars, tplUrlVarNums, btnVars, rate.interval_s]);

  // -------- Navigation --------
  const canAdvance = useCallback((from: number): boolean => {
    if (from === 1) return !!contactSel?.list_id;
    if (from === 2) {
      if (!connectionId || !templateId || rate.interval_s <= 0) return false;
      if (tplRequiresMedia && !headerMediaUrl.trim()) return false;
      for (const n of tplBodyVarNums) if (!(bodyVars[String(n)] ?? "").trim()) return false;
      for (const n of tplUrlVarNums) if (!(btnVars[String(n)] ?? "").trim()) return false;
      return true;
    }
    if (from === 3) return !!name.trim();
    return true;
  }, [contactSel, connectionId, templateId, rate, name, tplRequiresMedia, headerMediaUrl, tplBodyVarNums, bodyVars, tplUrlVarNums, btnVars]);

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
    if (ddiMismatch) {
      toast.error(`DDI incompatível: lista ${formatCallingCode(selectedAudienceCode)} e WhatsApp ${formatCallingCode(senderCode)}.`);
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
        },
      });
      if (event_id) {
        try { await fnLink({ data: { event_id, campaign_id: campaign.id } }); } catch { /* non-fatal */ }
      }
      const sendRatePerMin = Math.max(1, Math.round(60 / Math.max(1, rate.interval_s)));
      // Save rate/timezone config, but keep status as "draft" until start/schedule is confirmed.
      await supabase.from("wa_campaigns").update({
        timezone,
        send_rate_per_min: sendRatePerMin,
        batch_size: rate.pause_every,
        jitter_ms: rate.pause_duration_s * 1000,
      }).eq("id", campaign.id);

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
                          {(n.phone_display ?? n.phone_masked)} — {n.display_name}
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
                    {ddiMismatch && (
                      <div className="mt-2 rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-200">
                        A lista selecionada é {formatCallingCode(selectedAudienceCode)}, mas este WhatsApp é {formatCallingCode(senderCode)}. Troque o número de envio antes de continuar.
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



                {/* Config */}
                <div className="rounded-lg border p-4">
                  <div className="mb-3">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Sliders className="h-4 w-4" /> Configurações de Disparo
                    </div>
                    <div className="text-xs text-muted-foreground">Ajuste os intervalos e pausas para garantir a segurança dos envios.</div>
                  </div>
                  <div className="space-y-2">
                    <RateRow icon={<Timer className="h-4 w-4" />}
                      title="Intervalo (s)"
                      subtitle="Tempo de espera entre cada disparo"
                      unit="s"
                      value={rate.interval_s}
                      min={1} max={600}
                      onChange={(v) => setRate((r) => ({ ...r, interval_s: v }))}
                    />
                    <RateRow icon={<Users2 className="h-4 w-4" />}
                      title="Pausa (a cada X envios)"
                      subtitle="Gatilho para iniciar uma pausa longa"
                      unit="ctts"
                      value={rate.pause_every}
                      min={1} max={500}
                      onChange={(v) => setRate((r) => ({ ...r, pause_every: v }))}
                    />
                    <RateRow icon={<Clock className="h-4 w-4" />}
                      title="Tempo de pausa em (s)"
                      subtitle="Duração do descanso do sistema"
                      unit="s"
                      value={rate.pause_duration_s}
                      min={0} max={3600}
                      onChange={(v) => setRate((r) => ({ ...r, pause_duration_s: v }))}
                    />
                  </div>
                </div>
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
                    <ReviewRow label="Intervalo" value={`${rate.interval_s}s entre envios`} />
                    <ReviewRow label="Pausa automática" value={`${rate.pause_duration_s}s a cada ${rate.pause_every} envios`} />
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
                  <ConfigBadge icon={<Timer className="h-4 w-4" />} title="Intervalo entre contatos" subtitle="Tempo de espera configurado" value={`${rate.interval_s}s`} />
                  <ConfigBadge icon={<Clock className="h-4 w-4" />} title="Pausa Automática" subtitle={`Pausa a cada ${rate.pause_every} envios`} value={`${rate.pause_duration_s}s`} />
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
