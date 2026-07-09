import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Loader2, Play, X, FileSpreadsheet, RefreshCw, Settings2 } from "lucide-react";
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

type Recipient = { phone: string; name?: string };

function parseRecipients(raw: string): Recipient[] {
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const line of raw.split(/[\n;]+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/[,\t]/).map((s) => s.trim()).filter(Boolean);
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
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Send throttling
  const [intervalSec, setIntervalSec] = useState(10);       // seconds between messages
  const [batchEnabled, setBatchEnabled] = useState(false);
  const [batchSize, setBatchSize] = useState(10);            // pause every N sends
  const [batchPauseSec, setBatchPauseSec] = useState(60);   // seconds
  const cancelRef = useRef(false);
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
  const filteredTemplates = useMemo(() => {
    if (selectedConnections.length === 0) return approvedTemplates;
    const wabaIds = Array.from(new Set(selectedConnections.map((c: any) => c.waba_ref_id).filter(Boolean)));
    if (wabaIds.length === 0) return approvedTemplates;
    // Group by name+language
    const primaryWaba = primaryConnection?.waba_ref_id;
    const primaryList = approvedTemplates.filter((t: any) => t.waba_ref_id === primaryWaba);
    if (wabaIds.length === 1) return primaryList.length ? primaryList : approvedTemplates;
    const intersection = primaryList.filter((t: any) =>
      wabaIds.every((w) => approvedTemplates.some((x: any) => x.waba_ref_id === w && x.name === t.name && x.language === t.language)),
    );
    return intersection.length ? intersection : primaryList;
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
    () => buildContext({ contact: { name: previewRecipient?.name ?? "", phone: previewRecipient?.phone ?? "" } }),
    [previewRecipient?.name, previewRecipient?.phone],
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
    try {
      const wabaIds = Array.from(new Set(selectedConnections.map((c: any) => c.waba_ref_id).filter(Boolean)));
      let total = 0, synced = 0;
      if (wabaIds.length > 0) {
        for (const w of wabaIds) {
          const r = await syncTemplatesByWabaFn({ data: { waba_ref_id: w as string } });
          total += r.total; synced += r.synced;
        }
      } else {
        for (const cid of connectionIds) {
          const r = await syncTemplatesFn({ data: { connection_id: cid } });
          total += r.total; synced += r.synced;
        }
      }
      await refetchTemplates();
      toast.success(`Templates sincronizados · ${synced}/${total}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao sincronizar templates");
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

  async function handleSend() {
    if (!canSubmit || sending || !selectedTemplate) return;
    cancelRef.current = false;
    setSending(true);
    const initial: RowState[] = recipients.map((r) => ({ phone: r.phone, name: r.name, status: "pending" }));
    setRows(initial);
    let okCount = 0;
    let failCount = 0;

    // Build per-WABA template map so we can pick the right template.id per connection.
    const tplByWaba = new Map<string, any>();
    for (const t of approvedTemplates) {
      if (t.name === selectedTemplate.name && t.language === selectedTemplate.language && t.waba_ref_id) {
        tplByWaba.set(t.waba_ref_id, t);
      }
    }

    const sendOne = async (idx: number, conn: any) => {
      if (cancelRef.current) return;
      const { phone, name } = recipients[idx];
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
    const conns = selectedConnections;

    for (let i = 0; i < recipients.length; i++) {
      if (cancelRef.current) break;
      const conn = conns[i % conns.length];
      await sendOne(i, conn);
      const isLast = i === recipients.length - 1;
      if (isLast) break;
      // Batch pause
      if (batchEnabled && batchSize > 0 && (i + 1) % batchSize === 0) {
        await wait(Math.max(0, batchPauseSec) * 1000);
      } else if (intervalSec > 0) {
        await wait(intervalSec * 1000);
      }
    }

    setSending(false);
    toast[failCount === 0 ? "success" : "message"](`Envio concluído · ${okCount} ok · ${failCount} falha(s)`);
  }

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

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Intervalo entre envios (s)</Label>
                <span className="text-xs font-medium">{intervalSec} {intervalSec === 1 ? "Segundo" : "Segundos"}</span>
              </div>
              <Slider min={0} max={120} step={1} value={[intervalSec]} onValueChange={(v) => setIntervalSec(v[0] ?? 0)} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-2">
                  <Checkbox checked={batchEnabled} onCheckedChange={(v) => setBatchEnabled(!!v)} />
                  Pausa (a cada X envios)
                </Label>
                <span className="text-xs font-medium">{batchSize} Contatos</span>
              </div>
              <Slider min={1} max={500} step={1} value={[batchSize]} disabled={!batchEnabled} onValueChange={(v) => setBatchSize(v[0] ?? 1)} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Tempo de pausa em (s)</Label>
                <span className="text-xs font-medium">{batchPauseSec} Segundos</span>
              </div>
              <Slider min={0} max={600} step={5} value={[batchPauseSec]} disabled={!batchEnabled} onValueChange={(v) => setBatchPauseSec(v[0] ?? 0)} />
            </div>

            <div className="grid grid-cols-3 gap-3 pt-2 border-t">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground">Intervalo (s)</Label>
                <Input type="number" min={0} step={0.5} value={intervalSec} onChange={(e) => setIntervalSec(Math.max(0, Number(e.target.value) || 0))} />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground">Lote</Label>
                <Input type="number" min={1} value={batchSize} disabled={!batchEnabled} onChange={(e) => setBatchSize(Math.max(1, Number(e.target.value) || 1))} />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground">Pausa (s)</Label>
                <Input type="number" min={0} value={batchPauseSec} disabled={!batchEnabled} onChange={(e) => setBatchPauseSec(Math.max(0, Number(e.target.value) || 0))} />
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Ritmo estimado: {intervalSec > 0 ? `~${(60 / Math.max(intervalSec, 0.5)).toFixed(1)} msg/min` : "sem intervalo (o mais rápido possível)"}
              {batchEnabled && ` · pausa de ${batchPauseSec}s a cada ${batchSize} envios`}
              {connectionIds.length > 1 && ` · dividido entre ${connectionIds.length} número(s)`}
            </p>
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
          <Button disabled={!canSubmit || sending} onClick={handleSend}>
            {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            {sending
              ? `Enviando… (${rows.filter((r) => r.status === "sent" || r.status === "failed").length}/${rows.length})`
              : `Disparar para ${recipients.length} destinatário(s)`}
          </Button>
          {sending && (
            <Button variant="outline" onClick={() => { cancelRef.current = true; }}>
              <X className="h-4 w-4 mr-2" /> Cancelar
            </Button>
          )}
          {rows.length > 0 && !sending && (
            <Button variant="ghost" onClick={() => setRows([])}>Limpar resultados</Button>
          )}
        </div>

        {rows.length > 0 && (
          <div className="space-y-2 pt-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Status por destinatário
            </div>
            <div className="space-y-1.5">
              {rows.map((r) => <RecipientRow key={r.phone} row={r} />)}
            </div>
          </div>
        )}
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
