import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Send, Upload, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { listConnections } from "@/lib/whatsapp.functions";
import { sendFrgc01, getMessageLogStatus, type SendFrgc01Response } from "@/lib/wa-frgc01.functions";

export const Route = createFileRoute("/_authenticated/admin/whatsapp/teste-frgc01")({
  head: () => ({ meta: [{ title: "Testar template frgc_01" }] }),
  component: Page,
});

type Form = {
  connectionId: string;
  to: string;
  imageUrl: string;
  nomeCliente: string;
  informacaoPrincipal: string;
  mensagemComplementar: string;
  textoAcao: string;
  urlParametro: string;
};

const EMPTY: Form = {
  connectionId: "",
  to: "",
  imageUrl: "https://metodovidacursos.com.br/og-cover.jpg",
  nomeCliente: "",
  informacaoPrincipal: "",
  mensagemComplementar: "",
  textoAcao: "",
  urlParametro: "",
};

const STATUS_STYLES: Record<string, string> = {
  accepted: "bg-blue-500/15 text-blue-700 border-blue-500/40",
  sent: "bg-cyan-500/15 text-cyan-700 border-cyan-500/40",
  delivered: "bg-emerald-500/15 text-emerald-700 border-emerald-500/40",
  read: "bg-violet-500/15 text-violet-700 border-violet-500/40",
  failed: "bg-red-500/15 text-red-700 border-red-500/40",
};

function StatusBadge({ status }: { status?: string | null }) {
  const s = status ?? "pending";
  const cls = STATUS_STYLES[s] ?? "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {s}
    </span>
  );
}

function Page() {
  const listFn = useServerFn(listConnections);
  const sendFn = useServerFn(sendFrgc01);
  const statusFn = useServerFn(getMessageLogStatus);
  const [form, setForm] = useState<Form>(EMPTY);
  const [result, setResult] = useState<SendFrgc01Response | null>(null);

  const { data: connections = [] } = useQuery({
    queryKey: ["whatsapp-connections"],
    queryFn: () => listFn(),
  });

  const logId = result?.ok ? result.logId : result?.ok === false ? result.logId : undefined;
  const { data: liveStatus } = useQuery({
    queryKey: ["message-log-status", logId],
    queryFn: () => statusFn({ data: { logId: logId! } }),
    enabled: !!logId,
    refetchInterval: (q) => {
      const s = (q.state.data as any)?.message_status;
      return s === "read" || s === "failed" ? false : 2500;
    },
  });

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem (JPG, PNG, WEBP)");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx. 5 MB — recomendação Meta)");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `frgc01/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("campaign-images")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: signed, error: sErr } = await supabase.storage
        .from("campaign-images")
        .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 days
      if (sErr || !signed?.signedUrl) throw sErr ?? new Error("Falha ao gerar URL");
      set("imageUrl", signed.signedUrl);
      toast.success("Imagem enviada");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha no upload");
    } finally {
      setUploading(false);
    }
  }

  const mut = useMutation({
    mutationFn: async () => sendFn({ data: form }),
    onSuccess: (r) => {
      setResult(r);
      if (r.ok) toast.success(`Enviado — id ${r.metaMessageId}`);
      else toast.error(r.error);
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao enviar"),
  });

  const canSubmit =
    form.connectionId &&
    form.to &&
    form.imageUrl &&
    form.nomeCliente &&
    form.informacaoPrincipal &&
    form.mensagemComplementar &&
    form.textoAcao &&
    form.urlParametro;

  return (
    <div className="space-y-6">
      <PageHeader title="Testar template frgc_01" description="Envio oficial via WhatsApp Cloud API" />

      <div className="rounded-lg border bg-card p-5 space-y-4 max-w-3xl">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
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

          <div className="space-y-2">
            <Label>Destinatário (E.164, sem +)</Label>
            <Input value={form.to} onChange={(e) => set("to", e.target.value)} placeholder="5511999999999" />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>Imagem do cabeçalho</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={form.imageUrl}
                onChange={(e) => set("imageUrl", e.target.value)}
                placeholder="Cole uma URL pública ou envie um arquivo"
              />
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
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
            {form.imageUrl && (
              <img
                src={form.imageUrl}
                alt="Preview do cabeçalho"
                className="mt-2 max-h-40 rounded-md border object-contain bg-muted"
              />
            )}
          </div>

          <div className="space-y-2 md:col-span-2 rounded-md border bg-muted/30 p-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Corpo</div>
            <div className="text-sm whitespace-pre-line leading-relaxed">
              {`Olá ${form.nomeCliente || "{{1}}"}!\n\nInformamos que ${form.informacaoPrincipal || "{{2}}"}.\n\n${form.mensagemComplementar || "{{3}}"}.\n\nPara ${form.textoAcao || "{{4}}"}, clique no botão logo abaixo 👇`}
            </div>
          </div>

          <div className="space-y-2">
            <Label>{"{{1}} Nome do cliente"}</Label>
            <Input value={form.nomeCliente} onChange={(e) => set("nomeCliente", e.target.value)} />
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

        <Button disabled={!canSubmit || mut.isPending} onClick={() => mut.mutate()}>
          <Send className="h-4 w-4 mr-2" />
          {mut.isPending ? "Enviando…" : "Enviar via Meta"}
        </Button>

        {result && (
          <div
            className={`rounded-md border p-4 text-sm ${
              result.ok ? "border-emerald-500/40 bg-emerald-500/10" : "border-destructive/40 bg-destructive/10"
            }`}
          >
            {result.ok ? (
              <>
                <div className="font-medium">✅ Aceito pela Meta</div>
                <div className="mt-1">Status: {result.status}</div>
                <div className="text-muted-foreground text-xs mt-1 break-all">meta_message_id: {result.metaMessageId}</div>
                <div className="text-muted-foreground text-xs">log_id: {result.logId}</div>
                <div className="mt-3 border-t pt-2">
                  <div className="text-xs font-medium mb-1">Status ao vivo (webhook Meta):</div>
                  <StatusBadge status={liveStatus?.message_status ?? result.status} />
                  {liveStatus?.failed_reason && (
                    <div className="text-xs text-destructive mt-1">
                      {liveStatus.failed_reason} {liveStatus.error_code ? `(${liveStatus.error_code})` : ""}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="font-medium">❌ {result.error}</div>
                {result.code && <div className="text-xs mt-1">Código Meta: {result.code}</div>}
                {result.hint && <div className="text-xs mt-1">Sugestão: {result.hint}</div>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
