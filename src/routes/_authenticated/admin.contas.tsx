import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, Wallet, Users, CircleDollarSign } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { CLIENTES_TABS } from "@/components/admin/hub-tabs";
import { ErrorCard } from "@/components/admin/query-state";
import { EmptyState } from "@/components/admin/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { adminListClientAccounts, adminAddCredits } from "@/lib/billing.functions";

export const Route = createFileRoute("/_authenticated/admin/contas")({
  head: () => ({
    meta: [
      { title: "Contas e créditos — Admin" },
      { name: "description", content: "Gestão de contas de clientes, saldo em créditos e adição de créditos." },
    ],
  }),
  component: Page,
});

const brl = (cents: number | null | undefined) =>
  ((cents ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("pt-BR");

function Page() {
  const listAccounts = useServerFn(adminListClientAccounts);
  const addCredits = useServerFn(adminAddCredits);
  const qc = useQueryClient();

  const accountsQuery = useQuery({ queryKey: ["admin-client-accounts"], queryFn: () => listAccounts() });
  const accounts = (accountsQuery.data ?? []) as any[];

  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<any>(null);
  const [mode, setMode] = useState<"messages" | "money">("messages");
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [qty, setQty] = useState("");
  const [description, setDescription] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) =>
      [a.name, a.slug, a.owner_name, a.owner_email].filter(Boolean).some((v: string) => v.toLowerCase().includes(q)),
    );
  }, [accounts, search]);

  const totals = useMemo(() => ({
    accounts: accounts.length,
    balance: accounts.reduce((s, a) => s + Number(a.available_cents ?? 0), 0),
    credits: accounts.reduce((s, a) => s + Number(a.credits_available ?? 0), 0),
  }), [accounts]);

  const parsedQty = Number(qty.replace(/\./g, "").replace(",", "."));
  const previewCents = target
    ? (mode === "messages" ? Math.round(parsedQty || 0) * Number(target.unit_price_cents) : Math.round((parsedQty || 0) * 100))
    : 0;

  const save = useMutation({
    mutationFn: () => addCredits({ data: {
      workspace_id: target.id,
      mode,
      quantity: parsedQty,
      direction,
      description: description.trim() || undefined,
    } }),
    onSuccess: () => {
      toast.success(direction === "add" ? "Créditos adicionados" : "Créditos removidos");
      qc.invalidateQueries({ queryKey: ["admin-client-accounts"] });
      qc.invalidateQueries({ queryKey: ["admin-all-tx"] });
      qc.invalidateQueries({ queryKey: ["admin-ws-balance"] });
      setTarget(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao lançar créditos"),
  });

  const openDialog = (a: any, dir: "add" | "remove") => {
    setTarget(a); setDirection(dir); setMode("messages"); setQty(""); setDescription("");
  };

  return (
    <>
      <PageHeader
        tabs={CLIENTES_TABS}
        title="Contas e créditos"
        description="Veja todas as contas de clientes, o saldo em créditos e adicione ou remova créditos."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Users className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-xs text-muted-foreground">Contas de clientes</div>
              <div className="text-2xl font-semibold">{num(totals.accounts)}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Wallet className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-xs text-muted-foreground">Créditos disponíveis (total)</div>
              <div className="text-2xl font-semibold">{num(totals.credits)}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <CircleDollarSign className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-xs text-muted-foreground">Saldo disponível (total)</div>
              <div className="text-2xl font-semibold">{brl(totals.balance)}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Clientes</CardTitle>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar cliente, slug ou e-mail" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          {accountsQuery.error ? (
            <ErrorCard error={accountsQuery.error} onRetry={() => accountsQuery.refetch()} />
          ) : accountsQuery.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
          ) : filtered.length === 0 ? (
            <EmptyState title="Nenhuma conta encontrada" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead className="text-right">Créditos</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="text-right">Reservado</TableHead>
                  <TableHead className="text-right">Preço/msg</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="font-medium">{a.name}</div>
                      <div className="text-xs text-muted-foreground">{a.slug} · {a.plan ?? "—"} · {num(a.members_count)} usuário(s)</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{a.owner_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{a.owner_email ?? "—"}</div>
                    </TableCell>
                    <TableCell className="text-right font-medium">{num(a.credits_available)}</TableCell>
                    <TableCell className="text-right">{brl(a.available_cents)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{brl(a.reserved_cents)}</TableCell>
                    <TableCell className="text-right">{brl(a.unit_price_cents)}</TableCell>
                    <TableCell>
                      {a.blocked_at
                        ? <Badge variant="destructive">Bloqueado</Badge>
                        : <Badge variant="secondary">{a.status ?? "ativo"}</Badge>}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="sm" onClick={() => openDialog(a, "add")}>Adicionar créditos</Button>
                      <Button size="sm" variant="outline" className="ml-2" onClick={() => openDialog(a, "remove")}>Remover</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!target} onOpenChange={(v) => !v && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {direction === "add" ? "Adicionar créditos" : "Remover créditos"} — {target?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button size="sm" variant={mode === "messages" ? "default" : "outline"} onClick={() => setMode("messages")}>Em mensagens</Button>
              <Button size="sm" variant={mode === "money" ? "default" : "outline"} onClick={() => setMode("money")}>Em R$</Button>
            </div>
            <div>
              <Label>{mode === "messages" ? "Quantidade de créditos (mensagens)" : "Valor (R$)"}</Label>
              <Input
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder={mode === "messages" ? "10000" : "1500,00"}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Preço unitário: {brl(target?.unit_price_cents)} · Equivale a{" "}
                <strong>{brl(previewCents)}</strong>
                {mode === "money" && target?.unit_price_cents
                  ? ` (~${num(Math.floor(previewCents / Number(target.unit_price_cents)))} créditos)`
                  : ""}
              </p>
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: pagamento PIX recebido" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)}>Cancelar</Button>
            <Button
              onClick={() => save.mutate()}
              disabled={save.isPending || !(parsedQty > 0)}
            >
              {direction === "add" ? "Adicionar" : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
