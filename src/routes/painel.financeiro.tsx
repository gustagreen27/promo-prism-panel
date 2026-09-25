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
  listMyTransactions, listMyDeposits, createDepositCheckout,
} from "@/lib/billing.functions";
import { depositCode } from "@/lib/pix-brcode";
import { usePanelWorkspace, useWallet, useBalanceConsistency } from "@/lib/use-panel-workspace";
import {
  Building2, TrendingUp, TrendingDown, Loader2, ArrowUpRight, ArrowDownRight, Download, AlertTriangle,
  QrCode, Copy, MessageCircle,
} from "lucide-react";
import QRCode from "qrcode";

const brl = (cents: number) =>
  (Math.max(0, cents) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const WHATSAPP = "5562991301856";

function PixPanel({ deposit, clientId, onClose }: {
  deposit: any; clientId: string; onClose: () => void;
}) {
  const [img, setImg] = useState<string | null>(null);
  const code: string = deposit.pix_copia_cola ?? "";
  const valor = (Number(deposit.amount_cents) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const identificador = `${clientId} / ${depositCode(deposit.id)}`;

  useEffect(() => {
    if (code) QRCode.toDataURL(code, { margin: 1, width: 260 }).then(setImg).catch(() => setImg(null));
  }, [code]);

  const waText = `Olá! Fiz um Pix de R$ ${valor} para adicionar saldo à minha conta. Meu identificador é ${identificador}. Vou enviar o comprovante para conferência.`;
  const waUrl = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(waText)}`;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Pague com Pix</DialogTitle>
        <DialogDescription>
          Valor: <strong>R$ {valor}</strong> · Identificador: <span className="font-mono">{identificador}</span>
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col items-center gap-3">
        {img ? (
          <img src={img} alt="QR Code Pix" className="h-52 w-52 max-w-full rounded-lg border bg-card p-2 sm:h-56 sm:w-56" />
        ) : (
          <div className="grid h-52 w-52 place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
        )}
        <div className="w-full">
          <Label>Pix Copia e Cola</Label>
          <Input readOnly value={code} className="mt-1 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
          <Button
            variant="outline"
            className="mt-2 w-full"
            onClick={() => navigator.clipboard.writeText(code).then(() => toast.success("Código Pix copiado"))}
          >
            <Copy className="mr-2 h-4 w-4" /> Copiar código Pix
          </Button>
        </div>
        <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
          Após pagar, clique em ‘Fiz o pagamento’ e envie o comprovante pelo WhatsApp. O saldo será liberado após a conferência.
        </p>
      </div>
      <DialogFooter className="gap-2">
        <Button variant="ghost" onClick={onClose}>Fechar</Button>
        <Button asChild>
          <a href={waUrl} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="mr-2 h-4 w-4" /> Fiz o pagamento
          </a>
        </Button>
      </DialogFooter>
    </>
  );
}

export const Route = createFileRoute("/painel/financeiro")({
  head: () => ({
    meta: [
      { title: "Mensagens — Painel next DISPAROS" },
      { name: "description", content: "Acompanhe seu saldo de mensagens, compras e histórico de transações." },
      { property: "og:title", content: "Mensagens — Painel next DISPAROS" },
      { property: "og:description", content: "Acompanhe seu saldo de mensagens, compras e histórico de transações." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});


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
  // Fonte única de saldo: mesmo contexto/wallet usados pelo header do painel.
  const { workspace, workspaceId: wsId } = usePanelWorkspace();
  const qc = useQueryClient();

  const listTx = useServerFn(listMyTransactions);
  const listDep = useServerFn(listMyDeposits);
  const createDep = useServerFn(createDepositCheckout);

  const { wallet: w, unitPriceCents: unit, availableCredits } = useWallet(wsId);
  const { data: tx = [] } = useQuery({
    queryKey: ["wallet-tx", wsId],
    queryFn: () => listTx({ data: { workspace_id: wsId as string, limit: 200 } }),
    enabled: !!wsId,
    staleTime: 0,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });
  const { data: deps = [] } = useQuery({
    queryKey: ["deposits", wsId],
    queryFn: () => listDep({ data: { workspace_id: wsId as string } }),
    enabled: !!wsId,
  });


  // Aviso de depuração se o header e esta página mostrarem saldos diferentes.
  const divergence = useBalanceConsistency("financeiro", wsId ? availableCredits : null, !!wsId);

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
  const minCreditsRequired = Math.max(minMessages, Math.ceil(requiredCents / unit));
  const [amountStr, setAmountStr] = useState("2500");

  useEffect(() => {
    if (minCreditsRequired) setAmountStr(String(minCreditsRequired));
  }, [minCreditsRequired]);

  function exportCsv() {
    const header = [
      "data", "tipo", "motivo", "creditos", "sinal",
      "saldo_anterior_creditos", "saldo_posterior_creditos",
      "valor_centavos", "saldo_anterior_centavos", "saldo_posterior_centavos",
    ];
    const lines = (filtered as any[]).map((t) => {
      const credits = Math.round(Math.abs(t.amount_cents) / unit);
      return [
        new Date(t.created_at).toLocaleString("pt-BR"),
        TX_LABEL[t.type] ?? t.type,
        t.description ?? "",
        credits,
        t.amount_cents > 0 ? "+" : "-",
        t.balance_before_cents != null ? Math.floor(Number(t.balance_before_cents) / unit) : "",
        t.balance_after_cents != null ? Math.floor(Number(t.balance_after_cents) / unit) : "",
        t.amount_cents,
        t.balance_before_cents ?? "",
        t.balance_after_cents ?? "",
      ];
    });
    const csv = [header, ...lines]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `historico-creditos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const [activeDep, setActiveDep] = useState<any | null>(null);
  const [valueStr, setValueStr] = useState("");
  const valueCents = Math.round(Number((valueStr || "0").replace(/\./g, "").replace(",", ".")) * 100) || 0;
  const minCents = minCreditsRequired * unit;
  const clientId = (workspace as any)?.slug || (wsId ? String(wsId).slice(0, 8) : "");
  const deposit = useMutation({
    mutationFn: async () => {
      if (!valueCents || valueCents < minCents) {
        throw new Error(`O depósito mínimo é de ${brl(minCents)}`);
      }
      return createDep({ data: { workspace_id: wsId as string, amount_cents: valueCents } });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["deposits", wsId] });
      setActiveDep(res.deposit);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao gerar Pix"),
  });

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Créditos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe seu saldo e histórico de créditos · 1 crédito = 1 mensagem
          </p>
        </div>
        <Button onClick={() => { setActiveDep(null); setOpen(true); }} disabled={!wsId}>
          <QrCode className="mr-2 h-4 w-4" /> Depositar via Pix
        </Button>
      </header>

      {divergence && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <span className="font-semibold">Divergência de saldo detectada.</span>{" "}
            Esta página mostra <span className="tabular-nums">{nf(divergence.mine)}</span> créditos e
            a área "{divergence.surface}" mostra{" "}
            <span className="tabular-nums">{nf(divergence.credits)}</span>. Recarregue a página; se
            persistir, avise o suporte informando o horário.
          </div>
        </div>
      )}

      {availableCredits < 1000 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <span className="font-semibold">Saldo baixo:</span>{" "}
          restam <span className="font-semibold tabular-nums">{nf(availableCredits)}</span> créditos.
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
              <div className="text-sm text-muted-foreground">créditos disponíveis</div>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />
                  {nf(totals.bought)} adicionados
                </span>
                <span className="inline-flex items-center gap-1">
                  <ArrowDownRight className="h-3.5 w-3.5 text-orange-500" />
                  {nf(totals.used)} usados
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
              <TrendingUp className="h-4 w-4 text-emerald-600" /> Total adicionado
            </div>
            <div className="mt-2 text-2xl font-bold tabular-nums text-emerald-600">
              {nf(totals.bought)}
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingDown className="h-4 w-4 text-orange-500" /> Total utilizado
            </div>
            <div className="mt-2 text-2xl font-bold tabular-nums text-orange-500">
              {nf(totals.used)}
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Building2 className="h-4 w-4 text-muted-foreground" /> Saldo atual
            </div>
            <div className="mt-2 text-2xl font-bold tabular-nums" data-testid="financeiro-credits">{nf(availableCredits)}</div>
            <p className="mt-1 text-xs text-muted-foreground">1 crédito = 1 mensagem</p>
          </CardContent>
        </Card>
      </div>



      <Card className="rounded-xl">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Histórico de Transações</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={exportCsv}
              disabled={filtered.length === 0}
              data-testid="export-credits-csv"
            >
              <Download className="mr-2 h-4 w-4" /> Exportar CSV
            </Button>
          </div>
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
                        {t.description && (
                          <div className="truncate text-xs text-muted-foreground">
                            Motivo: {t.description}
                          </div>
                        )}
                        <div className="truncate text-xs text-muted-foreground">
                          {new Date(t.created_at).toLocaleString("pt-BR", {
                            day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
                          })}
                          {t.balance_after_cents != null && (
                            <>
                              {" · "}Saldo: {nf(Math.floor(Number(t.balance_before_cents ?? 0) / unit))} →{" "}
                              {nf(Math.floor(Number(t.balance_after_cents ?? 0) / unit))}
                            </>
                          )}
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
                    <div className="text-sm font-medium">{nf(Math.round(Number(d.amount_cents ?? 0) / unit))} créditos</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(d.created_at).toLocaleString("pt-BR")} · {d.payment_method ?? "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={d.status === "paid" ? "default" : d.status === "pending" ? "secondary" : "destructive"}>
                      {d.status === "pending" ? "Aguardando conferência" : DEP_LABEL[d.status] ?? d.status}
                    </Badge>
                    {d.status === "pending" && d.pix_copia_cola && (
                      <Button size="sm" variant="outline" onClick={() => { setActiveDep(d); setOpen(true); }}>
                        Ver Pix
                      </Button>
                    )}
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

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setActiveDep(null); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto">
          {activeDep ? (
            <PixPanel
              deposit={activeDep}
              clientId={clientId}
              onClose={() => { setOpen(false); setActiveDep(null); }}
            />
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Depositar via Pix</DialogTitle>
                <DialogDescription>
                  Depósito mínimo: <strong>{brl(minCents)}</strong>. O saldo é liberado após a conferência do comprovante.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Valor do depósito (R$)</Label>
                  <Input
                    inputMode="decimal"
                    value={valueStr}
                    onChange={(e) => setValueStr(e.target.value.replace(/[^\d.,]/g, ""))}
                    placeholder={(minCents / 100).toFixed(2).replace(".", ",")}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Equivale a <strong>{nf(Math.floor(valueCents / unit))}</strong> créditos
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={() => deposit.mutate()} disabled={deposit.isPending}>
                  {deposit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Gerar Pix
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
