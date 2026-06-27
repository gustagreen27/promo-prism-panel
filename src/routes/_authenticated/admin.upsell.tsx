import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatNumber, formatPercent } from "@/lib/format";
import { listUpsells, createUpsell, updateUpsell, deleteUpsell } from "@/lib/upsell.functions";
import { listClients } from "@/lib/clients.functions";
import { listProjects } from "@/lib/projects.functions";

export const Route = createFileRoute("/_authenticated/admin/upsell")({
  head: () => ({ meta: [{ title: "Upsell — Painel" }] }),
  component: Page,
});

const STATUS = ["ativa", "pausada", "encerrada"] as const;

function Page() {
  const list = useServerFn(listUpsells);
  const create = useServerFn(createUpsell);
  const update = useServerFn(updateUpsell);
  const remove = useServerFn(deleteUpsell);
  const clientsFn = useServerFn(listClients);
  const projectsFn = useServerFn(listProjects);
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ["upsells"], queryFn: () => list() });
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => clientsFn() });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => projectsFn() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["upsells"] });
  const saveMut = useMutation({
    mutationFn: async (p: any) => (editing ? update({ data: { id: editing.id, ...p } }) : create({ data: p })),
    onSuccess: () => { toast.success("Salvo"); setOpen(false); setEditing(null); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const delMut = useMutation({ mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { toast.success("Removido"); refresh(); } });

  const totalRevenue = data.reduce((s: number, r: any) => s + Number(r.revenue ?? 0), 0);
  const totalClicks = data.reduce((s: number, r: any) => s + Number(r.clicks ?? 0), 0);
  const totalConv = data.reduce((s: number, r: any) => s + Number(r.conversions ?? 0), 0);

  return (
    <>
      <PageHeader title="Upsell" description="Campanhas de upsell e conversão." actions={
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Nova campanha</Button></DialogTrigger>
          <FormDialog editing={editing} clients={clients} projects={projects} onSubmit={(p: any) => saveMut.mutate(p)} saving={saveMut.isPending} />
        </Dialog>
      } />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Receita" value={formatBRL(totalRevenue)} />
        <Stat label="Cliques" value={formatNumber(totalClicks)} />
        <Stat label="Conversões" value={`${formatNumber(totalConv)} (${formatPercent(totalClicks ? (totalConv / totalClicks) * 100 : null)})`} />
      </div>
      <div className="rounded-xl border bg-card">
        {isLoading ? <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
          : data.length === 0 ? <EmptyState title="Sem campanhas" />
          : <Table>
            <TableHeader><TableRow>
              <TableHead>Nome</TableHead><TableHead>Cliente</TableHead>
              <TableHead>Cliques</TableHead><TableHead>Conversões</TableHead>
              <TableHead>Receita</TableHead><TableHead>Status</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {data.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {r.name}
                    {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="ml-2 inline-flex"><ExternalLink className="h-3 w-3 text-muted-foreground" /></a>}
                  </TableCell>
                  <TableCell>{r.client?.name ?? "—"}</TableCell>
                  <TableCell>{formatNumber(r.clicks)}</TableCell>
                  <TableCell>{formatNumber(r.conversions)}</TableCell>
                  <TableCell>{formatBRL(r.revenue)}</TableCell>
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

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border bg-card p-4">
    <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className="mt-1 text-2xl font-semibold">{value}</p>
  </div>;
}

function FormDialog({ editing, clients, projects, onSubmit, saving }: any) {
  const [form, setForm] = useState<any>(() => editing ?? {
    name: "", url: "", status: "ativa", client_id: "", project_id: "",
    revenue: 0, clicks: 0, conversions: 0,
  });
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>{editing ? "Editar upsell" : "Nova campanha"}</DialogTitle></DialogHeader>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label>Nome</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div className="sm:col-span-2"><Label>URL</Label><Input value={form.url ?? ""} onChange={(e) => set("url", e.target.value)} placeholder="https://" /></div>
        <div><Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => set("status", v)}>
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
        <div><Label>Cliques</Label><Input type="number" value={form.clicks ?? 0} onChange={(e) => set("clicks", Number(e.target.value))} /></div>
        <div><Label>Conversões</Label><Input type="number" value={form.conversions ?? 0} onChange={(e) => set("conversions", Number(e.target.value))} /></div>
        <div className="sm:col-span-2"><Label>Receita (R$)</Label><Input type="number" step="0.01" value={form.revenue ?? 0} onChange={(e) => set("revenue", Number(e.target.value))} /></div>
      </div>
      <DialogFooter><Button disabled={saving} onClick={() => onSubmit(form)}>Salvar</Button></DialogFooter>
    </DialogContent>
  );
}
