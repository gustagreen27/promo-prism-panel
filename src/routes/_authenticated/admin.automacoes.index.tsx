import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, Copy, Pause, Play, Archive, Pencil, History, Workflow } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  listAutomations, createAutomation, duplicateAutomation, setAutomationStatus, getAutomationOptions,
} from "@/lib/automations.functions";
import { RunsPanel } from "@/components/admin/automation-runs";

export const Route = createFileRoute("/_authenticated/admin/automacoes/")({
  head: () => ({ meta: [{ title: "Automações — Next Disparos" }] }),
  component: AutomationsPage,
});

export const AUTOMATION_STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  active: { label: "Ativa", className: "bg-primary/15 text-primary" },
  paused: { label: "Pausada", className: "bg-secondary text-secondary-foreground" },
  archived: { label: "Arquivada", className: "bg-muted text-muted-foreground line-through" },
};
const TRIGGER_LABEL: Record<string, string> = {
  manual: "Execução manual", contact_created: "Contato criado", message_received: "Mensagem recebida",
  tag_added: "Etiqueta adicionada", webhook: "Webhook externo", scheduled: "Data e horário",
};

function AutomationsPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const list = useServerFn(listAutomations);
  const dup = useServerFn(duplicateAutomation);
  const setStatus = useServerFn(setAutomationStatus);
  const q = useQuery({ queryKey: ["automations"], queryFn: () => list() });
  const [search, setSearch] = useState("");
  const [status, setStatusFilter] = useState("all");
  const [creating, setCreating] = useState(false);
  const [historyOf, setHistoryOf] = useState<{ id: string; name: string } | null>(null);

  const rows = useMemo(() => (q.data ?? []).filter((a: any) =>
    (status === "all" ? a.status !== "archived" : a.status === status) &&
    (!search || `${a.name} ${a.description ?? ""} ${a.workspaces?.name ?? ""}`.toLowerCase().includes(search.toLowerCase()))), [q.data, search, status]);

  const statusMut = useMutation({
    mutationFn: (v: { id: string; status: "active" | "paused" | "archived" }) => setStatus({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["automations"] }); toast.success("Status atualizado"); },
    onError: (e: any) => toast.error(e.message),
  });
  const dupMut = useMutation({
    mutationFn: (id: string) => dup({ data: { id } }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["automations"] }); toast.success("Cópia criada como rascunho"); nav({ to: "/admin/automacoes/$id", params: { id: r.id } }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <PageHeader title="Automações" description="Fluxos visuais com WhatsApp, contatos e atendimento"
        actions={<Button onClick={() => setCreating(true)}><Plus className="mr-1 h-4 w-4" />Nova automação</Button>} />

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Pesquisar por nome, descrição ou cliente" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas (sem arquivadas)</SelectItem>
            <SelectItem value="draft">Rascunho</SelectItem>
            <SelectItem value="active">Ativa</SelectItem>
            <SelectItem value="paused">Pausada</SelectItem>
            <SelectItem value="archived">Arquivada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {q.isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : rows.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <Workflow className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhuma automação encontrada.</p>
          <Button variant="outline" onClick={() => setCreating(true)}>Criar a primeira</Button>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((a: any) => {
            const st = AUTOMATION_STATUS[a.status] ?? AUTOMATION_STATUS.draft;
            return (
              <Card key={a.id}>
                <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to="/admin/automacoes/$id" params={{ id: a.id }} className="truncate font-semibold hover:underline">{a.name}</Link>
                      <Badge className={st.className} variant="secondary">{st.label}</Badge>
                      {a.trigger_type && <Badge variant="outline">{TRIGGER_LABEL[a.trigger_type] ?? a.trigger_type}</Badge>}
                    </div>
                    {a.description && <p className="mt-1 truncate text-sm text-muted-foreground">{a.description}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {a.workspaces?.name ?? "Sem cliente"} · alterada em {new Date(a.draft_updated_at ?? a.updated_at).toLocaleString("pt-BR")} · {a.runs_count} execução(ões)
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" asChild><Link to="/admin/automacoes/$id" params={{ id: a.id }}><Pencil className="mr-1 h-3.5 w-3.5" />Editar</Link></Button>
                    <Button size="sm" variant="outline" onClick={() => setHistoryOf({ id: a.id, name: a.name })}><History className="mr-1 h-3.5 w-3.5" />Histórico</Button>
                    <Button size="sm" variant="outline" onClick={() => dupMut.mutate(a.id)}><Copy className="mr-1 h-3.5 w-3.5" />Duplicar</Button>
                    {a.status === "active" ? (
                      <Button size="sm" variant="outline" onClick={() => statusMut.mutate({ id: a.id, status: "paused" })}><Pause className="mr-1 h-3.5 w-3.5" />Pausar</Button>
                    ) : a.published_version_id && a.status !== "archived" ? (
                      <Button size="sm" variant="outline" onClick={() => statusMut.mutate({ id: a.id, status: "active" })}><Play className="mr-1 h-3.5 w-3.5" />Ativar</Button>
                    ) : null}
                    {a.status !== "archived" && (
                      <Button size="sm" variant="ghost" onClick={() => { if (confirm("Arquivar esta automação? Execuções em andamento continuam até terminar.")) statusMut.mutate({ id: a.id, status: "archived" }); }}><Archive className="mr-1 h-3.5 w-3.5" />Arquivar</Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CreateDialog open={creating} onOpenChange={setCreating} />
      <Dialog open={!!historyOf} onOpenChange={(o) => !o && setHistoryOf(null)}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          <DialogHeader><DialogTitle>Histórico — {historyOf?.name}</DialogTitle></DialogHeader>
          {historyOf && <RunsPanel automationId={historyOf.id} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const nav = useNavigate();
  const opts = useServerFn(getAutomationOptions);
  const create = useServerFn(createAutomation);
  const o = useQuery({ queryKey: ["automation-options"], queryFn: () => opts(), enabled: open });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ws, setWs] = useState("");
  const [conn, setConn] = useState("");
  const [example, setExample] = useState(true);
  const conns = (o.data?.connections ?? []).filter((c: any) => !ws || c.workspace_id === ws);
  const m = useMutation({
    mutationFn: () => create({ data: { name, description, workspaceId: ws, connectionId: conn || null, fromExample: example } }),
    onSuccess: (r) => { onOpenChange(false); nav({ to: "/admin/automacoes/$id", params: { id: r.id } }); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova automação</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Boas-vindas" /></div>
          <div><Label>Descrição</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
          <div><Label>Cliente</Label>
            <Select value={ws} onValueChange={(v) => { setWs(v); setConn(""); }}>
              <SelectTrigger><SelectValue placeholder="Escolha o cliente" /></SelectTrigger>
              <SelectContent>{(o.data?.workspaces ?? []).map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Número WhatsApp</Label>
            <Select value={conn} onValueChange={setConn} disabled={!ws}>
              <SelectTrigger><SelectValue placeholder={ws ? "Escolha o número" : "Escolha o cliente primeiro"} /></SelectTrigger>
              <SelectContent>{conns.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name} {c.display_phone ? `· ${c.display_phone}` : ""}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={example} onCheckedChange={(v) => setExample(!!v)} />Começar pelo modelo (template → aguardar resposta → verificar)</label>
        </div>
        <DialogFooter><Button disabled={!name || !ws || m.isPending} onClick={() => m.mutate()}>Criar rascunho</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
