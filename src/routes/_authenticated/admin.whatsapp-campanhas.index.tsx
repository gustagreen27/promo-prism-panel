import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Send, Upload, Loader2, Play, X, FileSpreadsheet } from "lucide-react";
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
import { sendFrgc01, getMessageLogStatus, type SendFrgc01Response } from "@/lib/wa-frgc01.functions";

import { renderMapping, buildContext } from "@/lib/wa-variables";

export const Route = createFileRoute("/_authenticated/admin/whatsapp-campanhas/")({
  head: () => ({ meta: [{ title: "Campanhas WhatsApp (frgc_01)" }] }),
  component: Page,
});

type Form = {
  connectionId: string;
  recipientsRaw: string;
  imageUrl: string;
  mediaType: "image" | "video";
  nomeCliente: string;
  informacaoPrincipal: string;
  mensagemComplementar: string;
  textoAcao: string;
  urlParametro: string;
};

const EMPTY: Form = {
  connectionId: "",
  recipientsRaw: "",
  imageUrl: "https://metodovidacursos.com.br/og-cover.jpg",
  mediaType: "image",
  nomeCliente: "",
  informacaoPrincipal: "",
  mensagemComplementar: "",
  textoAcao: "",
  urlParametro: "",
};

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
    // If every field looks like a phone number, treat as list of phones (no names).
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
      // Mixed: last numeric-ish field is the phone, everything before it is the name.
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
  const sendFn = useServerFn(sendFrgc01);
  const [form, setForm] = useState<Form>(EMPTY);
  const [rows, setRows] = useState<RowState[]>([]);
  const [sending, setSending] = useState(false);
  const cancelRef = useRef(false);

  const { data: connections = [] } = useQuery({
    queryKey: ["whatsapp-connections"],
    queryFn: () => listFn(),
  });

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const recipients = useMemo(() => parseRecipients(form.recipientsRaw), [form.recipientsRaw]);

  const previewRecipient = recipients[0];
  const previewContext = useMemo(
    () => buildContext({ contact: { name: previewRecipient?.name ?? "", phone: previewRecipient?.phone ?? "" } }),
    [previewRecipient?.name, previewRecipient?.phone],
  );
  const previewValue = (value: string, fallback: string) => {
    const rendered = renderMapping(value ?? "", previewContext).trim();
    return rendered || fallback;
  };

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const csvInputRef = useRef<HTMLInputElement>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [csvCol, setCsvCol] = useState<string>("0");
  const [csvName, setCsvName] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);

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
      // If single column and no phone-ish header, import directly
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
    const existing = new Set(parseRecipients(form.recipientsRaw).map((r) => r.phone));
    const add: string[] = [];
    for (const r of raw) {
      const p = normalizePhone(r);
      if (p.length >= 8 && !existing.has(p)) {
        existing.add(p);
        add.push(p);
      }
    }
    if (add.length === 0) return;
    const prefix = form.recipientsRaw && !form.recipientsRaw.endsWith("\n") ? "\n" : "";
    set("recipientsRaw", form.recipientsRaw + prefix + add.join("\n"));
  }

  function confirmCsvImport() {
    const idx = parseInt(csvCol, 10);
    const values = csvRows.map((r) => r[idx] ?? "").filter(Boolean);
    const before = parseRecipients(form.recipientsRaw).length;
    appendPhones(values);
    setCsvOpen(false);
    // recompute
    setTimeout(() => {
      const after = parseRecipients(form.recipientsRaw).length;
      toast.success(`${Math.max(after - before, values.length)} número(s) adicionados`);
    }, 0);
  }

  async function handleUpload(file: File) {
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) {
      toast.error("Selecione uma imagem (JPG, PNG, WEBP) ou vídeo (MP4, 3GP)");
      return;
    }
    const maxMb = isVideo ? 16 : 5;
    if (file.size > maxMb * 1024 * 1024) {
      toast.error(`Arquivo muito grande (máx. ${maxMb} MB — recomendação Meta)`);
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
        .createSignedUrl(path, 60 * 60 * 24 * 30); // 30 days
      if (sErr || !signed?.signedUrl) throw sErr ?? new Error("Falha ao gerar URL");
      setForm((f) => ({ ...f, imageUrl: signed.signedUrl, mediaType: isVideo ? "video" : "image" }));
      toast.success(isVideo ? "Vídeo enviado" : "Imagem enviada");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha no upload");
    } finally {
      setUploading(false);
    }
  }

  const canSubmit =
    !!form.connectionId &&
    recipients.length > 0 &&
    !!form.imageUrl &&
    !!form.nomeCliente &&
    !!form.informacaoPrincipal &&
    !!form.mensagemComplementar &&
    !!form.textoAcao &&
    !!form.urlParametro;

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
        // Render the complete configured value for each Meta variable per recipient.
        const ctx = buildContext({ contact: { name: name ?? "", phone } });
        const render = (v: string) => renderMapping(v ?? "", ctx);
        const res: SendFrgc01Response = await sendFn({
          data: {
            connectionId: form.connectionId,
            to: phone,
            imageUrl: form.imageUrl,
            mediaType: form.mediaType,
            nomeCliente: render(form.nomeCliente),
            informacaoPrincipal: render(form.informacaoPrincipal),
            mensagemComplementar: render(form.mensagemComplementar),
            textoAcao: render(form.textoAcao),
            urlParametro: render(form.urlParametro),
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

    // Dispara em rajadas de RATE_PER_SECOND por segundo (fire-and-forget dentro da janela),
    // aguardando 1s entre o início de cada rajada para manter a taxa alvo.
    const pending: Promise<void>[] = [];
    for (let i = 0; i < recipients.length; i += RATE_PER_SECOND) {
      if (cancelRef.current) break;
      const windowStart = Date.now();
      const slice = Array.from(
        { length: Math.min(RATE_PER_SECOND, recipients.length - i) },
        (_, k) => i + k,
      );
      for (const idx of slice) pending.push(sendOne(idx));
      // Se ainda houver mais rajadas, aguarda o resto do segundo antes de disparar a próxima.
      if (i + RATE_PER_SECOND < recipients.length) {
        const elapsed = Date.now() - windowStart;
        const wait = Math.max(0, 1000 - elapsed);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      }
    }
    // Aguarda todas as requisições em voo terminarem antes de finalizar.
    await Promise.all(pending);

    setSending(false);
    toast[failCount === 0 ? "success" : "message"](`Envio concluído · ${okCount} ok · ${failCount} falha(s)`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campanhas WhatsApp (frgc_01)"
        description="Disparo oficial em lote via WhatsApp Cloud API — mesmo formato do teste, com múltiplos destinatários."
      />

      <div className="rounded-lg border bg-card p-5 space-y-4 max-w-3xl">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>Conexão WhatsApp</Label>
            <Select value={form.connectionId} onValueChange={(v) => set("connectionId", v)}>
              <SelectTrigger><SelectValue placeholder="Escolha o número" /></SelectTrigger>
              <SelectContent>
                {connections.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} {c.display_phone ? `(${c.display_phone})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>



          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label>Destinatários — um por linha. Use <code className="text-[11px]">Nome,Telefone</code> para liberar o campo <code className="text-[11px]">{"{nome}"}</code>.</Label>
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
                {form.recipientsRaw && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => set("recipientsRaw", "")}>
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
                value={form.recipientsRaw}
                onChange={(e) => set("recipientsRaw", e.target.value)}
                placeholder={"Gustavo,5562991301856\nMaria,5511999998888\n5562984817929\n\nDica: arraste um CSV aqui ou clique em Importar CSV"}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {recipients.length} destinatário(s) detectados{recipients.some((r) => r.name) ? ` · ${recipients.filter((r) => r.name).length} com nome` : ""}. O nome só é usado quando você escrever <code className="text-[11px]">{"{nome}"}</code> em algum campo de variável.
            </p>
          </div>


          <div className="space-y-2 md:col-span-2">
            <Label>Mídia do cabeçalho (imagem ou vídeo)</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={form.imageUrl}
                onChange={(e) => {
                  const v = e.target.value;
                  const isVid = /\.(mp4|3gp|mov)(\?|$)/i.test(v);
                  setForm((f) => ({ ...f, imageUrl: v, mediaType: isVid ? "video" : "image" }));
                }}
                placeholder="Cole uma URL pública ou envie um arquivo"
              />
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/3gpp,video/quicktime"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                {uploading ? "Enviando…" : "Upload"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Imagem até 5 MB (JPG/PNG/WEBP) · Vídeo até 16 MB (MP4/3GP). O template frgc_01 precisa aceitar o tipo escolhido.
            </p>
            {form.imageUrl && (
              form.mediaType === "video" ? (
                <video
                  src={form.imageUrl}
                  controls
                  className="mt-2 max-h-48 rounded-md border bg-muted"
                />
              ) : (
                <img
                  src={form.imageUrl}
                  alt="Preview do cabeçalho"
                  className="mt-2 max-h-40 rounded-md border object-contain bg-muted"
                />
              )
            )}
          </div>

          <div className="space-y-2 md:col-span-2 rounded-md border bg-muted/30 p-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Corpo — prévia renderizada</div>
            <div className="text-sm whitespace-pre-line leading-relaxed">
              {`Olá ${previewValue(form.nomeCliente, "{{1}}")}!\n\nInformamos que ${previewValue(form.informacaoPrincipal, "{{2}}")}.\n\n${previewValue(form.mensagemComplementar, "{{3}}")}.\n\nPara ${previewValue(form.textoAcao, "{{4}}")}, clique no botão logo abaixo 👇`}
            </div>
          </div>

          <div className="space-y-2">
            <Label>{"{{1}} Valor completo da variável"}</Label>
            <Input
              value={form.nomeCliente}
              onChange={(e) => set("nomeCliente", e.target.value)}
              placeholder="{nome|Cliente}, como você está?"
            />
          </div>

          <div className="space-y-2">
            <Label>{"{{2}} Informação principal"}</Label>
            <Input value={form.informacaoPrincipal} onChange={(e) => set("informacaoPrincipal", e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>{"{{3}} Mensagem complementar"}</Label>
            <Input value={form.mensagemComplementar} onChange={(e) => set("mensagemComplementar", e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>{"{{4}} Texto de ação"}</Label>
            <Input value={form.textoAcao} onChange={(e) => set("textoAcao", e.target.value)} />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>Parâmetro do botão (path após metodovidacursos.com.br/)</Label>
            <Input value={form.urlParametro} onChange={(e) => set("urlParametro", e.target.value)} placeholder="confirmar/abc123" />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button disabled={!canSubmit || sending} onClick={handleSend}>
            {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            {sending ? `Enviando… (${rows.filter((r) => r.status === "sent" || r.status === "failed").length}/${rows.length})` : `Disparar para ${recipients.length} destinatário(s)`}
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
