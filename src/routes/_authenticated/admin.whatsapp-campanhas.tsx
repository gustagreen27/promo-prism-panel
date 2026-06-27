import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Eye, Play, Pause, X, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { listWaCampaigns, createWaCampaign, deleteWaCampaign, buildRecipients, startWaCampaign, pauseWaCampaign, cancelWaCampaign } from "@/lib/wa-campaigns.functions";
import { listClients } from "@/lib/clients.functions";
import { listProjects } from "@/lib/projects.functions";
import { listNumbers } from "@/lib/whatsapp-numbers.functions";
import { listTemplates } from "@/lib/whatsapp-templates.functions";
import { listLists } from "@/lib/contact-lists.functions";
import { formatDate } from "@/lib/format";
import {
  ParticipantsBadges,
  ParticipantsSelect,
  ParticipantsFilter,
  matchesParticipants,
  type Participant,
} from "@/components/participants";

export const Route = createFileRoute("/_authenticated/admin/whatsapp-campanhas")({
  head: () => ({ meta: [{ title: "Campanhas WhatsApp" }] }),
  component: Page,
});

const STATUS_COLOR: Record<string, any> = {
  draft: "secondary", scheduled: "outline", running: "default",
  paused: "secondary", completed: "default", cancelled: "destructive", error: "destructive",
};

