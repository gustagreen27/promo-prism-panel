import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, RefreshCw, Send, ClipboardCheck } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { listTemplates, createTemplate, updateTemplate, deleteTemplate, syncTemplates, syncAllTemplates } from "@/lib/whatsapp-templates.functions";
import { submitTemplateForApproval, refreshTemplateStatus } from "@/lib/wa-meta.functions";
import { listNumbers } from "@/lib/whatsapp-numbers.functions";
import { listWabas } from "@/lib/wa-wabas.functions";

export const Route = createFileRoute("/_authenticated/admin/whatsapp/templates")({
  head: () => ({ meta: [{ title: "Templates WhatsApp" }] }),
  component: Page,
});

function Page() {
  const listFn = useServerFn(listTemplates);
  const numFn = useServerFn(listNumbers);
  const create = useServerFn(createTemplate);
  const update = useServerFn(updateTemplate);
  const remove = useServerFn(deleteTemplate);
  const sync = useServerFn(syncTemplates);
  const submitFn = useServerFn(submitTemplateForApproval);
  const refreshStatusFn = useServerFn(refreshTemplateStatus);
  const wabasFn = useServerFn(listWabas);
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({ queryKey: ["wa-templates"], queryFn: () => listFn() });
  const { data: numbers = [] } = useQuery({ queryKey: ["wa-numbers"], queryFn: () => numFn() });
  const { data: wabas = [] } = useQuery({ queryKey: ["wa-wabas"], queryFn: () => wabasFn() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [syncConn, setSyncConn] = useState<string>("");

  const refresh = () => qc.invalidateQueries({ queryKey: ["wa-templates"] });
  const save = useMutation({
    mutationFn: (p: any) => (editing ? update({ data: { id: editing.id, ...p } }) : create({ data: p })),
    onSuccess: () => { toast.success("Salvo"); setOpen(false); setEditing(null); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const del = useMutation({ mutationFn: (id: string) => remove({ data: { id } }), onSuccess: () => { toast.success("Removido"); refresh(); } });
  const syncMut = useMutation({
    mutationFn: (id: string) => sync({ data: { connection_id: id } }),
    onSuccess: (r: any) => { toast.success(`${r.synced}/${r.total} templates sincronizados`); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao sincronizar"),
  });
  const submitMut = useMutation({
    mutationFn: (id: string) => submitFn({ data: { template_id: id } }),
    onSuccess: () => { toast.success("Enviado para aprovação"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const refreshMut = useMutation({
    mutationFn: (id: string) => refreshStatusFn({ data: { template_id: id } }),
    onSuccess: (r: any) => { toast.success(`Status: ${r.status}`); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  return (
    <>
      <PageHeader
        title="Templates"
        description="Templates aprovados na Meta usados nas campanhas."
        actions={
          <div className="flex gap-2">
            <Select value={syncConn} onValueChange={setSyncConn}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Sincronizar com número…" /></SelectTrigger>
              <SelectContent>{numbers.map((n: any) => <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" disabled={!syncConn || syncMut.isPending} onClick={() => syncMut.mutate(syncConn)}>
              <RefreshCw className="mr-2 h-4 w-4" />Sincronizar
            </Button>
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
              <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Novo</Button></DialogTrigger>
              <FormDialog editing={editing} numbers={numbers} wabas={wabas} onSubmit={(p: any) => save.mutate(p)} saving={save.isPending} />
            </Dialog>
          </div>
        }
      />
      <div className="rounded-xl border bg-card">
        {isLoading ? <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
        : rows.length === 0 ? <EmptyState title="Nenhum template" description="Cadastre manualmente ou sincronize com a Meta." />
        : <Table>
          <TableHeader><TableRow>
            <TableHead>Nome</TableHead><TableHead>WABA</TableHead><TableHead>Idioma</TableHead><TableHead>Categoria</TableHead>
            <TableHead>Status</TableHead><TableHead>Meta ID</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {rows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-xs">{r.waba?.nome_interno ?? "—"}</TableCell>
                <TableCell>{r.language}</TableCell>
                <TableCell>{r.category ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"}>{r.status}</Badge>
                  {r.rejection_reason && <div className="text-[10px] text-destructive mt-1 max-w-[200px] truncate" title={r.rejection_reason}>{r.rejection_reason}</div>}
                </TableCell>
                <TableCell className="font-mono text-xs">{r.meta_template_id ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" title="Enviar para aprovação" disabled={submitMut.isPending || !r.waba_ref_id} onClick={() => submitMut.mutate(r.id)}><Send className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" title="Consultar status" disabled={refreshMut.isPending || !r.waba_ref_id} onClick={() => refreshMut.mutate(r.id)}><ClipboardCheck className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => confirm("Remover?") && del.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>}
      </div>
    </>
  );
}

function FormDialog({ editing, numbers, wabas, onSubmit, saving }: any) {
  const [form, setForm] = useState<any>(() => editing ?? {
    connection_id: "", waba_ref_id: "", name: "", language: "pt_BR", category: "MARKETING",
    status: "pending", header_type: "", header_text: "", header_media_url: "", body: "", footer: "",
    variables: [], variables_examples: [], buttons: [],
  });
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const bodyExamples = (Array.isArray(form.variables_examples) ? form.variables_examples : []).find((e: any) => e?.section === "body")?.values ?? [];
  const setBodyExamples = (arr: string[]) => {
    const others = (Array.isArray(form.variables_examples) ? form.variables_examples : []).filter((e: any) => e?.section !== "body");
    set("variables_examples", [...others, { section: "body", values: arr }]);
  };
  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{editing ? "Editar template" : "Novo template"}</DialogTitle></DialogHeader>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><Label>WABA *</Label>
          <Select value={form.waba_ref_id ?? ""} onValueChange={(v) => set("waba_ref_id", v)}>
            <SelectTrigger><SelectValue placeholder="Selecione a WABA" /></SelectTrigger>
            <SelectContent>{wabas.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.nome_interno}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Número (opcional)</Label>
          <Select value={form.connection_id ?? ""} onValueChange={(v) => set("connection_id", v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{numbers.map((n: any) => <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Nome (exato Meta) *</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div><Label>Idioma</Label><Input value={form.language} onChange={(e) => set("language", e.target.value)} /></div>
        <div><Label>Categoria</Label>
          <Select value={form.category ?? ""} onValueChange={(v) => set("category", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="MARKETING">Marketing</SelectItem>
              <SelectItem value="UTILITY">Utility</SelectItem>
              <SelectItem value="AUTHENTICATION">Authentication</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => set("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["approved","pending","rejected","paused","disabled"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Tipo de cabeçalho</Label>
          <Select value={form.header_type ?? ""} onValueChange={(v) => set("header_type", v)}>
            <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Texto</SelectItem>
              <SelectItem value="image">Imagem</SelectItem>
              <SelectItem value="video">Vídeo</SelectItem>
              <SelectItem value="document">Documento</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2"><Label>Cabeçalho — texto</Label><Input value={form.header_text ?? ""} onChange={(e) => set("header_text", e.target.value)} placeholder="(apenas se tipo = texto)" /></div>
        <div className="sm:col-span-2"><Label>Cabeçalho — URL de mídia (image/video/document)</Label><Input value={form.header_media_url ?? ""} onChange={(e) => set("header_media_url", e.target.value)} placeholder="https://exemplo.com/mídia.jpg" /></div>
        <div className="sm:col-span-2"><Label>Corpo *</Label><Textarea rows={4} value={form.body ?? ""} onChange={(e) => set("body", e.target.value)} placeholder="Olá {{1}}, sua mensagem..." /></div>
        <div className="sm:col-span-2"><Label>Exemplos das variáveis do corpo (obrigatório na Meta — 1 por variável, separadas por |)</Label>
          <Input value={bodyExamples.join(" | ")} onChange={(e) => setBodyExamples(e.target.value.split("|").map((s) => s.trim()).filter(Boolean))} placeholder="João | Segunda-feira | 20% OFF" />
        </div>
        <div className="sm:col-span-2"><Label>Variáveis detectadas</Label>
          <Input readOnly value={((form.body || "").match(/\{\{\d+\}\}/g) || []).join(", ") || "—"} className="font-mono text-xs" />
        </div>
        <div className="sm:col-span-2"><Label>Rodapé</Label><Input value={form.footer ?? ""} onChange={(e) => set("footer", e.target.value)} /></div>
      </div>
      <DialogFooter><Button disabled={saving} onClick={() => onSubmit(form)}>Salvar</Button></DialogFooter>
    </DialogContent>
  );
}
