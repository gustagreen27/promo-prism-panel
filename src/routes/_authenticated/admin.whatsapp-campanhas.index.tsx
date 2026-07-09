import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Loader2, Play, X, FileSpreadsheet, RefreshCw, Settings2, Pause, CheckCircle2, CircleDashed, AlertCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { listConnections } from "@/lib/whatsapp.functions";
import { listTemplates, syncTemplates, syncTemplatesByWaba } from "@/lib/whatsapp-templates.functions";
import { sendGenericTemplate, type SendGenericResponse } from "@/lib/wa-send-generic.functions";
import { getMessageLogStatus } from "@/lib/wa-frgc01.functions";
import { renderMapping, buildContext, metaVarsIn } from "@/lib/wa-variables";
import { scheduleQuickSend, unscheduleWaCampaign, listWaCampaigns } from "@/lib/wa-campaigns.functions";


export const Route = createFileRoute("/_authenticated/admin/whatsapp-campanhas/")({
  head: () => ({ meta: [{ title: "Campanhas WhatsApp" }] }),
  component: Page,
});

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-muted text-muted-foreground border-border",
  sending: "bg-amber-500/15 text-amber-700 border-amber-500/40",
  accepted: "bg-blue-500/15 text-blue-700 border-blue-500/40",
  sent: "bg-cyan-500/15 text-cyan-700 border-cyan-500/40",
  delivered: "bg-emerald-500/15 text-emerald-700 border-emerald-500/40",
  read: "bg-violet-500/15 text-violet-700 border-violet-500/40",
  failed: "bg-red-500/15 text-red-700 border-red-500/40",
};

function StatusBadge({ status }: { status?: string | null }) {
  const s = status ?? "pending";
  const cls = STATUS_STYLES[s] ?? STATUS_STYLES.pending;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {s}
    </span>
  );
}

function normalizePhone(v: string): string {
  return v.replace(/\D/g, "");
}

type Recipient = { phone: string; name?: string; extras?: Record<string, string> };

const PHONE_HEADER_RE = /^(phone|telefone|celular|whatsapp|whats|mobile|numero|número|contact|fone)$/i;
const NAME_HEADER_RE = /^(nome|name|contato)$/i;

function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; } else { inQ = false; }
      } else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === delim) { out.push(field); field = ""; }
      else field += c;
    }
  }
  out.push(field);
  return out.map((s) => s.trim());
}

function parseRecipients(raw: string): Recipient[] {
  const clean = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const lines = clean.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const delim = detectDelimiter(lines[0]);
  const firstParts = splitCsvLine(lines[0], delim);
  const hasPhoneHeader = firstParts.some((p) => PHONE_HEADER_RE.test(p));
  const anyNonPhone = firstParts.some((p) => normalizePhone(p).length < 8);

  // CSV mode: header row detected (e.g. "Nome,Telefone,CPF,CIDADE")
  if (hasPhoneHeader && anyNonPhone && lines.length >= 1) {
    const headers = firstParts;
    const phoneIdx = headers.findIndex((h) => PHONE_HEADER_RE.test(h));
    const nameIdx = headers.findIndex((h) => NAME_HEADER_RE.test(h));
    const seen = new Set<string>();
    const out: Recipient[] = [];
    for (let li = 1; li < lines.length; li++) {
      const parts = splitCsvLine(lines[li], delim);
      const n = normalizePhone(parts[phoneIdx] ?? "");
      if (n.length < 8 || seen.has(n)) continue;
      seen.add(n);
      const extras: Record<string, string> = {};
      headers.forEach((h, i) => {
        if (i === phoneIdx) return;
        const v = (parts[i] ?? "").trim();
        if (!v) return;
        extras[h] = v;
        extras[h.toLowerCase()] = v;
      });
      const name = nameIdx >= 0 ? (parts[nameIdx] ?? "").trim() : "";
      out.push({ phone: n, name: name || undefined, extras: Object.keys(extras).length ? extras : undefined });
    }
    return out;
  }

  // Fallback: legacy "Nome,Telefone" or bare-phone-per-line format.
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const line of lines) {
    const parts = line.split(/[,\t;]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) continue;
    const allPhones = parts.every((p) => normalizePhone(p).length >= 8);
    if (parts.length === 1 || allPhones) {
      for (const p of parts) {
        const n = normalizePhone(p);
        if (n.length >= 8 && !seen.has(n)) {
          seen.add(n);
          out.push({ phone: n });
        }
      }
    } else {
      const phoneRaw = parts[parts.length - 1];
      const name = parts.slice(0, -1).join(" ").trim();
      const n = normalizePhone(phoneRaw);
      if (n.length >= 8 && !seen.has(n)) {
        seen.add(n);
        out.push({ phone: n, name: name || undefined });
      }
    }
  }
  return out;
}


function detectDelimiter(sample: string): string {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0, "|": 0 };
  for (const ch of sample) if (ch in counts) counts[ch]++;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ",";
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
  if (!clean) return { headers: [], rows: [] };
  const firstLine = clean.split("\n", 1)[0];
  const delim = detectDelimiter(firstLine);
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQ) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; } else { inQ = false; }
      } else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === delim) { cur.push(field); field = ""; }
      else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
      else field += c;
    }
  }
  cur.push(field);
  rows.push(cur);
  const headers = (rows.shift() ?? []).map((h) => h.trim());
  return { headers, rows };
}

function guessPhoneColumn(headers: string[]): number {
  const re = /(phone|telefone|celular|whats|mobile|numero|número|contact)/i;
  const idx = headers.findIndex((h) => re.test(h));
  return idx >= 0 ? idx : 0;
}

type RowState = {
  phone: string;
  name?: string;
  extras?: Record<string, string>;
  status: "pending" | "sending" | "sent" | "failed";
  logId?: string;
  metaMessageId?: string;
  error?: string;
};


