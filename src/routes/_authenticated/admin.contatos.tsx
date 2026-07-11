import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Upload, UserX } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { CLIENTES_TABS, HubTabs } from "@/components/admin/hub-tabs";
import { Link } from "@tanstack/react-router";
import { ListPlus } from "lucide-react";
import { EmptyState } from "@/components/admin/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listContacts, createContact, deleteContact, importContactsCsv, optOutContact } from "@/lib/contacts.functions";
import { listClients } from "@/lib/clients.functions";
import { listProjects } from "@/lib/projects.functions";

export const Route = createFileRoute("/_authenticated/admin/contatos")({
  head: () => ({ meta: [{ title: "Contatos — Painel" }] }),
  component: Page,
});

function Page() {
  const listFn = useServerFn(listContacts);
  const create = useServerFn(createContact);
  const remove = useServerFn(deleteContact);
  const importFn = useServerFn(importContactsCsv);
  const optOut = useServerFn(optOutContact);
  const clientsFn = useServerFn(listClients);
  const projectsFn = useServerFn(listProjects);
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({ queryKey: ["contacts"], queryFn: () => listFn() });
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => clientsFn() });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => projectsFn() });
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["contacts"] });

  const save = useMutation({
    mutationFn: (p: any) => create({ data: p }),
    onSuccess: () => { toast.success("Contato criado"); setOpen(false); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const del = useMutation({ mutationFn: (id: string) => remove({ data: { id } }), onSuccess: () => { toast.success("Removido"); refresh(); } });
  const optMut = useMutation({ mutationFn: (phone: string) => optOut({ data: { phone, reason: "manual" } }), onSuccess: () => { toast.success("Opt-out registrado"); refresh(); } });

  const importMut = useMutation({
    mutationFn: (p: any) => importFn({ data: p }),
    onSuccess: (r: any) => { toast.success(`${r.valid} importados (${r.invalid} inválidos, ${r.duplicated} duplicados)`); setImportOpen(false); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  return (
    <>
      <PageHeader
        title="Contatos"
        description="Base individual de contatos. Para agrupar em listas usadas nos disparos, vá em Listas."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="secondary">
              <Link to="/admin/contatos/listas"><ListPlus className="mr-2 h-4 w-4" />Criar lista</Link>
            </Button>
            <Dialog open={importOpen} onOpenChange={setImportOpen}>
              <DialogTrigger asChild><Button variant="outline"><Upload className="mr-2 h-4 w-4" />Importar CSV</Button></DialogTrigger>
              <ImportDialog clients={clients} projects={projects} onSubmit={(p: any) => importMut.mutate(p)} saving={importMut.isPending} />
            </Dialog>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Novo contato</Button></DialogTrigger>
              <ContactDialog clients={clients} projects={projects} onSubmit={(p: any) => save.mutate(p)} saving={save.isPending} />
            </Dialog>
          </div>
        }
      />
      <HubTabs tabs={CLIENTES_TABS} />
      <div className="mb-4 rounded-lg border bg-muted/40 p-3 text-sm">
        💡 O <b>disparo</b> escolhe uma <b>Lista</b>, não contatos soltos. Cadastre aqui, depois vá em <Link to="/admin/contatos/listas" className="font-semibold underline">Listas</Link> para agrupar.
      </div>
      <div className="rounded-xl border bg-card">
        {isLoading ? <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
        : rows.length === 0 ? <EmptyState title="Sem contatos" description="Cadastre um contato ou importe uma planilha." />
        : <Table>
          <TableHeader><TableRow>
            <TableHead>Nome</TableHead><TableHead>Telefone</TableHead><TableHead>Cliente</TableHead>
            <TableHead>Origem</TableHead><TableHead>Opt-in</TableHead><TableHead>Opt-out</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{r.phone}</TableCell>
                <TableCell>{r.client?.name ?? "—"}</TableCell>
                <TableCell><Badge variant="outline">{r.source ?? "—"}</Badge></TableCell>
                <TableCell>{r.opt_in ? <Badge>sim</Badge> : <Badge variant="secondary">não</Badge>}</TableCell>
                <TableCell>{r.opt_out ? <Badge variant="destructive">sim</Badge> : "—"}</TableCell>
                <TableCell className="text-right">
                  {!r.opt_out && <Button size="icon" variant="ghost" title="Marcar opt-out" onClick={() => confirm("Marcar opt-out?") && optMut.mutate(r.phone)}><UserX className="h-4 w-4" /></Button>}
                  <Button size="icon" variant="ghost" onClick={() => confirm("Remover?") && del.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>}
      </div>
    </>
  );
}

function ContactDialog({ clients, projects, onSubmit, saving }: any) {
  const [form, setForm] = useState<any>({ name: "", phone: "", email: "", client_id: "", project_id: "", source: "manual", opt_in: true });
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Novo contato</DialogTitle></DialogHeader>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label>Nome</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div><Label>Telefone (BR) *</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(11) 99999-9999" /></div>
        <div><Label>E-mail</Label><Input value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
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
        <div className="sm:col-span-2 flex items-center gap-2">
          <Checkbox id="optin" checked={form.opt_in} onCheckedChange={(v) => set("opt_in", !!v)} />
          <Label htmlFor="optin" className="cursor-pointer">Possuo opt-in deste contato (obrigatório para disparo)</Label>
        </div>
      </div>
      <DialogFooter><Button disabled={saving || !form.opt_in} onClick={() => onSubmit(form)}>Salvar</Button></DialogFooter>
    </DialogContent>
  );
}

function ImportDialog({ clients, projects, onSubmit, saving }: any) {
  const [rows, setRows] = useState<any[]>([]);
  const [filename, setFilename] = useState<string>("");
  const [optIn, setOptIn] = useState(true);
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");

  const handleFile = async (f: File) => {
    setFilename(f.name);
    const text = await f.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (!lines.length) return;
    const headers = lines[0].split(/[,;]/).map((h) => h.trim().toLowerCase());
    const out: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(/[,;]/);
      const row: any = {};
      headers.forEach((h, idx) => (row[h] = (cells[idx] ?? "").trim()));
      out.push(row);
    }
    setRows(out);
  };

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader><DialogTitle>Importar contatos via CSV</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="rounded border bg-muted p-2 text-xs">
          O arquivo deve conter colunas <code>phone</code>/<code>telefone</code>, opcionalmente <code>name</code>/<code>nome</code> e <code>email</code>. Telefones brasileiros são normalizados para E.164 (55…).
        </div>
        <Input type="file" accept=".csv" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        {rows.length > 0 && <div className="text-xs text-muted-foreground">{rows.length} linha(s) carregada(s)</div>}
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Cliente</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>{clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Projeto</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>{projects.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="cv-optin" checked={optIn} onCheckedChange={(v) => setOptIn(!!v)} />
          <Label htmlFor="cv-optin">Confirmo que todos os contatos possuem opt-in para mensagens</Label>
        </div>
      </div>
      <DialogFooter>
        <Button disabled={saving || rows.length === 0 || !optIn} onClick={() => onSubmit({ filename, client_id: clientId, project_id: projectId, opt_in: optIn, rows })}>
          Importar {rows.length} contato(s)
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