function Page() {
  const listFn = useServerFn(listWaCampaigns);
  const create = useServerFn(createWaCampaign);
  const remove = useServerFn(deleteWaCampaign);
  const build = useServerFn(buildRecipients);
  const start = useServerFn(startWaCampaign);
  const pause = useServerFn(pauseWaCampaign);
  const cancel = useServerFn(cancelWaCampaign);

  const clientsFn = useServerFn(listClients);
  const projectsFn = useServerFn(listProjects);
  const numbersFn = useServerFn(listNumbers);
  const templatesFn = useServerFn(listTemplates);
  const listsFn = useServerFn(listLists);

  const qc = useQueryClient();
  const nav = useNavigate();

  const { data: rows = [], isLoading } = useQuery({ queryKey: ["wa-campaigns"], queryFn: () => listFn() });
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => clientsFn() });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => projectsFn() });
  const { data: numbers = [] } = useQuery({ queryKey: ["wa-numbers"], queryFn: () => numbersFn() });
  const { data: templates = [] } = useQuery({ queryKey: ["wa-templates"], queryFn: () => templatesFn() });
  const { data: lists = [] } = useQuery({ queryKey: ["lists"], queryFn: () => listsFn() });

  const [open, setOpen] = useState(false);
  const [partFilter, setPartFilter] = useState<Participant[]>([]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["wa-campaigns"] });

  const saveMut = useMutation({
    mutationFn: (p: any) => create({ data: p }),
    onSuccess: () => { toast.success("Campanha criada"); setOpen(false); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const delMut = useMutation({ mutationFn: (id: string) => remove({ data: { id } }), onSuccess: () => { toast.success("Removida"); refresh(); } });
  const buildMut = useMutation({
    mutationFn: (id: string) => build({ data: { id } }),
    onSuccess: (r: any) => { toast.success(`Fila gerada: ${r.total} destinatários`); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const startMut = useMutation({
    mutationFn: (id: string) => start({ data: { id } }),
    onSuccess: () => { toast.success("Campanha iniciada"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const pauseMut = useMutation({ mutationFn: (id: string) => pause({ data: { id } }), onSuccess: () => { toast.success("Pausada"); refresh(); } });
  const cancelMut = useMutation({ mutationFn: (id: string) => cancel({ data: { id } }), onSuccess: () => { toast.success("Cancelada"); refresh(); } });

  return (
    <>
      <PageHeader
        title="Campanhas WhatsApp"
        description="Disparos oficiais via Cloud API da Meta."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Nova campanha</Button></DialogTrigger>
            <CreateDialog clients={clients} projects={projects} numbers={numbers} templates={templates} lists={lists} onSubmit={(p: any) => saveMut.mutate(p)} saving={saveMut.isPending} />
          </Dialog>
        }
      />
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Filtrar por sócio:</span>
        <div className="w-56"><ParticipantsFilter value={partFilter} onChange={setPartFilter} /></div>
        {partFilter.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setPartFilter([])}>Limpar</Button>
        )}
      </div>
      <div className="rounded-xl border bg-card">
        {isLoading ? <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
        : rows.length === 0 ? <EmptyState title="Sem campanhas WhatsApp" description="Crie uma nova campanha para iniciar disparos." />
        : <Table>
          <TableHeader><TableRow>
            <TableHead>Nome</TableHead><TableHead>Cliente</TableHead><TableHead>Sócios</TableHead><TableHead>Template</TableHead>
            <TableHead>Destinatários</TableHead><TableHead>Enviadas</TableHead>
            <TableHead>Entregues</TableHead><TableHead>Lidas</TableHead><TableHead>Status</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {rows.filter((r: any) => matchesParticipants(r, partFilter)).map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{r.client?.name ?? "—"}</TableCell>
                <TableCell><ParticipantsBadges value={r.participants} /></TableCell>
                <TableCell>{r.template?.name ?? "—"}</TableCell>
                <TableCell>{r.total_recipients}</TableCell>
                <TableCell>{r.sent_count}</TableCell>
                <TableCell>{r.delivered_count}</TableCell>
                <TableCell>{r.read_count}</TableCell>
                <TableCell><Badge variant={STATUS_COLOR[r.status] ?? "secondary"}>{r.status}</Badge></TableCell>
                <TableCell className="text-right">
                  {(r.status === "draft" || r.status === "paused") && (
                    <Button size="icon" variant="ghost" title="Gerar fila" onClick={() => buildMut.mutate(r.id)}><RefreshCw className="h-4 w-4" /></Button>
                  )}
                  {(r.status === "draft" || r.status === "paused") && (
                    <Button size="icon" variant="ghost" title="Iniciar" onClick={() => confirm(`Iniciar disparo para ${r.total_recipients} destinatários?`) && startMut.mutate(r.id)}><Play className="h-4 w-4" /></Button>
                  )}
                  {r.status === "running" && (
                    <Button size="icon" variant="ghost" title="Pausar" onClick={() => pauseMut.mutate(r.id)}><Pause className="h-4 w-4" /></Button>
                  )}
                  {(r.status === "running" || r.status === "paused" || r.status === "scheduled") && (
                    <Button size="icon" variant="ghost" title="Cancelar" onClick={() => confirm("Cancelar campanha?") && cancelMut.mutate(r.id)}><X className="h-4 w-4" /></Button>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => nav({ to: "/admin/whatsapp-campanhas/$id", params: { id: r.id } })}><Eye className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => confirm("Remover?") && delMut.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>}
      </div>
    </>
  );
}

function CreateDialog({ clients, projects, numbers, templates, lists, onSubmit, saving }: any) {
  const [form, setForm] = useState<any>({
    name: "", client_id: "", project_id: "", connection_id: "", template_id: "", list_id: "",
    template_variables: {}, send_rate_per_min: 30, notes: "", participants: [],
  });
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const template = templates.find((t: any) => t.id === form.template_id);
  const varsList: string[] = Array.isArray(template?.variables) ? template.variables : [];

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>Nova campanha WhatsApp</DialogTitle></DialogHeader>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label>Nome *</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div><Label>Cliente</Label>
          <Select value={form.client_id} onValueChange={(v) => set("client_id", v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Projeto</Label>
          <Select value={form.project_id} onValueChange={(v) => set("project_id", v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{projects.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Número remetente *</Label>
          <Select value={form.connection_id} onValueChange={(v) => set("connection_id", v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{numbers.map((n: any) => <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Template aprovado *</Label>
          <Select value={form.template_id} onValueChange={(v) => set("template_id", v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{templates.filter((t: any) => t.status === "approved").map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name} ({t.language})</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2"><Label>Lista de contatos *</Label>
          <Select value={form.list_id} onValueChange={(v) => set("list_id", v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{lists.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {varsList.length > 0 && (
          <div className="sm:col-span-2 space-y-2 rounded border bg-muted/40 p-3">
            <div className="text-xs font-medium uppercase text-muted-foreground">Variáveis do template</div>
            {varsList.map((k) => (
              <div key={k} className="flex items-center gap-2">
                <Label className="w-12 text-xs">{`{{${k}}}`}</Label>
                <Input
                  value={form.template_variables?.[k] ?? ""}
                  onChange={(e) => set("template_variables", { ...form.template_variables, [k]: e.target.value })}
                />
              </div>
            ))}
          </div>
        )}

        {template?.body && (
          <div className="sm:col-span-2 rounded border bg-muted p-3 text-sm whitespace-pre-wrap">
            <div className="text-xs font-medium uppercase text-muted-foreground mb-1">Preview</div>
            {String(template.body).replace(/\{\{(\d+)\}\}/g, (_: string, k: string) => form.template_variables?.[k] || `{{${k}}}`)}
          </div>
        )}

        <div><Label>Velocidade (msg/min)</Label><Input type="number" value={form.send_rate_per_min} onChange={(e) => set("send_rate_per_min", Number(e.target.value))} /></div>
        <div className="sm:col-span-2">
          <ParticipantsSelect
            value={(form.participants ?? []) as Participant[]}
            onChange={(v) => set("participants", v)}
            label="Sócios responsáveis pelo disparo"
          />
        </div>
      </div>
      <DialogFooter><Button disabled={saving || !form.name || !form.connection_id || !form.template_id || !form.list_id} onClick={() => onSubmit({ ...form, participants: form.participants ?? [] })}>Criar como rascunho</Button></DialogFooter>
    </DialogContent>
  );
}
