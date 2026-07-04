import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Eye, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { listWabas, createWaba, updateWaba, deleteWaba, getWabaChildren } from "@/lib/wa-wabas.functions";
import { importWabaNumbers } from "@/lib/wa-meta.functions";
import { listClients } from "@/lib/clients.functions";
import { listProjects } from "@/lib/projects.functions";
import { EmbeddedSignupButton } from "@/components/admin/whatsapp/embedded-signup-button";

export const Route = createFileRoute("/_authenticated/admin/whatsapp/wabas")({
  head: () => ({ meta: [{ title: "WABAs — WhatsApp Business" }] }),
  component: Page,
});

function Page() {
  const listFn = useServerFn(listWabas);
  const create = useServerFn(createWaba);
  const update = useServerFn(updateWaba);
  const remove = useServerFn(deleteWaba);
  const childrenFn = useServerFn(getWabaChildren);
  const importNumbers = useServerFn(importWabaNumbers);
  const clientsFn = useServerFn(listClients);
  const projectsFn = useServerFn(listProjects);
  const qc = useQueryClient();

  const { data: rows = [], isLoading } = useQuery({ queryKey: ["wa-wabas"], queryFn: () => listFn() });
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => clientsFn() });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => projectsFn() });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewing, setViewing] = useState<any>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["wa-wabas"] });
  const save = useMutation({
    mutationFn: (p: any) => (editing ? update({ data: { id: editing.id, ...p } }) : create({ data: p })),
    onSuccess: () => { toast.success("WABA salva"); setOpen(false); setEditing(null); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { toast.success("Removida"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const importMut = useMutation({
    mutationFn: (id: string) => importNumbers({ data: { waba_ref_id: id } }),
    onSuccess: (r: any) => { toast.success(`${r.imported}/${r.total} números importados`); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao importar da Meta"),
  });

  return (
    <>
      <PageHeader
        title="WABAs"
        description="Contas oficiais do WhatsApp Business (WhatsApp Business Accounts)."
        actions={
          <div className="flex items-center gap-2">
            <EmbeddedSignupButton onCompleted={() => refresh()} />
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
              <DialogTrigger asChild><Button variant="outline"><Plus className="mr-2 h-4 w-4" />Cadastro manual</Button></DialogTrigger>
              <FormDialog editing={editing} clients={clients} projects={projects} onSubmit={(p: any) => save.mutate(p)} saving={save.isPending} />
            </Dialog>
          </div>
        }
      />
      <div className="rounded-xl border bg-card">
        {isLoading ? <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
        : rows.length === 0 ? <EmptyState title="Nenhuma WABA cadastrada" description="Cadastre a WABA da Meta para vincular números, templates e campanhas." />
        : <Table>
          <TableHeader><TableRow>
            <TableHead>Nome interno</TableHead><TableHead>WABA ID</TableHead><TableHead>Business ID</TableHead>
            <TableHead>Cliente</TableHead><TableHead>Projeto</TableHead>
            <TableHead>Números</TableHead><TableHead>Templates</TableHead><TableHead>Campanhas</TableHead>
            <TableHead>Status</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.nome_interno}</TableCell>
                <TableCell className="font-mono text-xs">{r.waba_id}</TableCell>
                <TableCell className="font-mono text-xs">{r.business_id ?? "—"}</TableCell>
                <TableCell className="text-sm">{r.client?.name ?? "—"}</TableCell>
                <TableCell className="text-sm">{r.project?.name ?? "—"}</TableCell>
                <TableCell>{r.numbers_count}</TableCell>
                <TableCell>{r.templates_count}</TableCell>
                <TableCell>{r.campaigns_count}</TableCell>
                <TableCell><Badge variant={r.status === "ativo" ? "default" : "secondary"}>{r.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" title="Importar números da Meta" disabled={importMut.isPending} onClick={() => importMut.mutate(r.id)}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" title="Ver vinculados" onClick={() => setViewing(r)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => confirm("Remover WABA?") && del.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>}
      </div>

      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{viewing?.nome_interno} — Vinculados</DialogTitle></DialogHeader>
          {viewing && <Children id={viewing.id} fetcher={childrenFn} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Children({ id, fetcher }: { id: string; fetcher: any }) {
  const { data, isLoading } = useQuery({ queryKey: ["waba-children", id], queryFn: () => fetcher({ data: { id } }) });
  if (isLoading || !data) return <div className="text-sm text-muted-foreground">Carregando…</div>;
  const { numbers, templates, campaigns } = data;
  return (
    <div className="space-y-4 text-sm">
      <section><h4 className="font-medium mb-2">Números ({numbers.length})</h4>
        {numbers.length === 0 ? <p className="text-muted-foreground text-xs">Nenhum</p>
        : <ul className="space-y-1">{numbers.map((n: any) => <li key={n.id} className="flex justify-between border-b py-1"><span>{n.name} · {n.display_phone}</span><Badge variant="outline">{n.quality_rating ?? n.status}</Badge></li>)}</ul>}
      </section>
      <section><h4 className="font-medium mb-2">Templates ({templates.length})</h4>
        {templates.length === 0 ? <p className="text-muted-foreground text-xs">Nenhum</p>
        : <ul className="space-y-1">{templates.map((t: any) => <li key={t.id} className="flex justify-between border-b py-1"><span>{t.name} ({t.language})</span><Badge>{t.status}</Badge></li>)}</ul>}
      </section>
      <section><h4 className="font-medium mb-2">Campanhas ({campaigns.length})</h4>
        {campaigns.length === 0 ? <p className="text-muted-foreground text-xs">Nenhuma</p>
        : <ul className="space-y-1">{campaigns.map((c: any) => <li key={c.id} className="flex justify-between border-b py-1"><span>{c.name}</span><span className="text-xs text-muted-foreground">{c.sent_count}/{c.total_recipients} · {c.status}</span></li>)}</ul>}
      </section>
    </div>
  );
}

function FormDialog({ editing, clients, projects, onSubmit, saving }: any) {
  const [form, setForm] = useState<any>(() => editing ?? {
    nome_interno: "", client_id: "", project_id: "", business_id: "", waba_id: "", status: "ativo", observacoes: "",
  });
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  return (
    <DialogContent className="max-w-xl">
      <DialogHeader><DialogTitle>{editing ? "Editar WABA" : "Nova WABA"}</DialogTitle></DialogHeader>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label>Nome interno *</Label><Input value={form.nome_interno} onChange={(e) => set("nome_interno", e.target.value)} /></div>
        <div><Label>WABA ID *</Label><Input value={form.waba_id} onChange={(e) => set("waba_id", e.target.value)} placeholder="37857640713834515" /></div>
        <div><Label>Business ID</Label><Input value={form.business_id ?? ""} onChange={(e) => set("business_id", e.target.value)} /></div>
        <div><Label>Cliente</Label>
          <Select value={form.client_id ?? ""} onValueChange={(v) => set("client_id", v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Projeto</Label>
          <Select value={form.project_id ?? ""} onValueChange={(v) => set("project_id", v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{projects.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => set("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ativo">Ativo</SelectItem>
              <SelectItem value="inativo">Inativo</SelectItem>
              <SelectItem value="suspenso">Suspenso</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2"><Label>Observações</Label><Textarea rows={3} value={form.observacoes ?? ""} onChange={(e) => set("observacoes", e.target.value)} /></div>
      </div>
      <DialogFooter><Button disabled={saving} onClick={() => onSubmit(form)}>Salvar</Button></DialogFooter>
    </DialogContent>
  );
}
