import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Upload, Users, Trash2, Search, Ban, ListPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getMyContext } from "@/lib/auth.functions";

export const Route = createFileRoute("/painel/contatos")({
  head: () => ({ meta: [{ title: "Contatos — Disparos FR" }] }),
  component: Page,
});

type ListRow = { id: string; name: string; description: string | null; created_at: string };
type ContactRow = {
  id: string; name: string | null; phone: string; email: string | null;
  opt_in: boolean; opt_out: boolean; created_at: string;
};

function normalizeBr(raw: string): string | null {
  const d = String(raw || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("55") && d.length >= 12 && d.length <= 13) return d;
  if (d.length === 10 || d.length === 11) return "55" + d;
  return null;
}

function Page() {
  const ctxFn = useServerFn(getMyContext);
  const { data: ctx } = useQuery({ queryKey: ["my-context"], queryFn: () => ctxFn(), staleTime: 30_000 });
  const wsId = ctx?.primary_workspace?.id;
  if (!wsId) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  return (
    <Tabs defaultValue="listas" className="space-y-4">
      <TabsList>
        <TabsTrigger value="listas"><ListPlus className="mr-1 h-4 w-4" />Listas</TabsTrigger>
        <TabsTrigger value="contatos"><Users className="mr-1 h-4 w-4" />Contatos</TabsTrigger>
      </TabsList>
      <TabsContent value="listas"><ListasTab workspaceId={wsId} /></TabsContent>
      <TabsContent value="contatos"><ContatosTab workspaceId={wsId} /></TabsContent>
    </Tabs>
  );
}

/* ---------------- LISTAS ---------------- */

