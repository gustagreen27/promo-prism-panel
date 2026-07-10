import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { FINANCEIRO_TABS } from "@/components/admin/hub-tabs";
import { EmptyState } from "@/components/admin/empty-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatPercent } from "@/lib/format";
import { listClosings, generateClosing, deleteClosing } from "@/lib/closings.functions";

export const Route = createFileRoute("/_authenticated/admin/fechamento")({
  head: () => ({ meta: [{ title: "Fechamento — Painel" }] }),
  component: Page,
});

const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function Page() {
  const list = useServerFn(listClosings);
  const gen = useServerFn(generateClosing);
  const remove = useServerFn(deleteClosing);
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ["closings"], queryFn: () => list() });
  const [open, setOpen] = useState(false);
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const genMut = useMutation({
    mutationFn: () => gen({ data: { month, year } }),
    onSuccess: () => { toast.success("Fechamento gerado"); setOpen(false); qc.invalidateQueries({ queryKey: ["closings"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const delMut = useMutation({ mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { toast.success("Removido"); qc.invalidateQueries({ queryKey: ["closings"] }); } });

  return (
    <>
      <PageHeader tabs={FINANCEIRO_TABS} title="Fechamento" description="Consolidados mensais de receita, custo e mensagens." actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Gerar fechamento</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Gerar fechamento</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Mês</Label>
                <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Ano</Label><Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /></div>
            </div>
            <DialogFooter><Button disabled={genMut.isPending} onClick={() => genMut.mutate()}>Gerar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      } />
      <div className="rounded-xl border bg-card">
        {isLoading ? <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
          : data.length === 0 ? <EmptyState title="Sem fechamentos" description="Gere o primeiro fechamento mensal." />
          : <Table>
            <TableHeader><TableRow>
              <TableHead>Período</TableHead><TableHead>Receita</TableHead><TableHead>Custo</TableHead>
              <TableHead>Lucro</TableHead><TableHead>Margem</TableHead><TableHead>Mensagens</TableHead><TableHead>Status</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {data.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{MONTHS[r.month - 1]}/{r.year}</TableCell>
                  <TableCell>{formatBRL(r.total_revenue)}</TableCell>
                  <TableCell>{formatBRL(r.total_cost)}</TableCell>
                  <TableCell className={Number(r.net_profit) >= 0 ? "text-emerald-600" : "text-rose-600"}>{formatBRL(r.net_profit)}</TableCell>
                  <TableCell>{formatPercent(Number(r.margin))}</TableCell>
                  <TableCell>{r.total_messages} ({r.delivered_messages}✓ / {r.failed_messages}✗)</TableCell>
                  <TableCell><Badge variant="secondary">{r.status}</Badge></TableCell>
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
