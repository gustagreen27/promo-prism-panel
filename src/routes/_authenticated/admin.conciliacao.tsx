import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { adminReconcileWallets } from "@/lib/billing.functions";
import { AlertTriangle, CheckCircle2, Download, Loader2, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/conciliacao")({
  head: () => ({
    meta: [
      { title: "Conciliação de créditos — Admin next DISPAROS" },
      { name: "description", content: "Compare saldo atual, histórico de transações e créditos disponíveis por empresa." },
      { property: "og:title", content: "Conciliação de créditos — Admin next DISPAROS" },
      { property: "og:description", content: "Compare saldo atual, histórico de transações e créditos disponíveis por empresa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const nf = (n: number) => Math.round(n).toLocaleString("pt-BR");
const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Page() {
  const fn = useServerFn(adminReconcileWallets);
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["admin-reconcile-wallets"],
    queryFn: () => fn(),
    staleTime: 15_000,
  });

  const [q, setQ] = useState("");
  const [onlyDiff, setOnlyDiff] = useState(false);

  const rows = useMemo(() => {
    let list = ((data as any)?.rows ?? []) as any[];
    if (onlyDiff) list = list.filter((r) => !r.ok);
    const term = q.trim().toLowerCase();
    if (term) {
      list = list.filter(
        (r) =>
          (r.workspace_name ?? "").toLowerCase().includes(term) ||
          (r.slug ?? "").toLowerCase().includes(term) ||
          r.workspace_id.includes(term),
      );
    }
    return list;
  }, [data, q, onlyDiff]);

  function exportCsv() {
    const header = [
      "workspace_id", "empresa", "slug", "preco_unitario_centavos",
      "saldo_centavos", "reservado_centavos", "disponivel_centavos", "creditos_disponiveis",
      "soma_transacoes_centavos", "qtd_transacoes", "ultimo_saldo_apos_centavos",
      "divergencia_transacoes_centavos", "divergencia_auditoria_centavos", "status",
    ];
    const lines = rows.map((r) => [
      r.workspace_id, r.workspace_name ?? "", r.slug ?? "", r.unit_price_cents,
      r.balance_cents, r.reserved_cents, r.available_cents, r.available_credits,
      r.tx_sum_cents, r.tx_count, r.last_balance_after_cents ?? "",
      r.diff_tx_cents, r.diff_audit_cents, r.ok ? "OK" : "DIVERGENTE",
    ]);
    const csv = [header, ...lines]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `conciliacao-creditos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const diverging = (data as any)?.diverging ?? 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Conciliação de créditos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Compara, por empresa, o saldo atual da carteira, a soma do histórico de transações e
            os créditos disponíveis — todos pelo mesmo identificador de workspace.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Atualizar
          </Button>
          <Button size="sm" onClick={exportCsv} disabled={!rows.length}>
            <Download className="mr-2 h-4 w-4" /> Exportar CSV
          </Button>
        </div>
      </header>

      {data && (
        <div
          className={`flex items-center gap-2 rounded-lg border p-4 text-sm ${
            diverging ? "border-destructive/50 bg-destructive/10" : "border-emerald-500/40 bg-emerald-500/10"
          }`}
        >
          {diverging ? <AlertTriangle className="h-4 w-4 text-destructive" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          <span>
            {diverging
              ? `${diverging} empresa(s) com divergência entre saldo e histórico.`
              : "Todas as carteiras estão conciliadas com o histórico de transações."}{" "}
            <span className="text-muted-foreground">
              {(data as any).total} empresas · atualizado em{" "}
              {new Date((data as any).generated_at).toLocaleString("pt-BR")}
            </span>
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar empresa, slug ou ID…"
          className="h-9 w-72"
        />
        <Button variant={onlyDiff ? "default" : "outline"} size="sm" onClick={() => setOnlyDiff((v) => !v)}>
          Somente divergentes
        </Button>
      </div>

      <Card className="rounded-xl">
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Empresa</th>
                <th className="px-4 py-3 text-right">Saldo atual</th>
                <th className="px-4 py-3 text-right">Reservado</th>
                <th className="px-4 py-3 text-right">Disponível</th>
                <th className="px-4 py-3 text-right">Créditos</th>
                <th className="px-4 py-3 text-right">Σ transações</th>
                <th className="px-4 py-3 text-right">Δ saldo × histórico</th>
                <th className="px-4 py-3 text-right">Δ auditoria</th>
                <th className="px-4 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                    {isFetching ? "Carregando…" : "Nenhuma empresa encontrada."}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.workspace_id} className={r.ok ? "" : "bg-destructive/5"}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.workspace_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.slug ?? r.workspace_id} · {r.tx_count} mov. · {brl(r.unit_price_cents)}/msg
                        {!r.has_wallet && " · sem carteira"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{brl(r.balance_cents)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{brl(r.reserved_cents)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{brl(r.available_cents)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{nf(r.available_credits)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{brl(r.tx_sum_cents)}</td>
                    <td className={`px-4 py-3 text-right tabular-nums ${r.diff_tx_cents ? "font-semibold text-destructive" : ""}`}>
                      {brl(r.diff_tx_cents)}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums ${r.diff_audit_cents ? "font-semibold text-destructive" : ""}`}>
                      {brl(r.diff_audit_cents)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Badge variant={r.ok ? "secondary" : "destructive"}>{r.ok ? "OK" : "Divergente"}</Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
