import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, ListPlus } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listLists, createList, deleteList, addContactsToList, listItems } from "@/lib/contact-lists.functions";
import { listContacts } from "@/lib/contacts.functions";
import { listClients } from "@/lib/clients.functions";

export const Route = createFileRoute("/_authenticated/admin/contatos/listas")({
  head: () => ({ meta: [{ title: "Listas de Contatos" }] }),
  component: Page,
});

function Page() {
  const listFn = useServerFn(listLists);
  const create = useServerFn(createList);
  const remove = useServerFn(deleteList);
  const add = useServerFn(addContactsToList);
  const itemsFn = useServerFn(listItems);
  const contactsFn = useServerFn(listContacts);
  const clientsFn = useServerFn(listClients);
  const qc = useQueryClient();
  const { data: lists = [] } = useQuery({ queryKey: ["lists"], queryFn: () => listFn() });
  const { data: contacts = [] } = useQuery({ queryKey: ["contacts"], queryFn: () => contactsFn() });
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => clientsFn() });
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState<string | null>(null);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const { data: members = [] } = useQuery({ enabled: !!selectedListId, queryKey: ["list-items", selectedListId], queryFn: () => itemsFn({ data: { list_id: selectedListId! } }) });

  const refresh = () => qc.invalidateQueries({ queryKey: ["lists"] });
  const save = useMutation({ mutationFn: (p: any) => create({ data: p }), onSuccess: () => { toast.success("Lista criada"); setOpen(false); refresh(); } });
  const del = useMutation({ mutationFn: (id: string) => remove({ data: { id } }), onSuccess: () => { toast.success("Removida"); refresh(); setSelectedListId(null); } });
  const addMut = useMutation({
    mutationFn: (p: any) => add({ data: p }),
    onSuccess: (r: any) => { toast.success(`${r.added} contatos adicionados`); setAddOpen(null); qc.invalidateQueries({ queryKey: ["list-items"] }); },
  });

  return (
    <>
      <PageHeader
        title="Listas de Contatos"
        description="Agrupe contatos para campanhas."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Nova lista</Button></DialogTrigger>
            <ListDialog clients={clients} onSubmit={(p: any) => save.mutate(p)} saving={save.isPending} />
          </Dialog>
        }
      />
      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        <div className="rounded-xl border bg-card">
          {lists.length === 0 ? <EmptyState title="Nenhuma lista" />
          : <div className="divide-y">
            {lists.map((l: any) => (
              <div key={l.id} className={`flex items-center justify-between p-3 ${selectedListId === l.id ? "bg-muted" : ""}`}>
                <button onClick={() => setSelectedListId(l.id)} className="flex-1 text-left">
                  <div className="font-medium text-sm">{l.name}</div>
                  <div className="text-xs text-muted-foreground">{l.client?.name ?? "—"}</div>
                </button>
                <Button size="icon" variant="ghost" onClick={() => setAddOpen(l.id)}><ListPlus className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => confirm("Remover?") && del.mutate(l.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>}
        </div>
        <div className="rounded-xl border bg-card">
          {!selectedListId ? <div className="p-6 text-sm text-muted-foreground">Selecione uma lista.</div>
          : members.length === 0 ? <EmptyState title="Lista vazia" />
          : <Table>
            <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Telefone</TableHead><TableHead>Opt-in</TableHead></TableRow></TableHeader>
            <TableBody>
              {members.map((c: any) => (
                <TableRow key={c.id}><TableCell>{c.name ?? "—"}</TableCell><TableCell className="font-mono text-xs">{c.phone}</TableCell><TableCell>{c.opt_in ? "✓" : "—"}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>}
        </div>
      </div>

      <Dialog open={!!addOpen} onOpenChange={(v) => !v && setAddOpen(null)}>
        <AddDialog contacts={contacts} onSubmit={(ids: string[]) => addMut.mutate({ list_id: addOpen, contact_ids: ids })} saving={addMut.isPending} />
      </Dialog>
    </>
  );
}

function ListDialog({ clients, onSubmit, saving }: any) {
  const [form, setForm] = useState<any>({ name: "", description: "", client_id: "" });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Nova lista</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Nome *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><Label>Descrição</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div><Label>Cliente</Label>
          <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter><Button disabled={saving || !form.name} onClick={() => onSubmit(form)}>Salvar</Button></DialogFooter>
    </DialogContent>
  );
}

function AddDialog({ contacts, onSubmit, saving }: any) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) => { const s = new Set(selected); if (s.has(id)) s.delete(id); else s.add(id); setSelected(s); };
  const usable = contacts.filter((c: any) => c.opt_in && !c.opt_out);
  return (
    <DialogContent className="max-w-xl">
      <DialogHeader><DialogTitle>Adicionar contatos</DialogTitle></DialogHeader>
      <div className="max-h-[400px] overflow-y-auto rounded border">
        {usable.map((c: any) => (
          <label key={c.id} className="flex items-center gap-2 border-b p-2 text-sm hover:bg-muted">
            <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
            <span className="flex-1">{c.name ?? "—"}</span>
            <span className="font-mono text-xs text-muted-foreground">{c.phone}</span>
          </label>
        ))}
      </div>
      <DialogFooter>
        <Button disabled={saving || selected.size === 0} onClick={() => onSubmit([...selected])}>Adicionar {selected.size}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