function ListasTab({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  const { data: lists = [], isLoading } = useQuery<ListRow[]>({
    queryKey: ["ws-lists", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase.from("contact_lists")
        .select("id,name,description,created_at").eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as ListRow[]) || [];
    },
  });

  const createList = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("contact_lists")
        .insert({ workspace_id: workspaceId, name: name.trim(), description: desc.trim() || null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lista criada");
      setName(""); setDesc(""); setCreating(false);
      qc.invalidateQueries({ queryKey: ["ws-lists", workspaceId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao criar lista"),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Suas listas</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Agrupe contatos para usar em campanhas. Importe números diretamente para uma lista.
          </p>
        </div>
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-1 h-4 w-4" />Nova lista</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova lista</DialogTitle>
              <DialogDescription>Crie uma lista para organizar seus contatos.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Clientes VIP" />
              </div>
              <div>
                <Label>Descrição (opcional)</Label>
                <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreating(false)}>Cancelar</Button>
              <Button onClick={() => createList.mutate()} disabled={name.trim().length < 2 || createList.isPending}>
                {createList.isPending ? "Criando…" : "Criar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : lists.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <ListPlus className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">Nenhuma lista ainda</p>
            <p className="text-xs text-muted-foreground">Crie sua primeira lista para começar a importar contatos.</p>
          </div>
        ) : (
          <div className="divide-y">
            {lists.map((l) => <ListRowItem key={l.id} list={l} workspaceId={workspaceId} />)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ListRowItem({ list, workspaceId }: { list: ListRow; workspaceId: string }) {
  const qc = useQueryClient();
  const [openImport, setOpenImport] = useState(false);
  const [rawText, setRawText] = useState("");

  const { data: count } = useQuery({
    queryKey: ["list-count", list.id],
    queryFn: async () => {
      const { count: c } = await supabase.from("contact_list_items")
        .select("contact_id", { count: "exact", head: true }).eq("list_id", list.id);
      return c ?? 0;
    },
  });

  const importPhones = useMutation({
    mutationFn: async () => {
      const lines = rawText.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
      const seen = new Set<string>();
      const rows: { phone: string; name: string | null; email: string | null }[] = [];
      let invalid = 0;
      for (const line of lines) {
        const parts = line.split(/[\t,;]/).map((p) => p.trim());
        const phone = normalizeBr(parts[0] ?? "");
        if (!phone) { invalid++; continue; }
        if (seen.has(phone)) continue;
        seen.add(phone);
        rows.push({ phone, name: parts[1] || null, email: parts[2] || null });
      }
      if (!rows.length) throw new Error(`Nenhum telefone válido (${invalid} inválidos)`);

      const contactsPayload = rows.map((r) => ({
        workspace_id: workspaceId,
        phone: r.phone, name: r.name, email: r.email,
        opt_in: true, opt_in_at: new Date().toISOString(), source: "import",
      }));
      const { error: upErr } = await supabase.from("contacts")
        .upsert(contactsPayload, { onConflict: "workspace_id,phone" as any, ignoreDuplicates: false });
      if (upErr) throw upErr;

      const { data: found, error: selErr } = await supabase.from("contacts")
        .select("id,phone").eq("workspace_id", workspaceId).in("phone", rows.map((r) => r.phone));
      if (selErr) throw selErr;
      const items = (found ?? []).map((c: any) => ({
        list_id: list.id, contact_id: c.id, workspace_id: workspaceId,
      }));
      if (items.length) {
        const { error: itErr } = await supabase.from("contact_list_items")
          .upsert(items, { onConflict: "list_id,contact_id" as any, ignoreDuplicates: true });
        if (itErr) throw itErr;
      }
      return { added: items.length, invalid };
    },
    onSuccess: (res) => {
      toast.success(`${res.added} contatos importados${res.invalid ? ` (${res.invalid} inválidos)` : ""}`);
      setRawText(""); setOpenImport(false);
      qc.invalidateQueries({ queryKey: ["list-count", list.id] });
      qc.invalidateQueries({ queryKey: ["ws-contacts"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao importar"),
  });

  const removeList = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("contact_lists").delete().eq("id", list.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lista removida");
      qc.invalidateQueries({ queryKey: ["ws-lists", workspaceId] });
    },
  });

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="font-medium">{list.name}</div>
        <div className="text-xs text-muted-foreground">
          {count ?? 0} contatos {list.description ? `· ${list.description}` : ""}
        </div>
      </div>
      <div className="flex gap-2">
        <Dialog open={openImport} onOpenChange={setOpenImport}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline"><Upload className="mr-1 h-4 w-4" />Importar</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Importar contatos para "{list.name}"</DialogTitle>
              <DialogDescription>
                Cole telefones (um por linha). Formato: <code>telefone, nome, email</code>. Nome e email são opcionais.
                Telefones brasileiros são normalizados automaticamente (DDI 55).
              </DialogDescription>
            </DialogHeader>
            <Textarea rows={10} value={rawText} onChange={(e) => setRawText(e.target.value)}
              placeholder="11999999999, João Silva, joao@email.com&#10;21988887777, Maria" />
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenImport(false)}>Cancelar</Button>
              <Button onClick={() => importPhones.mutate()} disabled={!rawText.trim() || importPhones.isPending}>
                {importPhones.isPending ? "Importando…" : "Importar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Button size="sm" variant="ghost" onClick={() => {
          if (confirm(`Excluir a lista "${list.name}"? Os contatos permanecem.`)) removeList.mutate();
        }}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* ---------------- CONTATOS ---------------- */

function ContatosTab({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: contacts = [], isLoading } = useQuery<ContactRow[]>({
    queryKey: ["ws-contacts", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts")
        .select("id,name,phone,email,opt_in,opt_out,created_at")
        .eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data as ContactRow[]) || [];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      (c.name ?? "").toLowerCase().includes(q) || c.phone.includes(q) || (c.email ?? "").toLowerCase().includes(q));
  }, [contacts, search]);

  const optOut = useMutation({
    mutationFn: async (c: ContactRow) => {
      const { error } = await supabase.from("contacts")
        .update({ opt_out: true, opt_out_at: new Date().toISOString() }).eq("id", c.id);
      if (error) throw error;
      await supabase.from("opt_outs").upsert({ workspace_id: workspaceId, phone: c.phone, reason: "manual" } as any,
        { onConflict: "workspace_id,phone" as any });
    },
    onSuccess: () => {
      toast.success("Contato marcado como opt-out");
      qc.invalidateQueries({ queryKey: ["ws-contacts", workspaceId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contato removido");
      qc.invalidateQueries({ queryKey: ["ws-contacts", workspaceId] });
    },
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Contatos</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{contacts.length} contatos no workspace</p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8 w-72" placeholder="Buscar por nome, telefone ou email"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <Users className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">
              {contacts.length === 0 ? "Nenhum contato ainda" : "Nenhum contato encontrado"}
            </p>
            <p className="text-xs text-muted-foreground">
              Importe contatos criando uma lista na aba Listas.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 200).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{c.phone}</TableCell>
                    <TableCell className="text-xs">{c.email ?? "—"}</TableCell>
                    <TableCell>
                      {c.opt_out ? <Badge variant="destructive">opt-out</Badge>
                        : c.opt_in ? <Badge variant="secondary">opt-in</Badge>
                        : <Badge variant="outline">pendente</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      {!c.opt_out && (
                        <Button size="icon" variant="ghost" title="Opt-out"
                          onClick={() => optOut.mutate(c)}><Ban className="h-4 w-4" /></Button>
                      )}
                      <Button size="icon" variant="ghost" title="Remover"
                        onClick={() => { if (confirm("Remover contato?")) del.mutate(c.id); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filtered.length > 200 && (
              <p className="mt-2 text-xs text-muted-foreground">Mostrando 200 de {filtered.length}. Refine a busca para ver mais.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
