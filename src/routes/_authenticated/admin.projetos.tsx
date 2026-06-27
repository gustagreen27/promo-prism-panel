import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";
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
import { formatBRL } from "@/lib/format";
import { listProjects, createProject, updateProject, deleteProject } from "@/lib/projects.functions";
import { listClients } from "@/lib/clients.functions";

export const Route = createFileRoute("/_authenticated/admin/projetos")({
  head: () => ({ meta: [{ title: "Projetos — Painel" }] }),
  component: Page,
});

const STATUS = ["planejado","em_andamento","pausado","concluido","cancelado"] as const;

function Page() {
  const list = useServerFn(listProjects);
  const create = useServerFn(createProject);
  const update = useServerFn(updateProject);
  const remove = useServerFn(deleteProject);
  const clientsFn = useServerFn(listClients);
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ["projects"], queryFn: () => list() });
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => clientsFn() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["projects"] });
  const saveMut = useMutation({
    mutationFn: async (p: any) => (editing ? update({ data: { id: editing.id, ...p } }) : create({ data: p })),
    onSuccess: () => { toast.success("Salvo"); setOpen(false); setEditing(null); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const delMut = useMutation({ mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { toast.success("Removido"); refresh(); } });

  return (
    <>
      <PageHeader title="Projetos" description="Projetos e entregas." actions={
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Novo projeto</Button></DialogTrigger>
          <FormDialog editing={editing} clients={clients} onSubmit={(p: any) => saveMut.mutate(p)} saving={saveMut.isPending} />
        </Dialog>
      } />
      <div className="rounded-xl border bg-card">
        {isLoading ? <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
          : data.length === 0 ? <EmptyState title="Sem projetos" />
          : <Table>
            <TableHeader><TableRow>
              <TableHead>Nome</TableHead><TableHead>Cliente</TableHead>
              <TableHead>Valor</TableHead><TableHead>Responsável</TableHead>
              <TableHead>Status</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {data.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.client?.name ?? "—"}</TableCell>
                  <TableCell>{formatBRL(r.contract_value)}</TableCell>
                  <TableCell>{r.responsible ?? "—"}</TableCell>
                  <TableCell><Badge variant="secondary">{r.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
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

function FormDialog({ editing, clients, onSubmit, saving }: any) {
  const [form, setForm] = useState<any>(() => editing ?? {
    name: "", client_id: "", description: "", status: "planejado",
    start_date: "", end_date: "", contract_value: "", estimated_cost: "",
    responsible: "", notes: "",
  });
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>{editing ? "Editar projeto" : "Novo projeto"}</DialogTitle></DialogHeader>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label>Nome</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div><Label>Cliente</Label>
          <Select value={form.client_id ?? ""} onValueChange={(v) => set("client_id", v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => set("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Responsável</Label><Input value={form.responsible ?? ""} onChange={(e) => set("responsible", e.target.value)} /></div>
        <div><Label>Valor do contrato</Label><Input type="number" step="0.01" value={form.contract_value ?? ""} onChange={(e) => set("contract_value", e.target.value)} /></div>
        <div><Label>Custo estimado</Label><Input type="number" step="0.01" value={form.estimated_cost ?? ""} onChange={(e) => set("estimated_cost", e.target.value)} /></div>
        <div><Label>Início</Label><Input type="date" value={form.start_date ?? ""} onChange={(e) => set("start_date", e.target.value)} /></div>
        <div><Label>Fim</Label><Input type="date" value={form.end_date ?? ""} onChange={(e) => set("end_date", e.target.value)} /></div>
        <div className="sm:col-span-2"><Label>Descrição</Label><Textarea value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} /></div>
        <div className="sm:col-span-2"><Label>Notas</Label><Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></div>
      </div>
      <DialogFooter><Button disabled={saving} onClick={() => onSubmit(form)}>Salvar</Button></DialogFooter>
    </DialogContent>
  );
}
