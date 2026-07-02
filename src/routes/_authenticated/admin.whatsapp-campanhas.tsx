import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Eye, Play, Pause, X, RefreshCw, Upload, ClipboardPaste, ListPlus } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { listWaCampaigns, createWaCampaign, deleteWaCampaign, buildRecipients, startWaCampaign, pauseWaCampaign, cancelWaCampaign } from "@/lib/wa-campaigns.functions";
import { listClients } from "@/lib/clients.functions";
import { listProjects } from "@/lib/projects.functions";
import { listNumbers } from "@/lib/whatsapp-numbers.functions";
import { listTemplates } from "@/lib/whatsapp-templates.functions";
import { listLists, createList, importPhonesToList } from "@/lib/contact-lists.functions";
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
            <CreateDialog clients={clients} projects={projects} numbers={numbers} templates={templates} lists={lists} onSubmit={(p: any) => saveMut.mutate(p)} saving={saveMut.isPending} onListsChanged={() => qc.invalidateQueries({ queryKey: ["lists"] })} />
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

function CreateDialog({ clients, projects, numbers, templates, lists, onSubmit, saving, onListsChanged }: any) {
  const [form, setForm] = useState<any>({
    name: "", client_id: "", project_id: "", connection_id: "", template_id: "", list_id: "",
    template_variables: {}, send_rate_per_min: 30, notes: "", participants: [],
  });
  const [importOpen, setImportOpen] = useState(false);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const template = templates.find((t: any) => t.id === form.template_id);
  const varsList: string[] = Array.isArray(template?.variables) ? template.variables : [];

  const createListFn = useServerFn(createList);
  const importFn = useServerFn(importPhonesToList);

  const importMut = useMutation({
    mutationFn: async (p: { listName: string; rows: { phone: string; name?: string | null }[]; source: string }) => {
      const list = await createListFn({
        data: {
          name: p.listName,
          description: `Criada via campanha "${form.name || "sem nome"}"`,
          client_id: form.client_id || null,
          project_id: form.project_id || null,
        },
      });
      const res = await importFn({ data: { list_id: list.id, rows: p.rows, source: p.source } });
      return { list, ...res };
    },
    onSuccess: (r: any) => {
      toast.success(`Lista "${r.list.name}" criada · ${r.added} leads vinculados${r.invalid ? ` · ${r.invalid} inválidos` : ""}`);
      set("list_id", r.list.id);
      setImportOpen(false);
      onListsChanged?.();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao importar leads"),
  });

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
        <div className="sm:col-span-2">
          <div className="flex items-center justify-between">
            <Label>Lista de contatos *</Label>
            <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <ListPlus className="mr-1.5 h-3.5 w-3.5" />Importar leads
            </Button>
          </div>
          <Select value={form.list_id} onValueChange={(v) => set("list_id", v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{lists.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">
            Escolha uma lista existente ou clique em <strong>Importar leads</strong> para colar/enviar os telefones agora — uma nova lista será criada automaticamente.
          </p>
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

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <QuickImportDialog
          defaultName={form.name ? `${form.name} — leads` : `Leads ${new Date().toLocaleDateString("pt-BR")}`}
          saving={importMut.isPending}
          onSubmit={(listName, rows, source) => importMut.mutate({ listName, rows, source })}
        />
      </Dialog>
    </DialogContent>
  );
}

type ImportRow = { phone: string; name?: string | null };

function QuickImportDialog({
  defaultName,
  saving,
  onSubmit,
}: {
  defaultName: string;
  saving: boolean;
  onSubmit: (listName: string, rows: ImportRow[], source: string) => void;
}) {
  const [listName, setListName] = useState(defaultName);
  const [tab, setTab] = useState("paste");
  const [paste, setPaste] = useState("");
  const [csvRows, setCsvRows] = useState<ImportRow[] | null>(null);
  const [csvName, setCsvName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pasteRows: ImportRow[] = useMemo(() => {
    if (!paste.trim()) return [];
    return paste
      .split(/[\n;,]/)
      .map((v) => v.trim())
      .filter(Boolean)
      .map((phone) => ({ phone }));
  }, [paste]);

  const handleFile = async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
    if (!lines.length) { setCsvRows([]); return; }
    const headerLine = lines[0];
    const hasHeader = /phone|telefone|celular|nome|name|email/i.test(headerLine);
    const sep = headerLine.includes(";") ? ";" : ",";
    const headers = hasHeader
      ? headerLine.split(sep).map((h) => h.trim().toLowerCase())
      : ["phone", "name"];
    const dataLines = hasHeader ? lines.slice(1) : lines;
    const rows: ImportRow[] = dataLines.map((line) => {
      const cols = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
      const obj: any = {};
      headers.forEach((h, i) => { obj[h] = cols[i] ?? ""; });
      return {
        phone: obj.phone || obj.telefone || obj.celular || cols[0] || "",
        name: obj.name || obj.nome || null,
      };
    }).filter((r) => r.phone);
    setCsvRows(rows);
    setCsvName(file.name);
  };

  const activeRows = tab === "paste" ? pasteRows : (csvRows ?? []);

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader><DialogTitle>Importar leads para esta campanha</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Nome da nova lista *</Label>
          <Input value={listName} onChange={(e) => setListName(e.target.value)} />
        </div>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="paste"><ClipboardPaste className="mr-2 h-4 w-4" />Colar telefones</TabsTrigger>
            <TabsTrigger value="csv"><Upload className="mr-2 h-4 w-4" />CSV</TabsTrigger>
          </TabsList>
          <TabsContent value="paste">
            <Textarea
              rows={10}
              className="font-mono text-xs"
              placeholder={"5562984817929\n5511999998888\n..."}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">{pasteRows.length} número(s) detectado(s).</p>
          </TabsContent>
          <TabsContent value="csv">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
              className="rounded-lg border-2 border-dashed p-6 text-center"
            >
              <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <p className="mb-2 text-sm">Arraste um CSV ou</p>
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>Selecionar arquivo</Button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              <p className="mt-3 text-xs text-muted-foreground">Colunas: <code>phone/telefone/celular</code>, <code>name/nome</code>.</p>
            </div>
            {csvRows && <div className="mt-2 rounded-md border bg-muted/40 p-2 text-xs"><strong>{csvName}</strong> · {csvRows.length} linha(s).</div>}
          </TabsContent>
        </Tabs>
      </div>
      <DialogFooter>
        <Button
          disabled={saving || !listName || activeRows.length === 0}
          onClick={() => onSubmit(listName, activeRows, tab === "csv" ? "csv" : "paste")}
        >
          {saving ? "Importando…" : `Criar lista e importar ${activeRows.length}`}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
