import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  getMyWallet, listMyTransactions, listMyDeposits, createDepositCheckout,
} from "@/lib/billing.functions";
import {
  Building2, TrendingUp, TrendingDown, Loader2, ArrowUpRight, ArrowDownRight,
} from "lucide-react";

export const Route = createFileRoute("/painel/financeiro")({
  head: () => ({
    meta: [
      { title: "Créditos — Painel next DISPAROS" },
      { name: "description", content: "Acompanhe seu saldo de créditos, compras e histórico de transações." },
      { property: "og:title", content: "Créditos — Painel next DISPAROS" },
      { property: "og:description", content: "Acompanhe seu saldo de créditos, compras e histórico de transações." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const fmt = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const nf = (n: number) => Math.max(0, Math.round(n)).toLocaleString("pt-BR");

const TX_LABEL: Record<string, string> = {
  deposit: "Compra de créditos",
  message_charge: "Uso em disparo",
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

const PERIODS = [
  { key: "all", label: "Todo o período", days: 0 },
  { key: "7", label: "Últimos 7 dias", days: 7 },
  { key: "30", label: "Últimos 30 dias", days: 30 },
  { key: "90", label: "Últimos 90 dias", days: 90 },
];

const PAGE_SIZE = 8;

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
    queryFn: () => listTx({ data: { workspace_id: wsId, limit: 200 } }),
    enabled: !!wsId,
  });
  const { data: deps = [] } = useQuery({
    queryKey: ["deposits", wsId],
    queryFn: () => listDep({ data: { workspace_id: wsId } }),
    enabled: !!wsId,
  });

  const unit = w?.unit_price_cents || 15;
  const availableCredits = Math.floor((w?.available_cents ?? 0) / unit);

  const [period, setPeriod] = useState("all");
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [period]);

  const filtered = useMemo(() => {
    const days = PERIODS.find((p) => p.key === period)?.days ?? 0;
    const rows = (tx as any[]).filter((t) => t.amount_cents !== 0);
    if (!days) return rows;
    const cut = Date.now() - days * 86400000;
    return rows.filter((t) => new Date(t.created_at).getTime() >= cut);
  }, [tx, period]);

  const totals = useMemo(() => {
    let bought = 0;
    let used = 0;
    for (const t of tx as any[]) {
      const credits = Math.round(Math.abs(t.amount_cents) / unit);
      if (t.amount_cents > 0) bought += credits;
      else if (t.amount_cents < 0) used += credits;
    }
    return { bought, used };
  }, [tx, unit]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const [open, setOpen] = useState(false);
  const requiredCents = (w as any)?.required_deposit_cents ?? w?.minimum_deposit_cents ?? 15000;
  const minMessages = (w as any)?.minimum_messages ?? 2500;
  const [amountStr, setAmountStr] = useState("375,00");

  useEffect(() => {
    if (requiredCents) setAmountStr((requiredCents / 100).toFixed(2).replace(".", ","));
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
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Mensagens</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe seu saldo e histórico de transações · {fmt(unit)} por mensagem
          </p>
        </div>
      </header>

      {availableCredits < 1000 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <span className="font-semibold">Saldo baixo:</span>{" "}
          restam <span className="font-semibold tabular-nums">{nf(availableCredits)}</span> mensagens.
          Recarregue para não interromper seus disparos.
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Saldo por empresa
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="rounded-xl">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                {workspace?.name ?? "Minha empresa"}
              </div>
              <div className="mt-3 text-3xl font-bold tabular-nums text-emerald-600">
                {nf(availableCredits)}
              </div>
              <div className="text-sm text-muted-foreground">mensagens disponíveis</div>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />
                  {nf(totals.bought)} compradas
                </span>
                <span className="inline-flex items-center gap-1">
                  <ArrowDownRight className="h-3.5 w-3.5 text-orange-500" />
                  {nf(totals.used)} usadas
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="rounded-xl">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4 text-emerald-600" /> Total Comprado
            </div>
            <div className="mt-2 text-2xl font-bold tabular-nums text-emerald-600">
              {nf(totals.bought)}
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingDown className="h-4 w-4 text-orange-500" /> Total Utilizado
            </div>
            <div className="mt-2 text-2xl font-bold tabular-nums text-orange-500">
              {nf(totals.used)}
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Building2 className="h-4 w-4 text-muted-foreground" /> Custo por mensagem
            </div>
            <div className="mt-2 text-2xl font-bold tabular-nums">{fmt(unit)}</div>
            <p className="mt-1 text-xs text-muted-foreground">1 mensagem = 1 crédito</p>
          </CardContent>
        </Card>
      </div>


      <Card className="rounded-xl">
        <CardContent className="p-5">
          <h2 className="text-lg font-semibold">Histórico de Transações</h2>
          <div className="mt-4">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="h-10 w-[220px]">
                <SelectValue placeholder="Selecionar período" />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="mt-4 divide-y border-t">
            {pageRows.length === 0 ? (
              <p className="py-8 text-sm text-muted-foreground">Sem movimentações no período.</p>
            ) : (
              pageRows.map((t: any) => {
                const positive = t.amount_cents > 0;
                const credits = Math.round(Math.abs(t.amount_cents) / unit);
                return (
                  <div key={t.id} className="flex items-center justify-between gap-4 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                          positive ? "bg-emerald-500/10 text-emerald-600" : "bg-orange-500/10 text-orange-500"
                        }`}
                      >
                        {positive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {TX_LABEL[t.type] ?? t.description ?? t.type}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {(workspace?.name ?? "Conta")} · {new Date(t.created_at).toLocaleString("pt-BR", {
                            day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
                          })}
                        </div>
                      </div>
                    </div>
                    <div
                      className={`shrink-0 text-sm font-semibold tabular-nums ${
                        positive ? "text-emerald-600" : "text-orange-500"
                      }`}
                    >
                      {positive ? "+" : "−"}{nf(credits)}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <span className="text-xs text-muted-foreground">
              Página {page + 1} de {pageCount} · {filtered.length} registros
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pageCount - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Seguinte
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {deps.length > 0 && (
        <Card className="rounded-xl">
          <CardContent className="p-5">
            <h2 className="text-lg font-semibold">Compras</h2>
            <div className="mt-4 divide-y border-t">
              {deps.map((d: any) => (
                <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{fmt(d.amount_cents)}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(d.created_at).toLocaleString("pt-BR")} · {d.payment_method ?? "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={d.status === "paid" ? "default" : d.status === "pending" ? "secondary" : "destructive"}>
                      {DEP_LABEL[d.status] ?? d.status}
                    </Badge>
                    {d.receipt_url && (
                      <a href={d.receipt_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                        Recibo
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Comprar créditos</DialogTitle>
            <DialogDescription>
              Depósito mínimo para o seu plano: <strong>{fmt(requiredCents)}</strong> ({minMessages.toLocaleString("pt-BR")} mensagens × {fmt(unit)}).
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
