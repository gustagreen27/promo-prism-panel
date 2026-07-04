import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  getMyWallet, listMyTransactions, listMyDeposits, createDepositCheckout,
} from "@/lib/billing.functions";
import { Wallet, TrendingUp, Clock, Plus, Loader2 } from "lucide-react";

export const Route = createFileRoute("/painel/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro — Disparos FR" }] }),
  component: Page,
});

const fmt = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const TX_LABEL: Record<string, string> = {
  deposit: "Depósito",
  message_charge: "Cobrança por mensagem",
  refund: "Reembolso",
  adjustment: "Ajuste manual",
  reservation_hold: "Reserva de saldo",
  reservation_release: "Liberação de reserva",
};

const DEP_LABEL: Record<string, string> = {
  pending: "Aguardando pagamento",
  paid: "Pago",
  failed: "Falhou",
  cancelled: "Cancelado",
  expired: "Expirado",
};

function Page() {
  const { workspace } = Route.useRouteContext() as any;
  const wsId = workspace?.id;
  const qc = useQueryClient();

  const wallet = useServerFn(getMyWallet);
  const listTx = useServerFn(listMyTransactions);
  const listDep = useServerFn(listMyDeposits);
  const createDep = useServerFn(createDepositCheckout);

  const { data: w } = useQuery({
    queryKey: ["wallet", wsId],
    queryFn: () => wallet({ data: { workspace_id: wsId } }),
    enabled: !!wsId,
  });
  const { data: tx = [] } = useQuery({
    queryKey: ["wallet-tx", wsId],
    queryFn: () => listTx({ data: { workspace_id: wsId, limit: 100 } }),
    enabled: !!wsId,
  });
  const { data: deps = [] } = useQuery({
    queryKey: ["deposits", wsId],
    queryFn: () => listDep({ data: { workspace_id: wsId } }),
    enabled: !!wsId,
  });

  const [open, setOpen] = useState(false);
  const requiredCents = (w as any)?.required_deposit_cents ?? w?.minimum_deposit_cents ?? 15000;
  const minMessages = (w as any)?.minimum_messages ?? 2500;
  const [amountStr, setAmountStr] = useState("375,00");

  useEffect(() => {
    if (requiredCents) {
      setAmountStr((requiredCents / 100).toFixed(2).replace(".", ","));
    }
  }, [requiredCents]);

  const deposit = useMutation({
    mutationFn: async () => {
      const cents = Math.round(Number(amountStr.replace(/\./g, "").replace(",", ".")) * 100);
      if (!Number.isFinite(cents) || cents < requiredCents) {
        throw new Error(`O valor mínimo para depósito é ${fmt(requiredCents)}`);
      }
      return createDep({ data: { workspace_id: wsId, amount_cents: cents } });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["deposits", wsId] });
      if (res.checkout_url) {
        window.location.href = res.checkout_url;
      } else {
        toast.success("Pedido de depósito criado", { description: res.message });
        setOpen(false);
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao criar depósito"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financeiro</h1>
          <p className="text-sm text-muted-foreground">Saldo, depósitos e histórico de cobrança.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Depositar saldo
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Wallet className="h-4 w-4" /> Saldo disponível
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{fmt(w?.available_cents ?? 0)}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {w?.unit_price_cents ? `≈ ${Math.floor((w.available_cents ?? 0) / w.unit_price_cents)} mensagens` : "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Clock className="h-4 w-4" /> Reservado em campanhas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{fmt(w?.reserved_cents ?? 0)}</div>
            <div className="mt-1 text-xs text-muted-foreground">Devolvido em caso de falha ou cancelamento</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <TrendingUp className="h-4 w-4" /> Preço por mensagem
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{fmt(w?.unit_price_cents ?? 15)}</div>
            <div className="mt-1 text-xs text-muted-foreground">Aplicado ao seu workspace</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Depósitos</CardTitle></CardHeader>
        <CardContent>
          {deps.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum depósito ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Recibo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deps.map((d: any) => (
                  <TableRow key={d.id}>
                    <TableCell>{new Date(d.created_at).toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="font-medium">{fmt(d.amount_cents)}</TableCell>
                    <TableCell>
                      <Badge variant={d.status === "paid" ? "default" : d.status === "pending" ? "secondary" : "destructive"}>
                        {DEP_LABEL[d.status] ?? d.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{d.payment_method ?? "—"}</TableCell>
                    <TableCell>
                      {d.receipt_url ? (
                        <a href={d.receipt_url} target="_blank" rel="noreferrer" className="text-primary underline">Ver</a>
                      ) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Histórico de transações</CardTitle></CardHeader>
        <CardContent>
          {tx.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem movimentações.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Saldo depois</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tx.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap">{new Date(t.created_at).toLocaleString("pt-BR")}</TableCell>
                    <TableCell><Badge variant="outline">{TX_LABEL[t.type] ?? t.type}</Badge></TableCell>
                    <TableCell className="max-w-[380px] truncate">{t.description ?? "—"}</TableCell>
                    <TableCell className={`text-right font-medium ${t.amount_cents < 0 ? "text-destructive" : t.amount_cents > 0 ? "text-emerald-600" : ""}`}>
                      {t.amount_cents === 0 ? "—" : (t.amount_cents > 0 ? "+ " : "− ") + fmt(Math.abs(t.amount_cents))}
                    </TableCell>
                    <TableCell className="text-right">{fmt(t.balance_after_cents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Depositar saldo</DialogTitle>
            <DialogDescription>
              Depósito mínimo para o seu plano: <strong>{fmt(requiredCents)}</strong> ({minMessages.toLocaleString("pt-BR")} mensagens × {fmt(w?.unit_price_cents ?? 15)}).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Valor (R$)</Label>
              <Input
                inputMode="decimal"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder={(requiredCents / 100).toFixed(2).replace(".", ",")}
              />
              <p className="mt-1 text-xs text-muted-foreground">Mínimo {fmt(requiredCents)}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => deposit.mutate()} disabled={deposit.isPending}>
              {deposit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Ir para pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
