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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { listNumbers, createNumber, updateNumber, deleteNumber } from "@/lib/whatsapp-numbers.functions";
import { listClients } from "@/lib/clients.functions";
import { listProjects } from "@/lib/projects.functions";

export const Route = createFileRoute("/_authenticated/admin/whatsapp/numeros")({
  head: () => ({ meta: [{ title: "Números WhatsApp" }] }),
  component: Page,
});

function Page() {
  const listFn = useServerFn(listNumbers);
  const create = useServerFn(createNumber);
  const update = useServerFn(updateNumber);
  const remove = useServerFn(deleteNumber);
  const clientsFn = useServerFn(listClients);
  const projectsFn = useServerFn(listProjects);
  const qc = useQueryClient();

  const { data: rows = [], isLoading } = useQuery({ queryKey: ["wa-numbers"], queryFn: () => listFn() });
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => clientsFn() });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => projectsFn() });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["wa-numbers"] });
  const saveMut = useMutation({
    mutationFn: async (p: any) => (editing ? update({ data: { id: editing.id, ...p } }) : create({ data: p })),
    onSuccess: () => { toast.success("Salvo"); setOpen(false); setEditing(null); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { toast.success("Removido"); refresh(); },
  });

  return (
    <>
      <PageHeader
        title="Números WhatsApp Cloud API"
        description="Configure os números oficiais Meta usados pelos disparos."
        actions={
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Novo número</Button></DialogTrigger>
            <FormDialog editing={editing} clients={clients} projects={projects} onSubmit={(p: any) => saveMut.mutate(p)} saving={saveMut.isPending} />
          </Dialog>
        }
      />
      <div className="rounded-xl border bg-card">
        {isLoading ? <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
        : rows.length === 0 ? <EmptyState title="Nenhum número cadastrado" />
        : <Table>
          <TableHeader><TableRow>
            <TableHead>Nome</TableHead><TableHead>Telefone</TableHead><TableHead>Phone Number ID</TableHead>
            <TableHead>WABA</TableHead><TableHead>Cliente / Projeto</TableHead><TableHead>Qualidade</TableHead>
            <TableHead>Status</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="font-mono text-xs">{r.display_phone ?? r.phone ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{r.phone_number_id ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{r.waba_id ?? "—"}</TableCell>
                <TableCell className="text-sm">{[r.client?.name, r.project?.name].filter(Boolean).join(" · ") || "—"}</TableCell>
                <TableCell><Badge variant="outline">{r.quality_rating ?? "—"}</Badge></TableCell>
                <TableCell><Badge variant={r.status === "ativa" ? "default" : "secondary"}>{r.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => confirm("Remover este número?") && delMut.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>}
      </div>
    </>
  );
}

function FormDialog({ editing, clients, projects, onSubmit, saving }: any) {
  const [form, setForm] = useState<any>(() => editing ?? {
    name: "", display_phone: "", phone: "", provider: "meta_cloud", phone_number_id: "",
    waba_id: "", business_id: "", access_token: "", verify_token: "", webhook_url: "",
    quality_rating: "", daily_limit: 1000, graph_api_version: "v21.0",
    client_id: "", project_id: "", status: "ativa",
  });
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  return (
    <DialogContent className="max-w-3xl">
      <DialogHeader><DialogTitle>{editing ? "Editar número" : "Novo número"}</DialogTitle></DialogHeader>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><Label>Nome interno *</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div><Label>Telefone exibição</Label><Input placeholder="+55 11 99999-9999" value={form.display_phone ?? ""} onChange={(e) => set("display_phone", e.target.value)} /></div>
        <div><Label>Phone Number ID *</Label><Input value={form.phone_number_id ?? ""} onChange={(e) => set("phone_number_id", e.target.value)} /></div>
        <div><Label>WABA ID *</Label><Input value={form.waba_id ?? ""} onChange={(e) => set("waba_id", e.target.value)} /></div>
        <div><Label>Business ID</Label><Input value={form.business_id ?? ""} onChange={(e) => set("business_id", e.target.value)} /></div>
        <div><Label>Versão da Graph API</Label><Input value={form.graph_api_version ?? "v21.0"} onChange={(e) => set("graph_api_version", e.target.value)} /></div>
        <div className="sm:col-span-2"><Label>Access Token (permanente) *</Label><Input type="password" value={form.access_token ?? ""} onChange={(e) => set("access_token", e.target.value)} /></div>
        <div><Label>Verify Token (webhook)</Label><Input value={form.verify_token ?? ""} onChange={(e) => set("verify_token", e.target.value)} /></div>
        <div><Label>Webhook URL</Label><Input value={form.webhook_url ?? ""} onChange={(e) => set("webhook_url", e.target.value)} placeholder="https://.../api/public/whatsapp/webhook" /></div>
        <div><Label>Qualidade</Label>
          <Select value={form.quality_rating ?? ""} onValueChange={(v) => set("quality_rating", v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="GREEN">Alta (verde)</SelectItem>
              <SelectItem value="YELLOW">Média (amarela)</SelectItem>
              <SelectItem value="RED">Baixa (vermelha)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>Limite diário</Label><Input type="number" value={form.daily_limit ?? 1000} onChange={(e) => set("daily_limit", Number(e.target.value))} /></div>
        <div><Label>Cliente</Label>
          <Select value={form.client_id ?? ""} onValueChange={(v) => set("client_id", v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Projeto</Label>
          <Select value={form.project_id ?? ""} onValueChange={(v) => set("project_id", v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{projects.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Status</Label>
          <Select value={form.status ?? "ativa"} onValueChange={(v) => set("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ativa">Ativa</SelectItem>
              <SelectItem value="inativa">Inativa</SelectItem>
              <SelectItem value="erro">Erro</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter><Button disabled={saving} onClick={() => onSubmit(form)}>Salvar</Button></DialogFooter>
    </DialogContent>
  );
}