function RecipientRow({ row }: { row: RowState }) {
  const statusFn = useServerFn(getMessageLogStatus);
  const { data: live } = useQuery({
    queryKey: ["message-log-status", row.logId],
    queryFn: () => statusFn({ data: { logId: row.logId! } }),
    enabled: !!row.logId,
    refetchInterval: (q) => {
      const s = (q.state.data as any)?.message_status;
      return s === "read" || s === "failed" ? false : 2500;
    },
  });
  const status = live?.message_status ?? row.status;
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 text-sm">
      <div className="flex items-center gap-2 min-w-0">
        {row.name && <span className="text-sm font-medium truncate">{row.name}</span>}
        <span className="font-mono text-xs text-muted-foreground">{row.phone}</span>
      </div>
      <div className="flex items-center gap-2">
        {row.error && <span className="text-xs text-destructive truncate max-w-[240px]" title={row.error}>{row.error}</span>}
        {live?.failed_reason && !row.error && (
          <span className="text-xs text-destructive truncate max-w-[240px]" title={live.failed_reason}>{live.failed_reason}</span>
        )}
        <StatusBadge status={status} />
      </div>
    </div>
  );
}

function Page() {
  const listFn = useServerFn(listConnections);
  const templatesFn = useServerFn(listTemplates);
  const syncTemplatesFn = useServerFn(syncTemplates);
  const syncTemplatesByWabaFn = useServerFn(syncTemplatesByWaba);
  const sendFn = useServerFn(sendGenericTemplate);

  const [templateId, setTemplateId] = useState<string>("");
  const [connectionIds, setConnectionIds] = useState<string[]>([]);
  const [recipientsRaw, setRecipientsRaw] = useState("");
  const [headerMediaUrl, setHeaderMediaUrl] = useState("");
  const [headerTextParam, setHeaderTextParam] = useState("");
  const [bodyMapping, setBodyMapping] = useState<Record<string, string>>({});
  const [buttonUrlMapping, setButtonUrlMapping] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<RowState[]>([]);
  const [sending, setSending] = useState(false);
  const [paused, setPaused] = useState(false);
  type RunStatus = "idle" | "running" | "paused" | "finished" | "cancelled";
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [runEndedAt, setRunEndedAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Send throttling
  type RateMode = "interval" | "perSecond" | "perMinute";
  const [rateMode, setRateMode] = useState<RateMode>("interval");
  const [intervalSec, setIntervalSec] = useState(10);       // interval between messages
  const [perSecond, setPerSecond] = useState(1);            // messages per second
  const [perMinute, setPerMinute] = useState(6);            // messages per minute
  const [batchEnabled, setBatchEnabled] = useState(false);
  const [batchSize, setBatchSize] = useState(10);           // pause every N sends
  const [batchPauseSec, setBatchPauseSec] = useState(60);   // seconds
  const [scheduledAt, setScheduledAt] = useState<string>(""); // datetime-local string
  const [scheduleName, setScheduleName] = useState<string>("");
  const cancelRef = useRef(false);
  const pausedRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [csvCol, setCsvCol] = useState<string>("0");
  const [csvName, setCsvName] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);

  const { data: connections = [] } = useQuery({
    queryKey: ["whatsapp-connections"],
    queryFn: () => listFn(),
  });
  const { data: templates = [], refetch: refetchTemplates } = useQuery({
    queryKey: ["whatsapp-templates"],
    queryFn: () => templatesFn(),
  });

  const approvedTemplates = useMemo(
    () => (templates as any[]).filter((t) => t.status === "approved"),
    [templates],
  );
  const selectedConnections = useMemo(
    () => (connections as any[]).filter((c) => connectionIds.includes(c.id)),
    [connections, connectionIds],
  );
  const primaryConnection = selectedConnections[0];

  // Auto-pick first connection once connections load
  useEffect(() => {
    if (connectionIds.length > 0 || (connections as any[]).length === 0) return;
    setConnectionIds([(connections as any[])[0].id]);
  }, [connections, connectionIds]);

  // Filter templates to those available on ALL selected WABAs (by name+language).
  // Fall back to primary WABA's templates if intersection is empty.
  // Mostra APENAS templates aprovados das WABAs dos números selecionados.
  // Se múltiplos números, usa interseção por name+language (template precisa existir em todas).
  const filteredTemplates = useMemo(() => {
    if (selectedConnections.length === 0) return [];
    const wabaIds = Array.from(new Set(selectedConnections.map((c: any) => c.waba_ref_id).filter(Boolean)));
    if (wabaIds.length === 0) return [];
    const primaryWaba = primaryConnection?.waba_ref_id;
    const primaryList = approvedTemplates.filter((t: any) => t.waba_ref_id === primaryWaba);
    if (wabaIds.length === 1) return primaryList;
    return primaryList.filter((t: any) =>
      wabaIds.every((w) => approvedTemplates.some((x: any) => x.waba_ref_id === w && x.name === t.name && x.language === t.language)),
    );
  }, [approvedTemplates, selectedConnections, primaryConnection]);

  const selectedTemplate = useMemo(
    () => filteredTemplates.find((t: any) => t.id === templateId),
    [filteredTemplates, templateId],
  );

  // Auto-pick frgc_01 (or first) from filtered templates
  useEffect(() => {
    if (filteredTemplates.length === 0) {
      if (templateId) setTemplateId("");
      return;
    }
    if (templateId && filteredTemplates.some((t: any) => t.id === templateId)) return;
    const preferred = filteredTemplates.find((t: any) => t.name === "frgc_01") ?? filteredTemplates[0];
    setTemplateId(preferred.id);
  }, [filteredTemplates, templateId]);

  // Reset variable mappings when template changes
  useEffect(() => {
    setBodyMapping({});
    setButtonUrlMapping({});
    setHeaderMediaUrl("");
    setHeaderTextParam("");
  }, [templateId]);

  const bodyVars = useMemo(
    () => (selectedTemplate ? metaVarsIn(selectedTemplate.body ?? "") : []),
    [selectedTemplate],
  );
  const rawHeaderComponent = useMemo(
    () => (selectedTemplate?.raw?.components ?? []).find(
      (c: any) => String(c?.type ?? "").toUpperCase() === "HEADER",
    ),
    [selectedTemplate],
  );
  const headerType = (
    String(selectedTemplate?.header_type ?? "").toUpperCase() ||
    String(rawHeaderComponent?.format ?? "").toUpperCase()
  );
  const headerNeedsMedia = headerType === "IMAGE" || headerType === "VIDEO" || headerType === "DOCUMENT";
  const headerTextTemplate = String(
    selectedTemplate?.header_text ?? (rawHeaderComponent?.text ?? ""),
  );
  const headerNeedsText = headerType === "TEXT" && metaVarsIn(headerTextTemplate).length > 0;

  const urlButtons = useMemo(() => {
    const rawButtonsComponent = (selectedTemplate?.raw?.components ?? []).find(
      (c: any) => String(c?.type ?? "").toUpperCase() === "BUTTONS",
    );
    const btns = (rawButtonsComponent?.buttons ?? selectedTemplate?.buttons ?? []) as any[];
    return btns
      .map((b, i) => ({
        i,
        url: String(b?.url ?? ""),
        type: String(b?.type ?? "").toLowerCase(),
        text: b?.text,
        hasExample: Array.isArray(b?.example) ? b.example.length > 0 : !!b?.example,
      }))
      .filter((b) => b.type === "url" && (!b.url || b.hasExample || /\{\{(\d+)\}\}/.test(b.url)));
  }, [selectedTemplate]);

  const recipients = useMemo(() => parseRecipients(recipientsRaw), [recipientsRaw]);
  const previewRecipient = recipients[0];
  const previewCtx = useMemo(
    () => buildContext({ contact: { name: previewRecipient?.name ?? "", phone: previewRecipient?.phone ?? "", metadata: previewRecipient?.extras ?? {} } }),
    [previewRecipient?.name, previewRecipient?.phone, previewRecipient?.extras],
  );

  const previewValue = (mapping: string, fallback: string) => {
    const rendered = renderMapping(mapping ?? "", previewCtx).trim();
    return rendered || fallback;
  };

  const renderedBody = useMemo(() => {
    if (!selectedTemplate) return "";
    let out = String(selectedTemplate.body ?? "");
    for (const n of bodyVars) {
      const val = previewValue(bodyMapping[String(n)] ?? "", `{{${n}}}`);
      out = out.replaceAll(`{{${n}}}`, val);
    }
    return out;
  }, [selectedTemplate, bodyVars, bodyMapping, previewRecipient]);

  async function handleCsvFile(file: File) {
    const name = file.name.toLowerCase();
    if (!/\.(csv|tsv|txt)$/.test(name) && !file.type.includes("csv") && !file.type.includes("text")) {
      toast.error("Envie um arquivo .csv, .tsv ou .txt");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx. 10 MB)");
      return;
    }
    try {
      const text = await file.text();
      const { headers, rows } = parseCSV(text);
      if (rows.length === 0) {
        toast.error("Arquivo vazio ou sem linhas de dados");
        return;
      }
      if (headers.length <= 1) {
        const phones = rows.map((r) => r[0] ?? "").filter(Boolean);
        appendPhones(phones);
        toast.success(`${phones.length} linha(s) importadas`);
        return;
      }
      setCsvHeaders(headers);
      setCsvRows(rows);
      setCsvCol(String(guessPhoneColumn(headers)));
      setCsvName(file.name);
      setCsvOpen(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao ler CSV");
    }
  }

  function appendPhones(raw: string[]) {
    const existing = new Set(parseRecipients(recipientsRaw).map((r) => r.phone));
    const add: string[] = [];
    for (const r of raw) {
      const p = normalizePhone(r);
      if (p.length >= 8 && !existing.has(p)) {
        existing.add(p);
        add.push(p);
      }
    }
    if (add.length === 0) return;
    const prefix = recipientsRaw && !recipientsRaw.endsWith("\n") ? "\n" : "";
    setRecipientsRaw(recipientsRaw + prefix + add.join("\n"));
  }

  function confirmCsvImport() {
    const idx = parseInt(csvCol, 10);
    const values = csvRows.map((r) => r[idx] ?? "").filter(Boolean);
    appendPhones(values);
    setCsvOpen(false);
    toast.success(`${values.length} número(s) processados`);
  }

  async function handleSyncTemplates() {
    if (connectionIds.length === 0 || syncing) return;
    setSyncing(true);
    // Iterate per SELECTED connection, in order: Conta 01, depois Conta 02, ...
    // Dedupe by WABA (mesma WABA = mesmos templates) mantendo a ordem original.
    const seenWabas = new Set<string>();
    const steps: { label: string; conn: any }[] = [];
    selectedConnections.forEach((c: any, i: number) => {
      const key = c.waba_ref_id || c.id;
      if (seenWabas.has(key)) return;
      seenWabas.add(key);
      const nick = c.nome_interno || c.display_name || c.name || c.display_phone || `Número ${i + 1}`;
      steps.push({ label: `Conta ${String(i + 1).padStart(2, "0")} · ${nick}`, conn: c });
    });
    let total = 0, synced = 0;
    try {
      for (let i = 0; i < steps.length; i++) {
        const { label, conn } = steps[i];
        toast.info(`Sincronizando ${label} (${i + 1}/${steps.length})…`);
        try {
          const r = conn.waba_ref_id
            ? await syncTemplatesByWabaFn({ data: { waba_ref_id: conn.waba_ref_id } })
            : await syncTemplatesFn({ data: { connection_id: conn.id } });
          total += r.total; synced += r.synced;
          toast.success(`${label} · ${r.synced}/${r.total}`);
        } catch (e: any) {
          toast.error(`${label} · falha: ${e?.message ?? "erro"}`);
        }
      }
      await refetchTemplates();
      if (steps.length > 1) toast.success(`Concluído · ${synced}/${total} em ${steps.length} conta(s)`);
    } finally {
      setSyncing(false);
    }
  }

  async function handleUpload(file: File) {
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) {
      toast.error("Selecione uma imagem ou vídeo");
      return;
    }
    const maxMb = isVideo ? 16 : 5;
    if (file.size > maxMb * 1024 * 1024) {
      toast.error(`Arquivo muito grande (máx. ${maxMb} MB)`);
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
      const path = `campanhas/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("campaign-images")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: signed, error: sErr } = await supabase.storage
        .from("campaign-images")
        .createSignedUrl(path, 60 * 60 * 24 * 30);
      if (sErr || !signed?.signedUrl) throw sErr ?? new Error("Falha ao gerar URL");
      setHeaderMediaUrl(signed.signedUrl);
      toast.success("Mídia enviada");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha no upload");
    } finally {
      setUploading(false);
    }
  }

  const canSubmit =
    !!templateId &&
    connectionIds.length > 0 &&
    recipients.length > 0 &&
    (!headerNeedsMedia || !!headerMediaUrl) &&
    (!headerNeedsText || !!headerTextParam.trim()) &&
    bodyVars.every((n) => (bodyMapping[String(n)] ?? "").trim().length > 0) &&
    urlButtons.every((b) => (buttonUrlMapping[String(b.i)] ?? "").trim().length > 0);

  async function handleSend(opts?: { resume?: boolean }) {
    const resume = !!opts?.resume;
    if (sending || !selectedTemplate) return;
    if (!resume && !canSubmit) return;
    if (resume && rows.length === 0) return;

    cancelRef.current = false;
    pausedRef.current = false;
    setPaused(false);
    setSending(true);
    setRunStatus("running");
    setRunEndedAt(null);
    if (!resume) setRunStartedAt(Date.now());

    // Base rows: on resume, keep sent/failed and re-queue "sending" as pending.
    const baseRows: RowState[] = resume
      ? rows.map((r) => (r.status === "sending" ? { ...r, status: "pending" } : r))
      : recipients.map((r) => ({ phone: r.phone, name: r.name, status: "pending" as const }));
    setRows(baseRows);

    let okCount = baseRows.filter((r) => r.status === "sent").length;
    let failCount = baseRows.filter((r) => r.status === "failed").length;

    // Build per-WABA template map so we can pick the right template.id per connection.
    const tplByWaba = new Map<string, any>();
    for (const t of approvedTemplates) {
      if (t.name === selectedTemplate.name && t.language === selectedTemplate.language && t.waba_ref_id) {
        tplByWaba.set(t.waba_ref_id, t);
      }
    }

    const sendOne = async (phone: string, name: string | undefined, conn: any) => {
      if (cancelRef.current) return;
      setRows((rs) => rs.map((r) => (r.phone === phone ? { ...r, status: "sending" } : r)));
      try {
        const ctx = buildContext({ contact: { name: name ?? "", phone } });
        const render = (v: string) => renderMapping(v ?? "", ctx);
        const bodyParams: Record<string, string> = {};
        for (const n of bodyVars) bodyParams[String(n)] = render(bodyMapping[String(n)] ?? "");
        const buttonUrlParams: Record<string, string> = {};
        for (const b of urlButtons) buttonUrlParams[String(b.i)] = render(buttonUrlMapping[String(b.i)] ?? "");

        const tplForConn = (conn.waba_ref_id && tplByWaba.get(conn.waba_ref_id)) || selectedTemplate;

        const res: SendGenericResponse = await sendFn({
          data: {
            connectionId: conn.id,
            templateId: tplForConn.id,
            to: phone,
            bodyParams,
            buttonUrlParams,
            headerMediaUrl: headerNeedsMedia ? headerMediaUrl : null,
            headerTextParam: headerNeedsText ? render(headerTextParam) : null,
          },
        });
        if (res.ok) {
          okCount++;
          setRows((rs) => rs.map((r) => (r.phone === phone
            ? { ...r, status: "sent", logId: res.logId, metaMessageId: res.metaMessageId }
            : r)));
        } else {
          failCount++;
          setRows((rs) => rs.map((r) => (r.phone === phone
            ? { ...r, status: "failed", logId: res.logId, error: res.error }
            : r)));
        }
      } catch (e: any) {
        failCount++;
        setRows((rs) => rs.map((r) => (r.phone === phone
          ? { ...r, status: "failed", error: e?.message ?? "Falha ao enviar" }
          : r)));
      }
    };

    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const waitWhilePaused = async () => {
      while (pausedRef.current && !cancelRef.current) {
        await wait(200);
      }
    };
    const conns = selectedConnections;
    // Preserve global index for round-robin fairness across resumes.
    const pending = baseRows
      .map((r, i) => ({ phone: r.phone, name: r.name, status: r.status, _i: i }))
      .filter((r) => r.status === "pending");

    // Batch size = quantos enviar em paralelo por lote. Se desabilitado, envia 1 por vez.
    const chunkSize = batchEnabled && batchSize > 0 ? batchSize : 1;
    for (let k = 0; k < pending.length; k += chunkSize) {
      if (cancelRef.current) break;
      await waitWhilePaused();
      if (cancelRef.current) break;
      const chunk = pending.slice(k, k + chunkSize);
      // Dispara todos do lote em paralelo
      await Promise.all(chunk.map((p) => {
        const conn = conns[p._i % conns.length];
        return sendOne(p.phone, p.name, conn);
      }));
      const isLast = k + chunkSize >= pending.length;
      if (isLast) break;
      // Espera entre lotes: pausa configurada ou intervalo pela taxa
      const delayMs = batchEnabled
        ? Math.max(0, batchPauseSec) * 1000
        : (rateMode === "perSecond" ? (perSecond > 0 ? Math.round(1000 / perSecond) : 0)
          : rateMode === "perMinute" ? (perMinute > 0 ? Math.round(60000 / perMinute) : 0)
          : Math.round(intervalSec * 1000));
      if (delayMs > 0) await wait(delayMs);
    }

    setSending(false);
    setPaused(false);
    pausedRef.current = false;
    setRunEndedAt(Date.now());
    setRunStatus(cancelRef.current ? "cancelled" : "finished");
    toast[failCount === 0 ? "success" : "message"](`Envio concluído · ${okCount} ok · ${failCount} falha(s)`);
  }

  // Tick clock while running so ETA/elapsed refresh
  useEffect(() => {
    if (!sending) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sending]);

  // ---- Persistência do estado de execução (localStorage) ----
  const STORAGE_KEY = "wa-campanhas-run-v1";
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (Array.isArray(s.connectionIds)) setConnectionIds(s.connectionIds);
      if (typeof s.templateId === "string") setTemplateId(s.templateId);
      if (typeof s.recipientsRaw === "string") setRecipientsRaw(s.recipientsRaw);
      if (typeof s.headerMediaUrl === "string") setHeaderMediaUrl(s.headerMediaUrl);
      if (typeof s.headerTextParam === "string") setHeaderTextParam(s.headerTextParam);
      if (s.bodyMapping && typeof s.bodyMapping === "object") setBodyMapping(s.bodyMapping);
      if (s.buttonUrlMapping && typeof s.buttonUrlMapping === "object") setButtonUrlMapping(s.buttonUrlMapping);
      if (s.rateMode) setRateMode(s.rateMode);
      if (typeof s.intervalSec === "number") setIntervalSec(s.intervalSec);
      if (typeof s.perSecond === "number") setPerSecond(s.perSecond);
      if (typeof s.perMinute === "number") setPerMinute(s.perMinute);
      if (typeof s.batchEnabled === "boolean") setBatchEnabled(s.batchEnabled);
      if (typeof s.batchSize === "number") setBatchSize(s.batchSize);
      if (typeof s.batchPauseSec === "number") setBatchPauseSec(s.batchPauseSec);
      if (Array.isArray(s.rows)) {
        setRows(s.rows.map((r: RowState) => (r.status === "sending" ? { ...r, status: "pending" } : r)));
      }
      if (typeof s.runStartedAt === "number") setRunStartedAt(s.runStartedAt);
      if (typeof s.runEndedAt === "number") setRunEndedAt(s.runEndedAt);
      // Execução em andamento no momento do reload → tratar como pausada para permitir retomar.
      if (s.runStatus === "running" || s.runStatus === "paused") {
        setRunStatus("paused");
        setPaused(true);
        pausedRef.current = true;
      } else if (s.runStatus) {
        setRunStatus(s.runStatus);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          connectionIds, templateId, recipientsRaw, headerMediaUrl, headerTextParam,
          bodyMapping, buttonUrlMapping,
          rateMode, intervalSec, perSecond, perMinute, batchEnabled, batchSize, batchPauseSec,
          rows, runStatus, runStartedAt, runEndedAt,
        }),
      );
    } catch {}
  }, [
    connectionIds, templateId, recipientsRaw, headerMediaUrl, headerTextParam,
    bodyMapping, buttonUrlMapping,
    rateMode, intervalSec, perSecond, perMinute, batchEnabled, batchSize, batchPauseSec,
    rows, runStatus, runStartedAt, runEndedAt,
  ]);

  // Aviso ao fechar/recarregar durante execução ativa
  useEffect(() => {
    if (!sending) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [sending]);

  // Agendamentos ativos (backend, sobrevivem a reload)
  const qc = useQueryClient();
  const listCampFn = useServerFn(listWaCampaigns);
  const scheduleFn = useServerFn(scheduleQuickSend);
  const unscheduleFn = useServerFn(unscheduleWaCampaign);
  const scheduledCampsQ = useQuery({
    queryKey: ["wa-campaigns", "scheduled"],
    queryFn: async () => {
      const all = await listCampFn();
      return (all as any[]).filter((c) => c.status === "scheduled").sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)));
    },
    refetchInterval: 15_000,
  });
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const scheduleMut = useMutation({
    mutationFn: () => scheduleFn({
      data: {
        name: scheduleName.trim() || undefined,
        connection_id: connectionIds[0]!,
        template_id: templateId,
        scheduled_at: new Date(scheduledAt).toISOString(),
        recipients: recipients.map((r) => ({ phone: r.phone, name: r.name ?? null })),
        body_mapping: bodyMapping,
        button_url_mapping: buttonUrlMapping,
        header_media_url: headerMediaUrl || null,
        header_text_param: headerTextParam || null,
        send_rate_per_min: rateMode === "perMinute" ? perMinute : rateMode === "perSecond" ? perSecond * 60 : Math.max(1, Math.round(60 / Math.max(1, intervalSec))),
      },
    }),
    onSuccess: (r: any) => {
      toast.success(`Agendado para ${new Date(r.scheduled_at).toLocaleString("pt-BR")} · ${r.total} destinatário(s)`);
      setScheduledAt(""); setScheduleName("");
      qc.invalidateQueries({ queryKey: ["wa-campaigns", "scheduled"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao agendar"),
  });

  const unscheduleMut = useMutation({
    mutationFn: (id: string) => unscheduleFn({ data: { id } }),
    onSuccess: () => {
      toast.message("Agendamento cancelado");
      qc.invalidateQueries({ queryKey: ["wa-campaigns", "scheduled"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao cancelar"),
  });

  const canResume =
    !sending &&
    runStatus === "paused" &&
    rows.length > 0 &&
    rows.some((r) => r.status === "pending" || r.status === "sending") &&
    !!selectedTemplate &&
    connectionIds.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campanhas WhatsApp"
        description="Escolha qualquer template aprovado e dispare em lote via WhatsApp Cloud API."
      />

      <div className="rounded-lg border bg-card p-5 space-y-4 max-w-3xl">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label>Conexões WhatsApp (marque um ou mais números para dividir os disparos)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={connectionIds.length === 0 || syncing}
                onClick={handleSyncTemplates}
                title="Sincronizar templates das WABAs selecionadas"
              >
                {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Sincronizar templates
              </Button>
            </div>
            <div className="rounded-md border divide-y max-h-56 overflow-auto">
              {(connections as any[]).length === 0 && (
                <div className="p-3 text-sm text-muted-foreground">Nenhuma conexão disponível.</div>
              )}
              {(connections as any[]).map((c: any) => {
                const checked = connectionIds.includes(c.id);
                return (
                  <label key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        setConnectionIds((prev) => v ? Array.from(new Set([...prev, c.id])) : prev.filter((x) => x !== c.id));
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{c.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{c.display_phone ?? c.phone ?? ""}</div>
                    </div>
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {connectionIds.length} número(s) selecionado(s). Os disparos serão distribuídos em rodízio (round-robin).
            </p>
          </div>

          <div className="space-y-3 md:col-span-2 rounded-md border bg-muted/20 p-4">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <div className="text-sm font-semibold">Configurações de envio</div>
            </div>

            {/* Rate mode selector */}
            <div className="flex gap-1 rounded-md bg-background p-1 border">
              {([
                { k: "interval", label: "Intervalo (s)" },
                { k: "perSecond", label: "Msg/segundo" },
                { k: "perMinute", label: "Msg/minuto" },
              ] as { k: RateMode; label: string }[]).map((opt) => (
                <button
                  key={opt.k}
                  type="button"
                  onClick={() => setRateMode(opt.k)}
                  className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                    rateMode === opt.k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {rateMode === "interval" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Intervalo entre envios (s)</Label>
                  <span className="text-xs font-medium">{intervalSec} {intervalSec === 1 ? "Segundo" : "Segundos"}</span>
                </div>
                <Slider min={0} max={120} step={1} value={[intervalSec]} onValueChange={(v) => setIntervalSec(v[0] ?? 0)} />
              </div>
            )}

            {rateMode === "perSecond" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Mensagens por segundo</Label>
                  <span className="text-xs font-medium">{perSecond} msg/s</span>
                </div>
                <Slider min={1} max={80} step={1} value={[perSecond]} onValueChange={(v) => setPerSecond(v[0] ?? 1)} />
              </div>
            )}

            {rateMode === "perMinute" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Mensagens por minuto</Label>
                  <span className="text-xs font-medium">{perMinute} msg/min</span>
                </div>
                <Slider min={1} max={600} step={1} value={[perMinute]} onValueChange={(v) => setPerMinute(v[0] ?? 1)} />
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-2">
                  <Checkbox checked={batchEnabled} onCheckedChange={(v) => setBatchEnabled(!!v)} />
                  Pausa (a cada X envios)
                </Label>
                <span className="text-xs font-medium">{batchSize} Contatos</span>
              </div>
              <Slider min={1} max={500} step={1} value={[batchSize]} onValueChange={(v) => { setBatchSize(v[0] ?? 1); if (!batchEnabled) setBatchEnabled(true); }} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Tempo de pausa em (s)</Label>
                <span className="text-xs font-medium">{batchPauseSec} Segundos</span>
              </div>
              <Slider min={0} max={600} step={5} value={[batchPauseSec]} onValueChange={(v) => { setBatchPauseSec(v[0] ?? 0); if (!batchEnabled) setBatchEnabled(true); }} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t">
              {rateMode === "interval" && (
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-muted-foreground">Intervalo (s)</Label>
                  <Input type="number" min={0} step={0.5} value={intervalSec} onChange={(e) => setIntervalSec(Math.max(0, Number(e.target.value) || 0))} />
                </div>
              )}
              {rateMode === "perSecond" && (
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-muted-foreground">Msg/segundo</Label>
                  <Input type="number" min={1} value={perSecond} onChange={(e) => setPerSecond(Math.max(1, Number(e.target.value) || 1))} />
                </div>
              )}
              {rateMode === "perMinute" && (
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-muted-foreground">Msg/minuto</Label>
                  <Input type="number" min={1} value={perMinute} onChange={(e) => setPerMinute(Math.max(1, Number(e.target.value) || 1))} />
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground">Lote</Label>
                <Input type="number" min={1} value={batchSize} onChange={(e) => { setBatchSize(Math.max(1, Number(e.target.value) || 1)); if (!batchEnabled) setBatchEnabled(true); }} />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground">Pausa (s)</Label>
                <Input type="number" min={0} value={batchPauseSec} onChange={(e) => { setBatchPauseSec(Math.max(0, Number(e.target.value) || 0)); if (!batchEnabled) setBatchEnabled(true); }} />
              </div>
            </div>

            {(() => {
              const rate =
                rateMode === "perSecond" ? perSecond
                : rateMode === "perMinute" ? perMinute / 60
                : intervalSec > 0 ? 1 / intervalSec : Infinity;
              const perMin = rate === Infinity ? "máx." : (rate * 60).toFixed(1);
              const totalSec = recipients.length && rate > 0 ? recipients.length / rate : 0;
              const eta = totalSec ? (totalSec >= 60 ? `${(totalSec/60).toFixed(1)} min` : `${totalSec.toFixed(0)} s`) : "—";
              const perConn = connectionIds.length > 0 ? Math.ceil(recipients.length / connectionIds.length) : 0;
              return (
                <p className="text-[11px] text-muted-foreground">
                  Ritmo: ~{perMin} msg/min
                  {batchEnabled && ` · lotes de ${batchSize} em paralelo, pausa ${batchPauseSec}s entre lotes`}
                  {connectionIds.length > 1 && ` · dividido entre ${connectionIds.length} WABAs (~${perConn} por número)`}
                  {recipients.length > 0 && ` · ETA ${eta}`}
                </p>
              );
            })()}
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>Template aprovado</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder={filteredTemplates.length ? "Escolha o template" : "Nenhum template aprovado para este número — clique em Sincronizar"} />
              </SelectTrigger>
              <SelectContent>
                {filteredTemplates.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} <span className="text-muted-foreground">({t.language})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTemplate && (
              <p className="text-xs text-muted-foreground">
                {selectedTemplate.category ?? "—"} · header: {headerType || "nenhum"} · {bodyVars.length} variável(is) no corpo · {urlButtons.length} botão(ões) com URL dinâmica
              </p>
            )}
          </div>

          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label>Destinatários — um por linha. Use <code className="text-[11px]">Nome,Telefone</code> para liberar <code className="text-[11px]">{"{nome}"}</code>.</Label>
              <div className="flex gap-2">
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv,.tsv,.txt,text/csv,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleCsvFile(f);
                    e.target.value = "";
                  }}
                />
                <Button type="button" size="sm" variant="outline" onClick={() => csvInputRef.current?.click()}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" /> Importar CSV
                </Button>
                {recipientsRaw && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setRecipientsRaw("")}>
                    Limpar
                  </Button>
                )}
              </div>
            </div>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) handleCsvFile(f);
              }}
              onPaste={(e) => {
                const f = e.clipboardData.files?.[0];
                if (f) { e.preventDefault(); handleCsvFile(f); }
              }}
              className={`rounded-md border-2 border-dashed transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-transparent"}`}
            >
              <Textarea
                rows={5}
                className="font-mono text-xs"
                value={recipientsRaw}
                onChange={(e) => setRecipientsRaw(e.target.value)}
                placeholder={"Gustavo,5562991301856\nMaria,5511999998888\n5562984817929"}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {recipients.length} destinatário(s) detectados.
            </p>
          </div>

          {headerNeedsMedia && (
            <div className="space-y-2 md:col-span-2">
              <Label>Mídia do cabeçalho ({headerType.toLowerCase()})</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={headerMediaUrl}
                  onChange={(e) => setHeaderMediaUrl(e.target.value)}
                  placeholder="Cole uma URL pública ou envie um arquivo"
                />
                <input
                  ref={fileRef}
                  type="file"
                  accept={headerType === "VIDEO" ? "video/mp4,video/3gpp,video/quicktime" : headerType === "DOCUMENT" ? "application/pdf" : "image/jpeg,image/png,image/webp"}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                    e.target.value = "";
                  }}
                />
                <Button type="button" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                  {uploading ? "Enviando…" : "Upload"}
                </Button>
              </div>
              {headerMediaUrl && (headerType === "VIDEO" ? (
                <video src={headerMediaUrl} controls className="mt-2 max-h-48 rounded-md border bg-muted" />
              ) : headerType === "IMAGE" ? (
                <img src={headerMediaUrl} alt="Preview" className="mt-2 max-h-40 rounded-md border object-contain bg-muted" />
              ) : (
                <a href={headerMediaUrl} target="_blank" rel="noreferrer" className="text-xs underline">Abrir documento</a>
              ))}
            </div>
          )}

          {headerNeedsText && (
            <div className="space-y-2 md:col-span-2">
              <Label>Variável do cabeçalho ({headerTextTemplate})</Label>
              <Input value={headerTextParam} onChange={(e) => setHeaderTextParam(e.target.value)} placeholder="{nome|Cliente}" />
            </div>
          )}

          {selectedTemplate && bodyVars.length === 0 && !headerNeedsText && (
            <div className="space-y-2 md:col-span-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              Este template não tem variáveis — nada a preencher.
            </div>
          )}

          {selectedTemplate && (
            <div className="space-y-2 md:col-span-2 rounded-md border bg-muted/30 p-3">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Corpo — prévia renderizada</div>
              <div className="text-sm whitespace-pre-line leading-relaxed">
                {renderedBody || selectedTemplate.body}
              </div>
            </div>
          )}

          {bodyVars.map((n) => (
            <div key={n} className="space-y-2 md:col-span-2">
              <Label>{`{{${n}}} Valor da variável`}</Label>
              <Input
                value={bodyMapping[String(n)] ?? ""}
                onChange={(e) => setBodyMapping((m) => ({ ...m, [String(n)]: e.target.value }))}
                placeholder='Ex.: {nome|"Cliente"} — pode misturar texto e tokens'
              />
            </div>
          ))}

          {urlButtons.map((b) => (
            <div key={b.i} className="space-y-2 md:col-span-2">
              <Label>
                Botão "{b.text ?? `#${b.i + 1}`}" — variável da URL
                {b.url && <code className="ml-1 text-[11px]">{b.url}</code>}
              </Label>
              <Input
                value={buttonUrlMapping[String(b.i)] ?? ""}
                onChange={(e) => setButtonUrlMapping((m) => ({ ...m, [String(b.i)]: e.target.value }))}
                placeholder='Ex.: {telefone} ou codigo-{nome|cliente}'
              />
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button disabled={!canSubmit || sending} onClick={() => handleSend()}>
            {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            {sending
              ? `Enviando… (${rows.filter((r) => r.status === "sent" || r.status === "failed").length}/${rows.length})`
              : `Disparar para ${recipients.length} destinatário(s)`}
          </Button>
          {canResume && (
            <Button variant="default" onClick={() => handleSend({ resume: true })}>
              <Play className="h-4 w-4 mr-2" />
              Retomar disparo ({rows.filter((r) => r.status === "pending" || r.status === "sending").length} pendentes)
            </Button>
          )}
          {sending && !paused && (
            <Button variant="outline" onClick={() => { pausedRef.current = true; setPaused(true); setRunStatus("paused"); }}>
              <Pause className="h-4 w-4 mr-2" /> Pausar
            </Button>
          )}
          {sending && paused && (
            <Button variant="outline" onClick={() => { pausedRef.current = false; setPaused(false); setRunStatus("running"); }}>
              <Play className="h-4 w-4 mr-2" /> Retomar
            </Button>
          )}
          {sending && (
            <Button variant="outline" onClick={() => { cancelRef.current = true; pausedRef.current = false; setPaused(false); }}>
              <X className="h-4 w-4 mr-2" /> Cancelar
            </Button>
          )}
          {rows.length > 0 && !sending && (
            <Button variant="ghost" onClick={() => {
              setRows([]); setRunStatus("idle"); setRunStartedAt(null); setRunEndedAt(null);
              try { localStorage.removeItem("wa-campanhas-run-v1"); } catch {}
            }}>Limpar resultados</Button>
          )}
        </div>

        {/* Agendamento (backend) */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div>
            <div className="text-sm font-semibold">Agendar envio</div>
            <div className="text-xs text-muted-foreground">
              O agendamento é salvo no servidor. Você pode fechar a aba, atualizar a página ou programar outros disparos —
              o worker inicia automaticamente no horário.
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <Label className="text-xs">Nome (opcional)</Label>
              <Input
                value={scheduleName}
                onChange={(e) => setScheduleName(e.target.value)}
                placeholder="Ex.: Ativação outubro"
                disabled={sending}
              />
            </div>
            <div>
              <Label className="text-xs">Data e hora</Label>
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                disabled={sending}
              />
            </div>
            <Button
              variant="outline"
              disabled={!canSubmit || sending || !scheduledAt || scheduleMut.isPending}
              onClick={() => scheduleMut.mutate()}
            >
              {scheduleMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Agendar {recipients.length ? `(${recipients.length})` : ""}
            </Button>
          </div>

          {/* Lista de agendamentos ativos */}
          {(scheduledCampsQ.data?.length ?? 0) > 0 && (
            <div className="border-t pt-3 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agendamentos ativos</div>
              <div className="space-y-1.5">
                {scheduledCampsQ.data!.map((c: any) => {
                  const when = new Date(c.scheduled_at).getTime();
                  const remain = Math.max(0, when - nowTick);
                  const s = Math.floor(remain / 1000);
                  const hh = Math.floor(s / 3600);
                  const mm = Math.floor((s % 3600) / 60);
                  const ss = s % 60;
                  const label = remain <= 0
                    ? "iniciando…"
                    : hh > 0 ? `${hh}h ${mm}m ${ss}s` : mm > 0 ? `${mm}m ${ss}s` : `${ss}s`;
                  return (
                    <div key={c.id} className="flex items-center justify-between gap-2 rounded-md border bg-background/40 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{c.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(c.scheduled_at).toLocaleString("pt-BR")} · {c.total_recipients} destinatário(s) · faltam {label}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => unscheduleMut.mutate(c.id)}
                        disabled={unscheduleMut.isPending}
                      >
                        <X className="h-4 w-4 mr-1" /> Cancelar
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {rows.length > 0 && (() => {
          const done = rows.filter((r) => r.status === "sent" || r.status === "failed").length;
          const okN = rows.filter((r) => r.status === "sent").length;
          const failN = rows.filter((r) => r.status === "failed").length;
          const sendingN = rows.filter((r) => r.status === "sending").length;
          const total = rows.length;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          const elapsedMs = runStartedAt ? (runEndedAt ?? nowTick) - runStartedAt : 0;
          const rate = elapsedMs > 0 ? done / (elapsedMs / 1000) : 0;
          const remaining = total - done;
          const etaSec = rate > 0 && remaining > 0 && runStatus === "running" ? remaining / rate : 0;
          const fmt = (s: number) => {
            if (!s || !isFinite(s)) return "—";
            if (s < 60) return `${Math.round(s)}s`;
            if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
            return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
          };
          const statusMeta: Record<RunStatus, { label: string; cls: string; icon: any }> = {
            idle:      { label: "Aguardando",  cls: "bg-muted text-muted-foreground border-border",           icon: CircleDashed },
            running:   { label: "Em andamento", cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/40", icon: Loader2 },
            paused:    { label: "Pausado",      cls: "bg-amber-500/15 text-amber-700 border-amber-500/40",     icon: Pause },
            finished:  { label: "Finalizado",   cls: "bg-blue-500/15 text-blue-700 border-blue-500/40",         icon: CheckCircle2 },
            cancelled: { label: "Cancelado",    cls: "bg-red-500/15 text-red-700 border-red-500/40",           icon: AlertCircle },
          };
          const meta = statusMeta[runStatus];
          const Icon = meta.icon;
          return (
            <div className="space-y-3 pt-2">
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.cls}`}>
                      <Icon className={`h-3.5 w-3.5 ${runStatus === "running" ? "animate-spin" : ""}`} />
                      {meta.label}
                    </span>
                    <span className="text-sm font-medium">{done}/{total}</span>
                    <span className="text-xs text-muted-foreground">({pct}%)</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Ritmo: {rate > 0 ? `${(rate * 60).toFixed(1)} msg/min` : "—"}</span>
                    <span>Decorrido: {fmt(elapsedMs / 1000)}</span>
                    {runStatus === "running" && <span>ETA: {fmt(etaSec)}</span>}
                  </div>
                </div>

                <Progress value={pct} className="h-2" />

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                  <div className="rounded-md border bg-background px-2 py-1.5">
                    <div className="text-[10px] uppercase text-muted-foreground">Total</div>
                    <div className="text-sm font-semibold">{total}</div>
                  </div>
                  <div className="rounded-md border bg-background px-2 py-1.5">
                    <div className="text-[10px] uppercase text-muted-foreground">Enviando</div>
                    <div className="text-sm font-semibold text-amber-600">{sendingN}</div>
                  </div>
                  <div className="rounded-md border bg-background px-2 py-1.5">
                    <div className="text-[10px] uppercase text-muted-foreground">Enviadas</div>
                    <div className="text-sm font-semibold text-emerald-600">{okN}</div>
                  </div>
                  <div className="rounded-md border bg-background px-2 py-1.5">
                    <div className="text-[10px] uppercase text-muted-foreground">Falharam</div>
                    <div className="text-sm font-semibold text-red-600">{failN}</div>
                  </div>
                  <div className="rounded-md border bg-background px-2 py-1.5">
                    <div className="text-[10px] uppercase text-muted-foreground">Pendentes</div>
                    <div className="text-sm font-semibold">{total - done - sendingN}</div>
                  </div>
                </div>
              </div>

              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Status por destinatário
              </div>
              <div className="space-y-1.5 max-h-96 overflow-auto">
                {rows.map((r) => <RecipientRow key={r.phone} row={r} />)}
              </div>
            </div>
          );
        })()}
      </div>

      <Dialog open={csvOpen} onOpenChange={setCsvOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importar CSV</DialogTitle>
            <DialogDescription>
              {csvName} · {csvRows.length} linha(s). Escolha a coluna com o telefone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Coluna do telefone</Label>
              <Select value={csvCol} onValueChange={setCsvCol}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {csvHeaders.map((h, i) => (
                    <SelectItem key={i} value={String(i)}>{h || `Coluna ${i + 1}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-md border max-h-64 overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    {csvHeaders.map((h, i) => (
                      <th key={i} className={`px-2 py-1.5 text-left font-medium ${String(i) === csvCol ? "bg-primary/10 text-primary" : ""}`}>
                        {h || `Col ${i + 1}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvRows.slice(0, 8).map((r, ri) => (
                    <tr key={ri} className="border-t">
                      {csvHeaders.map((_, ci) => (
                        <td key={ci} className={`px-2 py-1 font-mono ${String(ci) === csvCol ? "bg-primary/5 text-primary font-semibold" : ""}`}>
                          {r[ci] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {csvRows.length > 8 && (
                <div className="px-2 py-1 text-xs text-muted-foreground border-t">
                  + {csvRows.length - 8} linha(s)…
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCsvOpen(false)}>Cancelar</Button>
            <Button onClick={confirmCsvImport}>Importar {csvRows.length} número(s)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
