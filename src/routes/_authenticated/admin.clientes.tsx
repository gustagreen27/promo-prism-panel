import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { CLIENTES_TABS } from "@/components/admin/hub-tabs";
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
import { formatDate } from "@/lib/format";
import { listClients, createClient, updateClient, deleteClient } from "@/lib/clients.functions";
import { adminListAllUsers } from "@/lib/workspace-users.functions";

const ROLE_LABELS: Record<string, string> = {
  owner: "Responsável",
  admin: "Administrador",
  operator: "Operador",
  viewer: "Somente leitura",
};

export const Route = createFileRoute("/_authenticated/admin/clientes")({
  head: () => ({ meta: [{ title: "Clientes — Painel" }] }),
  component: Page,
});

const STATUS = ["ativo", "inativo", "prospect", "bloqueado"] as const;

function Page() {
  const list = useServerFn(listClients);
  const create = useServerFn(createClient);
  const update = useServerFn(updateClient);
  const remove = useServerFn(deleteClient);
  const qc = useQueryClient();
  const clientsQuery = useQuery({ queryKey: ["clients"], queryFn: () => list() });
  const { data = [], isLoading, error, refetch } = clientsQuery;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["clients"] });
  const saveMut = useMutation({
    mutationFn: async (p: any) => (editing ? update({ data: { id: editing.id, ...p } }) : create({ data: p })),
    onSuccess: () => { toast.success("Salvo"); setOpen(false); setEditing(null); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const delMut = useMutation({ mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { toast.success("Removido"); refresh(); } });

  return (
    <>
      <PageHeader tabs={CLIENTES_TABS} title="Clientes" description="Cadastro de clientes." actions={
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Novo cliente</Button></DialogTrigger>
          <FormDialog editing={editing} onSubmit={(p: any) => saveMut.mutate(p)} saving={saveMut.isPending} />
        </Dialog>
      } />
      <div className="rounded-xl border bg-card">
        {isLoading ? <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
          : error ? <ErrorCard error={error} onRetry={() => refetch()} />
          : data.length === 0 ? <EmptyState title="Sem clientes" />
          : <Table>
            <TableHeader><TableRow>
              <TableHead>Nome</TableHead><TableHead>Email</TableHead><TableHead>Telefone</TableHead>
              <TableHead>Cidade/UF</TableHead><TableHead>Status</TableHead><TableHead>Criado</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {data.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.email ?? "—"}</TableCell>
                  <TableCell>{r.phone ?? "—"}</TableCell>
                  <TableCell>{[r.city, r.state].filter(Boolean).join("/") || "—"}</TableCell>
                  <TableCell><Badge variant="secondary">{r.status ?? "ativo"}</Badge></TableCell>
                  <TableCell>{formatDate(r.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => confirm("Remover?") && delMut.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>}
      </div>

      <AllUsersSection />
    </>
  );
}

function AllUsersSection() {
  const listFn = useServerFn(adminListAllUsers);
  const q = useQuery({ queryKey: ["admin-all-users"], queryFn: () => listFn({ data: {} }) });
  const [search, setSearch] = useState("");
  const users = (q.data ?? []) as any[];
  const filtered = users.filter((u) => {
    const t = search.trim().toLowerCase();
    if (!t) return true;
    return [u.email, u.full_name, u.login_slug, ...u.memberships.map((m: any) => m.workspace_name)]
      .filter(Boolean).some((v: string) => v.toLowerCase().includes(t));
  });

  return (
    <div className="mt-8 space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Usuários cadastrados</h2>
          <p className="text-sm text-muted-foreground">Todos os logins da plataforma e a empresa de cada um.</p>
        </div>
        <Input
          className="sm:max-w-xs"
          placeholder="Buscar por e-mail, nome, usuário ou empresa…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="rounded-xl border bg-card">
        {q.isLoading ? <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
          : q.error ? <ErrorCard error={q.error} onRetry={() => q.refetch()} />
          : filtered.length === 0 ? <EmptyState title="Nenhum usuário encontrado" />
          : <Table>
            <TableHeader><TableRow>
              <TableHead>Usuário</TableHead><TableHead>Login</TableHead>
              <TableHead>Empresa(s)</TableHead><TableHead>Permissão</TableHead><TableHead>Criado</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map((u: any) => (
                <TableRow key={u.user_id}>
                  <TableCell>
                    <div className="text-sm font-medium">{u.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{u.email ?? "—"}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{u.login_slug ?? "—"}</TableCell>
                  <TableCell>
                    {u.memberships.length === 0 ? <span className="text-sm text-muted-foreground">Sem empresa</span>
                      : u.memberships.map((m: any) => (
                        <div key={m.workspace_id ?? m.workspace_name} className="text-sm">{m.workspace_name}</div>
                      ))}
                  </TableCell>
                  <TableCell>
                    {u.memberships.length === 0 ? "—"
                      : u.memberships.map((m: any, i: number) => (
                        <Badge key={i} variant="secondary" className="mr-1">{ROLE_LABELS[m.role] ?? m.role}</Badge>
                      ))}
                  </TableCell>
                  <TableCell>{formatDate(u.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>}
      </div>
    </div>
  );
}

function FormDialog({ editing, onSubmit, saving }: any) {
  const [form, setForm] = useState<any>(() => editing ?? {
    name: "", document: "", email: "", phone: "", address: "", city: "", state: "",
    status: "ativo", notes: "",
  });
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>{editing ? "Editar cliente" : "Novo cliente"}</DialogTitle></DialogHeader>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label>Nome</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div><Label>Documento</Label><Input value={form.document ?? ""} onChange={(e) => set("document", e.target.value)} /></div>
        <div><Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => set("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Email</Label><Input value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} /></div>
        <div><Label>Telefone</Label><Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></div>
        <div className="sm:col-span-2"><Label>Endereço</Label><Input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} /></div>
        <div><Label>Cidade</Label><Input value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} /></div>
        <div><Label>UF</Label><Input value={form.state ?? ""} onChange={(e) => set("state", e.target.value)} /></div>
        <div className="sm:col-span-2"><Label>Notas</Label><Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></div>
      </div>
      <DialogFooter><Button disabled={saving} onClick={() => onSubmit(form)}>Salvar</Button></DialogFooter>
    </DialogContent>
  );
}
