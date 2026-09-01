import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, Wallet, Users, CircleDollarSign, Plus, Pencil, Trash2 } from "lucide-react";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { adminListClientAccounts, adminAddCredits, adminCreateClientAccount, adminSetCustomPrice, adminUpdateClientAccount, adminDeleteClientAccount } from "@/lib/billing.functions";
import { adminListWorkspaceUsers, adminAddWorkspaceUser, adminUpdateWorkspaceUser, adminRemoveWorkspaceUser } from "@/lib/workspace-users.functions";

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
  const [editTarget, setEditTarget] = useState<any>(null);
  const [editForm, setEditForm] = useState({ name: "", slug: "", plan: "", status: "active", owner_name: "", owner_password: "" });
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [usersTarget, setUsersTarget] = useState<any>(null);
  const updateAccountFn = useServerFn(adminUpdateClientAccount);
  const deleteAccountFn = useServerFn(adminDeleteClientAccount);

  const updateAccount = useMutation({
    mutationFn: () => updateAccountFn({ data: {
      workspace_id: editTarget.id,
      name: editForm.name.trim() || null,
      slug: editForm.slug.trim() || null,
      plan: editForm.plan.trim() || null,
      status: (editForm.status === "blocked" ? "blocked" : "active") as "active" | "blocked",
      owner_name: editForm.owner_name.trim() || null,
      owner_password: editForm.owner_password.trim() || null,
    } }),
    onSuccess: () => {
      toast.success("Conta atualizada");
      qc.invalidateQueries({ queryKey: ["admin-client-accounts"] });
      setEditTarget(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao atualizar conta"),
  });

  const deleteAccount = useMutation({
    mutationFn: () => deleteAccountFn({ data: { workspace_id: deleteTarget.id, delete_owner_user: true } }),
    onSuccess: () => {
      toast.success("Conta excluída");
      qc.invalidateQueries({ queryKey: ["admin-client-accounts"] });
      setDeleteTarget(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao excluir conta"),
  });

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

  // ---- Preço por conta ----
  const setPrice = useServerFn(adminSetCustomPrice);
  const [priceTarget, setPriceTarget] = useState<any>(null);
  const [priceStr, setPriceStr] = useState("");

  const savePrice = useMutation({
    mutationFn: () => {
      const raw = priceStr.trim();
      const cents = raw === ""
        ? null
        : Math.round(Number(raw.replace(/\./g, "").replace(",", ".")) * 100);
      if (cents !== null && (!Number.isFinite(cents) || cents <= 0)) {
        throw new Error("Informe um preço válido");
      }
      return setPrice({ data: { workspace_id: priceTarget.id, custom_price_cents: cents } });
    },
    onSuccess: () => {
      toast.success("Preço atualizado");
      qc.invalidateQueries({ queryKey: ["admin-client-accounts"] });
      setPriceTarget(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar preço"),
  });


  // ---- Criar conta ----
  const createAccount = useServerFn(adminCreateClientAccount);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", plan: "starter", owner_email: "", owner_name: "", owner_password: "", initial_credits: "" });
  const setField = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const create = useMutation({
    mutationFn: () => createAccount({ data: {
      name: form.name.trim(),
      slug: form.slug.trim() || null,
      plan: form.plan.trim() || null,
      owner_email: form.owner_email.trim(),
      owner_name: form.owner_name.trim() || null,
      owner_password: form.owner_password.trim() || null,
      initial_credits: form.initial_credits ? Math.round(Number(form.initial_credits.replace(/\D/g, ""))) : null,
    } }),
    onSuccess: (res: any) => {
      toast.success(
        res?.generated_password
          ? `Conta criada. Senha temporária: ${res.generated_password}`
          : "Conta criada com sucesso",
        { duration: res?.generated_password ? 20000 : 4000 },
      );
      qc.invalidateQueries({ queryKey: ["admin-client-accounts"] });
      setCreateOpen(false);
      setForm({ name: "", slug: "", plan: "starter", owner_email: "", owner_name: "", owner_password: "", initial_credits: "" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao criar conta"),
  });

  return (
    <>
      <PageHeader
        tabs={CLIENTES_TABS}
        title="Contas e créditos"
        description="Veja todas as contas de clientes, o saldo em créditos e adicione ou remova créditos."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nova conta
          </Button>
        }
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova conta de cliente</DialogTitle>
            <DialogDescription>
              Cria a conta, o usuário responsável (se ainda não existir) e, opcionalmente, créditos iniciais.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Nome da conta *</Label>
              <Input value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="Ex.: Magistrar Cursos" />
            </div>
            <div>
              <Label>Slug (opcional)</Label>
              <Input value={form.slug} onChange={(e) => setField("slug", e.target.value)} placeholder="magistrar" />
            </div>
            <div>
              <Label>Plano</Label>
              <Input value={form.plan} onChange={(e) => setField("plan", e.target.value)} placeholder="starter" />
            </div>
            <div>
              <Label>E-mail do responsável *</Label>
              <Input type="email" value={form.owner_email} onChange={(e) => setField("owner_email", e.target.value)} placeholder="cliente@empresa.com" />
            </div>
            <div>
              <Label>Nome do responsável</Label>
              <Input value={form.owner_name} onChange={(e) => setField("owner_name", e.target.value)} placeholder="João Silva" />
            </div>
            <div>
              <Label>Senha (opcional)</Label>
              <Input value={form.owner_password} onChange={(e) => setField("owner_password", e.target.value)} placeholder="Gerada automaticamente" />
            </div>
            <div>
              <Label>Créditos iniciais (msgs)</Label>
              <Input value={form.initial_credits} onChange={(e) => setField("initial_credits", e.target.value.replace(/\D/g, ""))} placeholder="0" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => create.mutate()}
              disabled={create.isPending || form.name.trim().length < 2 || !form.owner_email.includes("@")}
            >
              {create.isPending ? "Criando…" : "Criar conta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


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
                      <Button size="sm" onClick={() => openDialog(a, "add")}>Adicionar mensagens</Button>
                      <Button size="sm" variant="outline" className="ml-2" onClick={() => openDialog(a, "remove")}>Remover</Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-2"
                        onClick={() => {
                          setPriceTarget(a);
                          setPriceStr((Number(a.unit_price_cents) / 100).toFixed(2).replace(".", ","));
                        }}
                      >
                        Preço
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="ml-1"
                        aria-label="Editar conta"
                        onClick={() => {
                          setEditTarget(a);
                          setEditForm({
                            name: a.name ?? "",
                            slug: a.slug ?? "",
                            plan: a.plan ?? "",
                            status: a.blocked_at ? "blocked" : "active",
                            owner_name: a.owner_name ?? "",
                            owner_password: "",
                          });
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        aria-label="Excluir conta"
                        onClick={() => setDeleteTarget(a)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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

      <Dialog open={!!priceTarget} onOpenChange={(v) => !v && setPriceTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Preço por mensagem — {priceTarget?.name}</DialogTitle>
            <DialogDescription>
              Deixe em branco para usar o preço padrão do sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Preço (R$ por mensagem)</Label>
            <Input
              inputMode="decimal"
              value={priceStr}
              onChange={(e) => setPriceStr(e.target.value)}
              placeholder="0,20"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPriceTarget(null)}>Cancelar</Button>
            <Button onClick={() => savePrice.mutate()} disabled={savePrice.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!editTarget} onOpenChange={(v) => !v && setEditTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar conta — {editTarget?.name}</DialogTitle>
            <DialogDescription>Atualize os dados da conta e do responsável.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Nome da conta</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>Slug</Label>
              <Input value={editForm.slug} onChange={(e) => setEditForm((f) => ({ ...f, slug: e.target.value }))} />
            </div>
            <div>
              <Label>Plano</Label>
              <Input value={editForm.plan} onChange={(e) => setEditForm((f) => ({ ...f, plan: e.target.value }))} />
            </div>
            <div>
              <Label>Nome do responsável</Label>
              <Input value={editForm.owner_name} onChange={(e) => setEditForm((f) => ({ ...f, owner_name: e.target.value }))} />
            </div>
            <div>
              <Label>Nova senha (opcional)</Label>
              <Input value={editForm.owner_password} onChange={(e) => setEditForm((f) => ({ ...f, owner_password: e.target.value }))} placeholder="mín. 8 caracteres" />
            </div>
            <div className="sm:col-span-2 flex gap-2">
              <Button size="sm" variant={editForm.status === "active" ? "default" : "outline"} onClick={() => setEditForm((f) => ({ ...f, status: "active" }))}>Ativa</Button>
              <Button size="sm" variant={editForm.status === "blocked" ? "destructive" : "outline"} onClick={() => setEditForm((f) => ({ ...f, status: "blocked" }))}>Bloqueada</Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button onClick={() => updateAccount.mutate()} disabled={updateAccount.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir conta — {deleteTarget?.name}</DialogTitle>
            <DialogDescription>
              Isso remove definitivamente a conta, o usuário responsável e todos os dados vinculados (disparos, contatos, listas, conexões, créditos e histórico). Não é possível desfazer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteAccount.mutate()} disabled={deleteAccount.isPending}>
              {deleteAccount.isPending ? "Excluindo…" : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>

  );
}
