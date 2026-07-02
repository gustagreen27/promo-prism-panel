import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
            <Label>URL da imagem do cabeçalho</Label>
            <Input value={form.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} />
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
