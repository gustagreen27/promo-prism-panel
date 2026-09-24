import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Send, Rocket } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listConnections } from "@/lib/whatsapp.functions";
import { listLists } from "@/lib/contact-lists.functions";
import { createWaCampaign, buildRecipients, startWaCampaign, scheduleWaCampaign, testDirectSend } from "@/lib/wa-campaigns.functions";

export const Route = createFileRoute("/_authenticated/admin/disparos/direct-send")({
  head: () => ({ meta: [{ title: "Direct Send — Utilidade" }] }),
  component: Page,
});

function render(text: string, nome: string) {
  return text.replace(/\{\{\s*nome\s*\}\}|\{\s*nome\s*\}/gi, nome || "cliente");
}

function Page() {
  const navigate = useNavigate();
  const connsFn = useServerFn(listConnections);
  const listsFn = useServerFn(listLists);
  const createFn = useServerFn(createWaCampaign);
  const buildFn = useServerFn(buildRecipients);
  const startFn = useServerFn(startWaCampaign);
  const schedFn = useServerFn(scheduleWaCampaign);
  const testFn = useServerFn(testDirectSend);
  const { data: conns = [] } = useQuery({ queryKey: ["wa-conns-all"], queryFn: () => connsFn() });
  const { data: lists = [] } = useQuery({ queryKey: ["contact-lists-all"], queryFn: () => listsFn() });

  const [name, setName] = useState("Direct Send — ");
  const [connId, setConnId] = useState("");
  const [listId, setListId] = useState("");
  const [text, setText] = useState("Olá, {nome}. O pagamento do seu pedido foi confirmado.");
  const [testTo, setTestTo] = useState("");
  const [testName, setTestName] = useState("");
  const [when, setWhen] = useState("");
  const [testResult, setTestResult] = useState<any>(null);

  const test = useMutation({
    mutationFn: () => testFn({ data: { connection_id: connId, to: testTo, text, nome: testName || null } }),
    onSuccess: (r: any) => {
      setTestResult(r);
      if (r.ok) toast.success(`Teste aceito pela Meta (${r.wamid})`);
      else toast.error(r.not_enabled ? "Direct Send não está habilitado para esta conta." : r.error);
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha no teste"),
  });

  const launch = useMutation({
    mutationFn: async () => {
      const camp: any = await createFn({ data: {
        name, connection_id: connId, list_id: listId, send_mode: "direct_utility", direct_text: text, participants: [],
      } as any });
      const b = await buildFn({ data: { id: camp.id } });
      if (!b.total) throw new Error("A lista não tem contatos elegíveis (após opt-out/supressão).");
      if (when) await schedFn({ data: { id: camp.id, scheduled_at: new Date(when).toISOString() } });
      else await startFn({ data: { id: camp.id, confirm_warnings: true } });
      return camp.id as string;
    },
    onSuccess: (id) => { toast.success(when ? "Demanda agendada" : "Demanda iniciada"); navigate({ to: "/admin/disparos/$id", params: { id } }); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const ready = connId && listId && text.trim() && name.trim();
  const blocked = testResult?.not_enabled;

  return (
    <>
      <PageHeader title="Direct Send — Utilidade" description="Mensagem de texto transacional sem template (categoria utility)." />
      <div className="mb-4 flex gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
        <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
        <div>
          <b>Use apenas para comunicações transacionais de utilidade</b> — confirmação de pagamento, status de pedido, entrega, agendamento.
          Ofertas, convites, promoções e campanhas de marketing <b>não</b> são utilidade e devem usar template. A conta selecionada precisa
          ser a mesma que recebeu o aviso de qualificação no Gerenciador do WhatsApp.
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <div><Label>Nome da demanda</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Número conectado</Label>
            <Select value={connId} onValueChange={(v) => { setConnId(v); setTestResult(null); }}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{(conns as any[]).filter((c) => c.phone_number_id).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.display_phone ?? c.phone ?? c.phone_number_id} — {c.verified_name ?? c.name}</SelectItem>
              ))}</SelectContent>
            </Select>
          </div>
          <div><Label>Lista de contatos</Label>
            <Select value={listId} onValueChange={setListId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{(lists as any[]).map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Mensagem (use {"{nome}"} para o nome do contato)</Label>
            <Textarea rows={6} maxLength={4096} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div><Label>Agendar (opcional)</Label><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></div>
          <Button className="w-full" disabled={!ready || launch.isPending || blocked} onClick={() => launch.mutate()}>
            <Rocket className="mr-2 h-4 w-4" />{when ? "Agendar demanda" : "Iniciar demanda"}
          </Button>
          {blocked && <p className="text-sm text-destructive">Direct Send não está habilitado para esta conta. Escolha outra conta — não há troca automática para template.</p>}
        </div>
        <div className="space-y-3">
          <div className="rounded-xl border bg-card p-4">
            <div className="mb-2 text-xs font-medium text-muted-foreground">Prévia</div>
            <div className="max-w-sm whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm">{render(text, testName)}</div>
          </div>
          <div className="space-y-3 rounded-xl border bg-card p-4">
            <div className="text-sm font-medium">Envio de teste</div>
            <p className="text-xs text-muted-foreground">Use uma atualização real sobre uma transação do destinatário.</p>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="5562999999999" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
              <Input placeholder="Nome (opcional)" value={testName} onChange={(e) => setTestName(e.target.value)} />
            </div>
            <Button variant="secondary" disabled={!connId || !testTo || !text.trim() || test.isPending} onClick={() => test.mutate()}>
              <Send className="mr-2 h-4 w-4" />Enviar teste
            </Button>
            {testResult && (
              <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(testResult, null, 2)}</pre>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
