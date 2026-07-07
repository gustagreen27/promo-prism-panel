import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Loader2, Play, X, FileSpreadsheet } from "lucide-react";
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
import { listTemplates } from "@/lib/whatsapp-templates.functions";
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
  const sendFn = useServerFn(sendGenericTemplate);

  const [templateId, setTemplateId] = useState<string>("");
  const [connectionId, setConnectionId] = useState<string>("");
  const [recipientsRaw, setRecipientsRaw] = useState("");
  const [headerMediaUrl, setHeaderMediaUrl] = useState("");
  const [headerTextParam, setHeaderTextParam] = useState("");
  const [bodyMapping, setBodyMapping] = useState<Record<string, string>>({});
  const [buttonUrlMapping, setButtonUrlMapping] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<RowState[]>([]);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
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
  const { data: templates = [] } = useQuery({
    queryKey: ["whatsapp-templates"],
    queryFn: () => templatesFn(),
  });

  const approvedTemplates = useMemo(
    () => (templates as any[]).filter((t) => t.status === "approved"),
    [templates],
  );
  const selectedTemplate = useMemo(
    () => approvedTemplates.find((t) => t.id === templateId),
    [approvedTemplates, templateId],
  );

  // Auto-pick frgc_01 (or first) once templates load
  useEffect(() => {
    if (templateId || approvedTemplates.length === 0) return;
    const preferred = approvedTemplates.find((t) => t.name === "frgc_01") ?? approvedTemplates[0];
    setTemplateId(preferred.id);
  }, [approvedTemplates, templateId]);

  // Filter connections to those matching the template's WABA when possible
  const filteredConnections = useMemo(() => {
    if (!selectedTemplate?.waba_ref_id) return connections;
    const same = (connections as any[]).filter((c) => c.waba_ref_id === selectedTemplate.waba_ref_id);
    return same.length ? same : connections;
  }, [connections, selectedTemplate]);

  useEffect(() => {
    if (!connectionId && filteredConnections.length) setConnectionId(filteredConnections[0].id);
  }, [filteredConnections, connectionId]);

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
  const headerType = String(selectedTemplate?.header_type ?? "").toUpperCase();
  const headerNeedsMedia = headerType === "IMAGE" || headerType === "VIDEO" || headerType === "DOCUMENT";
  const headerNeedsText = headerType === "TEXT" && metaVarsIn(String(selectedTemplate?.header_text ?? "")).length > 0;

  const urlButtons = useMemo(() => {
    const btns = (selectedTemplate?.buttons ?? []) as any[];
    return btns
      .map((b, i) => ({ i, url: String(b?.url ?? ""), type: String(b?.type ?? "").toLowerCase(), text: b?.text }))
      .filter((b) => b.type === "url" && /\{\{(\d+)\}\}/.test(b.url));
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
    !!connectionId &&
    recipients.length > 0 &&
    (!headerNeedsMedia || !!headerMediaUrl) &&
    (!headerNeedsText || !!headerTextParam.trim()) &&
    bodyVars.every((n) => (bodyMapping[String(n)] ?? "").trim().length > 0) &&
    urlButtons.every((b) => (buttonUrlMapping[String(b.i)] ?? "").trim().length > 0);

  async function handleSend() {
    if (!canSubmit || sending) return;
    cancelRef.current = false;
    setSending(true);
    const initial: RowState[] = recipients.map((r) => ({ phone: r.phone, name: r.name, status: "pending" }));
    setRows(initial);
    let okCount = 0;
    let failCount = 0;
    const RATE_PER_SECOND = 40;

    const sendOne = async (idx: number) => {
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

        const res: SendGenericResponse = await sendFn({
          data: {
            connectionId,
            templateId,
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

    const pending: Promise<void>[] = [];
    for (let i = 0; i < recipients.length; i += RATE_PER_SECOND) {
      if (cancelRef.current) break;
      const windowStart = Date.now();
      const slice = Array.from(
        { length: Math.min(RATE_PER_SECOND, recipients.length - i) },
        (_, k) => i + k,
      );
      for (const idx of slice) pending.push(sendOne(idx));
      if (i + RATE_PER_SECOND < recipients.length) {
        const elapsed = Date.now() - windowStart;
        const wait = Math.max(0, 1000 - elapsed);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      }
    }
    await Promise.all(pending);

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
            <Label>Template aprovado</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder={approvedTemplates.length ? "Escolha o template" : "Nenhum template aprovado — cadastre em Templates"} />
              </SelectTrigger>
              <SelectContent>
                {approvedTemplates.map((t: any) => (
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
            <Label>Conexão WhatsApp</Label>
            <Select value={connectionId} onValueChange={setConnectionId}>
              <SelectTrigger><SelectValue placeholder="Escolha o número" /></SelectTrigger>
              <SelectContent>
                {filteredConnections.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} {c.display_phone ? `(${c.display_phone})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              <Label>Variável do cabeçalho ({selectedTemplate?.header_text})</Label>
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
              <Label>Botão "{b.text ?? `#${b.i + 1}`}" — parâmetro da URL <code className="text-[11px]">{b.url}</code></Label>
              <Input
                value={buttonUrlMapping[String(b.i)] ?? ""}
                onChange={(e) => setButtonUrlMapping((m) => ({ ...m, [String(b.i)]: e.target.value }))}
                placeholder="confirmar/abc123"
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
