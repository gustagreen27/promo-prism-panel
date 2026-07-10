import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Download } from "lucide-react";
import { toCSV, downloadCSV, participantsLabel } from "@/lib/csv";
import { PageHeader } from "@/components/admin/page-header";
import { FINANCEIRO_TABS } from "@/components/admin/hub-tabs";
import { EmptyState } from "@/components/admin/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDate } from "@/lib/format";
import { listRevenues, createRevenue, updateRevenue, deleteRevenue } from "@/lib/revenues.functions";
import { listClients } from "@/lib/clients.functions";
import { listProjects } from "@/lib/projects.functions";
import {
  ParticipantsBadges,
  ParticipantsSelect,
  ParticipantsFilter,
  matchesParticipants,
  type Participant,
} from "@/components/participants";

export const Route = createFileRoute("/_authenticated/admin/faturamento")({
  head: () => ({ meta: [{ title: "Faturamento — Painel" }] }),
  component: Page,
});

type Row = any;

const STATUS = ["pendente", "pago", "atrasado", "cancelado"] as const;
const statusColor: Record<string, string> = {
  pago: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  pendente: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  atrasado: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  cancelado: "bg-muted text-muted-foreground",
};

function Page() {
  const list = useServerFn(listRevenues);
  const clientsFn = useServerFn(listClients);
  const projectsFn = useServerFn(listProjects);
  const create = useServerFn(createRevenue);
  const update = useServerFn(updateRevenue);
  const remove = useServerFn(deleteRevenue);
  const qc = useQueryClient();

  const { data = [], isLoading } = useQuery({ queryKey: ["revenues"], queryFn: () => list() });
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => clientsFn() });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => projectsFn() });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [partFilter, setPartFilter] = useState<Participant[]>([]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["revenues"] });
  const saveMut = useMutation({
    mutationFn: async (payload: any) => (editing ? update({ data: { id: editing.id, ...payload } }) : create({ data: payload })),
    onSuccess: () => { toast.success(editing ? "Atualizado" : "Lançado"); setOpen(false); setEditing(null); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar"),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { toast.success("Removido"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao remover"),
  });

  const filtered = data.filter((r: Row) => matchesParticipants(r, partFilter));
  const total = filtered.reduce((s: number, r: Row) => s + Number(r.amount ?? 0), 0);
  const paid = filtered.filter((r: Row) => r.status === "pago").reduce((s: number, r: Row) => s + Number(r.amount ?? 0), 0);
  const pending = filtered.filter((r: Row) => r.status !== "pago" && r.status !== "cancelado")
    .reduce((s: number, r: Row) => s + Number(r.amount ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Faturamento"
        description="Receitas e recebimentos."
        actions={
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Novo lançamento</Button>
            </DialogTrigger>
            <FormDialog
              editing={editing}
              clients={clients}
              projects={projects}
              onSubmit={(p) => saveMut.mutate(p)}
              saving={saveMut.isPending}
            />
          </Dialog>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Total" value={formatBRL(total)} />
        <Stat label="Recebido" value={formatBRL(paid)} tone="green" />
        <Stat label="A receber" value={formatBRL(pending)} tone="amber" />
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
              { key: "client", label: "Cliente", get: (r: any) => r.client?.name ?? "" },
              { key: "participants", label: "Sócios", get: (r: any) => participantsLabel(r.participants) },
              { key: "issue_date", label: "Emissão" },
              { key: "due_date", label: "Vencimento" },
              { key: "paid_date", label: "Pagamento" },
              { key: "amount", label: "Valor" },
              { key: "status", label: "Status" },
              { key: "payment_method", label: "Método" },
            ]);
            downloadCSV(`faturamento-${partFilter.join("-") || "todos"}.csv`, csv);
          }}><Download className="mr-2 h-4 w-4" />Exportar CSV</Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
        ) : filtered.length === 0 ? (
          <EmptyState title="Sem lançamentos" description="Crie o primeiro faturamento." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Sócios</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r: Row) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.description}</TableCell>
                  <TableCell>{r.client?.name ?? "—"}</TableCell>
                  <TableCell><ParticipantsBadges value={r.participants} /></TableCell>
                  <TableCell>{formatDate(r.due_date)}</TableCell>
                  <TableCell>{formatBRL(r.amount)}</TableCell>
                  <TableCell>
                    <Badge className={statusColor[r.status] ?? "bg-muted"} variant="secondary">{r.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => confirm("Remover?") && delMut.mutate(r.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "green" | "amber" }) {
  const colors = tone === "green" ? "text-emerald-600 dark:text-emerald-400"
    : tone === "amber" ? "text-amber-600 dark:text-amber-400" : "text-foreground";
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${colors}`}>{value}</p>
    </div>
  );
}

function FormDialog({ editing, clients, projects, onSubmit, saving }: {
  editing: Row | null; clients: any[]; projects: any[];
  onSubmit: (data: any) => void; saving: boolean;
}) {
  const [form, setForm] = useState<any>(() => editing ?? {
    description: "", amount: "", status: "pendente",
    client_id: "", project_id: "", due_date: "", paid_date: "", issue_date: "",
    payment_method: "", notes: "", participants: [],
  });
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{editing ? "Editar lançamento" : "Novo lançamento"}</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>Descrição</Label>
          <Input value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} />
        </div>
        <div>
          <Label>Valor (R$)</Label>
          <Input type="number" step="0.01" value={form.amount ?? ""} onChange={(e) => set("amount", e.target.value)} />
        </div>
        <div>
          <Label>Status</Label>
          <Select value={form.status ?? "pendente"} onValueChange={(v) => set("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Cliente</Label>
          <Select value={form.client_id ?? ""} onValueChange={(v) => set("client_id", v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Projeto</Label>
          <Select value={form.project_id ?? ""} onValueChange={(v) => set("project_id", v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {projects.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Emissão</Label>
          <Input type="date" value={form.issue_date ?? ""} onChange={(e) => set("issue_date", e.target.value)} />
        </div>
        <div>
          <Label>Vencimento</Label>
          <Input type="date" value={form.due_date ?? ""} onChange={(e) => set("due_date", e.target.value)} />
        </div>
        <div>
          <Label>Pagamento</Label>
          <Input type="date" value={form.paid_date ?? ""} onChange={(e) => set("paid_date", e.target.value)} />
        </div>
        <div>
          <Label>Método</Label>
          <Input value={form.payment_method ?? ""} onChange={(e) => set("payment_method", e.target.value)} placeholder="PIX, boleto…" />
        </div>
        <div className="sm:col-span-2">
          <ParticipantsSelect
            value={(form.participants ?? []) as Participant[]}
            onChange={(v) => set("participants", v)}
            label="Sócios participantes"
          />
        </div>
        <div className="sm:col-span-2">
          <Label>Notas</Label>
          <Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button disabled={saving} onClick={() => onSubmit({
          ...form,
          amount: Number(form.amount || 0),
          participants: form.participants ?? [],
        })}>Salvar</Button>
      </DialogFooter>
    </DialogContent>
  );
}
