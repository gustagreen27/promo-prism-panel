import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Download } from "lucide-react";
import { toCSV, downloadCSV, participantsLabel } from "@/lib/csv";
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
import { Switch } from "@/components/ui/switch";
import { formatBRL, formatDate } from "@/lib/format";
import { listCosts, createCost, updateCost, deleteCost } from "@/lib/costs.functions";
import { listClients } from "@/lib/clients.functions";
import { listProjects } from "@/lib/projects.functions";
import {
  ParticipantsBadges,
  ParticipantsSelect,
  ParticipantsFilter,
  matchesParticipants,
  type Participant,
} from "@/components/participants";

export const Route = createFileRoute("/_authenticated/admin/custos")({
  head: () => ({ meta: [{ title: "Custos — Painel" }] }),
  component: Page,
});

const STATUS = ["pendente", "pago", "atrasado", "cancelado"] as const;
const CATEGORIES = ["mensagens", "infraestrutura", "marketing", "salarios", "impostos", "outros"];

function Page() {
  const list = useServerFn(listCosts);
  const create = useServerFn(createCost);
  const update = useServerFn(updateCost);
  const remove = useServerFn(deleteCost);
  const clientsFn = useServerFn(listClients);
  const projectsFn = useServerFn(listProjects);
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ["costs"], queryFn: () => list() });
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => clientsFn() });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => projectsFn() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [partFilter, setPartFilter] = useState<Participant[]>([]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["costs"] });
  const saveMut = useMutation({
    mutationFn: async (p: any) => (editing ? update({ data: { id: editing.id, ...p } }) : create({ data: p })),
    onSuccess: () => { toast.success(editing ? "Atualizado" : "Lançado"); setOpen(false); setEditing(null); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { toast.success("Removido"); refresh(); },
  });

  const filtered = data.filter((r: any) => matchesParticipants(r, partFilter));
  const total = filtered.reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);

  return (
    <>
      <PageHeader title="Custos" description="Despesas e fornecedores." actions={
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Novo custo</Button></DialogTrigger>
          <FormDialog editing={editing} clients={clients} projects={projects} onSubmit={(p: any) => saveMut.mutate(p)} saving={saveMut.isPending} />
        </Dialog>
      } />

      <div className="rounded-xl border bg-card p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Total</p>
        <p className="mt-1 text-2xl font-semibold text-rose-600 dark:text-rose-400">{formatBRL(total)}</p>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Filtrar por sócio:</span>
        <div className="w-56"><ParticipantsFilter value={partFilter} onChange={setPartFilter} /></div>
        {partFilter.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setPartFilter([])}>Limpar</Button>
        )}
        <div className="ml-auto">
          <Button size="sm" variant="outline" disabled={filtered.length === 0} onClick={() => {
            const csv = toCSV(filtered, [
              { key: "description", label: "Descrição" },
              { key: "category", label: "Categoria" },
              { key: "supplier", label: "Fornecedor" },
              { key: "participants", label: "Sócios", get: (r: any) => participantsLabel(r.participants) },
              { key: "due_date", label: "Vencimento" },
              { key: "paid_date", label: "Pagamento" },
              { key: "amount", label: "Valor" },
              { key: "status", label: "Status" },
            ]);
            downloadCSV(`custos-${partFilter.join("-") || "todos"}.csv`, csv);
          }}><Download className="mr-2 h-4 w-4" />Exportar CSV</Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        {isLoading ? <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
          : filtered.length === 0 ? <EmptyState title="Sem custos" />
          : <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead><TableHead>Categoria</TableHead>
                <TableHead>Fornecedor</TableHead><TableHead>Sócios</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Valor</TableHead><TableHead>Status</TableHead><TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.description}</TableCell>
                  <TableCell><Badge variant="outline">{r.category}</Badge></TableCell>
                  <TableCell>{r.supplier ?? "—"}</TableCell>
                  <TableCell><ParticipantsBadges value={r.participants} /></TableCell>
                  <TableCell>{formatDate(r.due_date)}</TableCell>
                  <TableCell>{formatBRL(r.amount)}</TableCell>
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

function FormDialog({ editing, clients, projects, onSubmit, saving }: any) {
  const [form, setForm] = useState<any>(() => editing ?? {
    description: "", category: "mensagens", supplier: "", amount: "",
    status: "pendente", client_id: "", project_id: "", due_date: "", paid_date: "",
    is_recurring: false, recurrence_type: "", notes: "", participants: [],
  });
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>{editing ? "Editar custo" : "Novo custo"}</DialogTitle></DialogHeader>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label>Descrição</Label><Input value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} /></div>
        <div><Label>Categoria</Label>
          <Select value={form.category} onValueChange={(v) => set("category", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Fornecedor</Label><Input value={form.supplier ?? ""} onChange={(e) => set("supplier", e.target.value)} /></div>
        <div><Label>Valor</Label><Input type="number" step="0.01" value={form.amount ?? ""} onChange={(e) => set("amount", e.target.value)} /></div>
        <div><Label>Status</Label>
          <Select value={form.status ?? "pendente"} onValueChange={(v) => set("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
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
        <div><Label>Vencimento</Label><Input type="date" value={form.due_date ?? ""} onChange={(e) => set("due_date", e.target.value)} /></div>
        <div><Label>Pagamento</Label><Input type="date" value={form.paid_date ?? ""} onChange={(e) => set("paid_date", e.target.value)} /></div>
        <div className="sm:col-span-2">
          <ParticipantsSelect
            value={(form.participants ?? []) as Participant[]}
            onChange={(v) => set("participants", v)}
            label="Sócios participantes"
          />
        </div>
        <div className="flex items-center gap-2"><Switch checked={!!form.is_recurring} onCheckedChange={(v) => set("is_recurring", v)} /><Label>Recorrente</Label></div>
        {form.is_recurring && <div><Label>Recorrência</Label><Input placeholder="mensal, anual…" value={form.recurrence_type ?? ""} onChange={(e) => set("recurrence_type", e.target.value)} /></div>}
        <div className="sm:col-span-2"><Label>Notas</Label><Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></div>
      </div>
      <DialogFooter><Button disabled={saving} onClick={() => onSubmit({ ...form, amount: Number(form.amount || 0), participants: form.participants ?? [] })}>Salvar</Button></DialogFooter>
    </DialogContent>
  );
}
