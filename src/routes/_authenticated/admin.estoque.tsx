import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { FINANCEIRO_TABS } from "@/components/admin/hub-tabs";
import { EmptyState } from "@/components/admin/empty-state";
import { ErrorCard } from "@/components/admin/query-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDate, formatNumber } from "@/lib/format";
import { listStock, createStockEntry, deleteStockEntry } from "@/lib/stock.functions";

export const Route = createFileRoute("/_authenticated/admin/estoque")({
  head: () => ({ meta: [{ title: "Estoque de Mensagens — Painel" }] }),
  component: Page,
});

function Page() {
  const list = useServerFn(listStock);
  const create = useServerFn(createStockEntry);
  const remove = useServerFn(deleteStockEntry);
  const qc = useQueryClient();
  const stockQuery = useQuery({ queryKey: ["stock"], queryFn: () => list() });
  const data = stockQuery.data ?? [];
  const isLoading = stockQuery.isLoading;
  const [open, setOpen] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["stock"] });
  const saveMut = useMutation({
    mutationFn: (p: any) => create({ data: p }),
    onSuccess: () => { toast.success("Lançado"); setOpen(false); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const delMut = useMutation({ mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { toast.success("Removido"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao remover") });

  const saldo = data.reduce((s: number, r: any) =>
    s + (r.type === "entrada" ? Number(r.quantity) : -Number(r.quantity)), 0);
  const investido = data.filter((r: any) => r.type === "entrada")
    .reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);

  return (
    <>
      <PageHeader tabs={FINANCEIRO_TABS} title="Estoque de Mensagens" description="Saldo de envios disponíveis." actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Novo lançamento</Button></DialogTrigger>
          <FormDialog onSubmit={(p: any) => saveMut.mutate(p)} saving={saveMut.isPending} />
        </Dialog>
      } />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Saldo atual</p>
          <p className="mt-1 text-2xl font-semibold">{formatNumber(saldo)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Total investido</p>
          <p className="mt-1 text-2xl font-semibold">{formatBRL(investido)}</p>
        </div>
      </div>
      <div className="rounded-xl border bg-card">
        {stockQuery.error ? <ErrorCard error={stockQuery.error} onRetry={() => stockQuery.refetch()} />
          : isLoading ? <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
          : data.length === 0 ? <EmptyState title="Nenhum lançamento encontrado" />
          : <Table>
            <TableHeader><TableRow>
              <TableHead>Data</TableHead><TableHead>Tipo</TableHead>
              <TableHead>Quantidade</TableHead><TableHead>Valor</TableHead>
              <TableHead>Fornecedor</TableHead><TableHead>Origem</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {data.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell>{formatDate(r.created_at)}</TableCell>
                  <TableCell><Badge variant={r.type === "entrada" ? "default" : "secondary"}>{r.type}</Badge></TableCell>
                  <TableCell>{formatNumber(r.quantity)}</TableCell>
                  <TableCell>{formatBRL(r.amount)}</TableCell>
                  <TableCell>{r.supplier ?? "—"}</TableCell>
                  <TableCell>{r.source ?? "—"}</TableCell>
                  <TableCell className="text-right">
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

function FormDialog({ onSubmit, saving }: any) {
  const [form, setForm] = useState<any>({ type: "entrada", quantity: "", amount: "", supplier: "", source: "", notes: "" });
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Novo lançamento</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Tipo</Label>
          <Select value={form.type} onValueChange={(v) => set("type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="entrada">Entrada</SelectItem>
              <SelectItem value="saida">Saída</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>Quantidade</Label><Input type="number" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} /></div>
        <div><Label>Valor</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} /></div>
        <div><Label>Fornecedor</Label><Input value={form.supplier} onChange={(e) => set("supplier", e.target.value)} /></div>
        <div className="col-span-2"><Label>Origem</Label><Input value={form.source} onChange={(e) => set("source", e.target.value)} placeholder="Compra, ajuste, campanha…" /></div>
        <div className="col-span-2"><Label>Notas</Label><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
      </div>
      <DialogFooter><Button disabled={saving} onClick={() => onSubmit({
        ...form, quantity: Number(form.quantity || 0), amount: Number(form.amount || 0)
      })}>Salvar</Button></DialogFooter>
    </DialogContent>
  );
}
