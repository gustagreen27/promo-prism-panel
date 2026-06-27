import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { listConnections, createConnection, updateConnection, deleteConnection, listMessages } from "@/lib/whatsapp.functions";

export const Route = createFileRoute("/_authenticated/admin/whatsapp")({
  head: () => ({ meta: [{ title: "WhatsApp — Painel" }] }),
  component: Page,
});

const STATUS = ["ativa", "inativa", "erro"] as const;
const PROVIDERS = ["evolution", "z-api", "wppconnect", "twilio", "outro"];

function Page() {
  const connFn = useServerFn(listConnections);
  const msgFn = useServerFn(listMessages);
  const create = useServerFn(createConnection);
  const update = useServerFn(updateConnection);
  const remove = useServerFn(deleteConnection);
  const qc = useQueryClient();
  const { data: conns = [], isLoading } = useQuery({ queryKey: ["wa-conns"], queryFn: () => connFn() });
  const { data: msgs = [] } = useQuery({ queryKey: ["wa-msgs"], queryFn: () => msgFn() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["wa-conns"] });
  const saveMut = useMutation({
    mutationFn: async (p: any) => (editing ? update({ data: { id: editing.id, ...p } }) : create({ data: p })),
    onSuccess: () => { toast.success("Salvo"); setOpen(false); setEditing(null); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const delMut = useMutation({ mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { toast.success("Removida"); refresh(); } });

  return (
    <>
      <PageHeader title="WhatsApp" description="Conexões e histórico de mensagens." actions={
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Nova conexão</Button></DialogTrigger>
          <FormDialog editing={editing} onSubmit={(p) => saveMut.mutate(p)} saving={saveMut.isPending} />
        </Dialog>
      } />
      <Tabs defaultValue="connections">
        <TabsList>
          <TabsTrigger value="connections">Conexões</TabsTrigger>
          <TabsTrigger value="messages">Mensagens recentes</TabsTrigger>
        </TabsList>
        <TabsContent value="connections" className="mt-4">
          <div className="rounded-xl border bg-card">
            {isLoading ? <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
              : conns.length === 0 ? <EmptyState title="Sem conexões" />
              : <Table>
                <TableHeader><TableRow>
                  <TableHead>Nome</TableHead><TableHead>Telefone</TableHead>
                  <TableHead>Provedor</TableHead><TableHead>Status</TableHead><TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {conns.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>{r.phone ?? "—"}</TableCell>
                      <TableCell><Badge variant="outline">{r.provider}</Badge></TableCell>
                      <TableCell><Badge variant="secondary">{r.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => confirm("Remover?") && delMut.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>}
          </div>
        </TabsContent>
        <TabsContent value="messages" className="mt-4">
          <div className="rounded-xl border bg-card">
            {msgs.length === 0 ? <EmptyState title="Sem mensagens registradas" />
              : <Table>
                <TableHeader><TableRow>
                  <TableHead>Data</TableHead><TableHead>Telefone</TableHead>
                  <TableHead>Cliente</TableHead><TableHead>Template</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {msgs.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell>{formatDate(r.created_at)}</TableCell>
                      <TableCell>{r.phone}</TableCell>
                      <TableCell>{r.client?.name ?? "—"}</TableCell>
                      <TableCell>{r.template_name ?? "—"}</TableCell>
                      <TableCell><Badge variant="secondary">{r.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>}
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}

function FormDialog({ editing, onSubmit, saving }: any) {
  const [form, setForm] = useState<any>(() => editing ?? {
    name: "", phone: "", provider: "evolution", api_key: "", status: "ativa",
  });
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{editing ? "Editar conexão" : "Nova conexão"}</DialogTitle></DialogHeader>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label>Nome</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div><Label>Telefone</Label><Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></div>
        <div><Label>Provedor</Label>
          <Select value={form.provider} onValueChange={(v) => set("provider", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{PROVIDERS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => set("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2"><Label>API Key / Token</Label><Input value={form.api_key ?? ""} onChange={(e) => set("api_key", e.target.value)} type="password" /></div>
      </div>
      <DialogFooter><Button disabled={saving} onClick={() => onSubmit(form)}>Salvar</Button></DialogFooter>
    </DialogContent>
  );
}
