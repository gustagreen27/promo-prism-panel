import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, RefreshCw, Send, ClipboardCheck, Copy } from "lucide-react";
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
import { listTemplates, createTemplate, updateTemplate, deleteTemplate, syncAllTemplates } from "@/lib/whatsapp-templates.functions";
import { submitTemplateForApproval, refreshTemplateStatus } from "@/lib/wa-meta.functions";
import { duplicateTemplate } from "@/lib/wa-meta-api.functions";
import { listNumbers } from "@/lib/whatsapp-numbers.functions";
import { listWabas } from "@/lib/wa-wabas.functions";
import { ErrorCard } from "@/components/admin/query-state";

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
  const syncAll = useServerFn(syncAllTemplates);
  const submitFn = useServerFn(submitTemplateForApproval);
  const refreshStatusFn = useServerFn(refreshTemplateStatus);
  const dupFn = useServerFn(duplicateTemplate);
  const wabasFn = useServerFn(listWabas);
  const qc = useQueryClient();
  const templatesQuery = useQuery({ queryKey: ["wa-templates"], queryFn: () => listFn() });
  const { data: rows, isLoading, error, refetch } = templatesQuery;
  const numbersQuery = useQuery({ queryKey: ["wa-numbers"], queryFn: () => numFn() });
  const wabasQuery = useQuery({ queryKey: ["wa-wabas"], queryFn: () => wabasFn() });
  const numbers = numbersQuery.data ?? [];
  const wabas = wabasQuery.data ?? [];
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["wa-templates"] });
  const save = useMutation({
    mutationFn: (p: any) => (editing ? update({ data: { id: editing.id, ...p } }) : create({ data: p })),
    onSuccess: () => { toast.success("Salvo"); setOpen(false); setEditing(null); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const del = useMutation({ mutationFn: (id: string) => remove({ data: { id } }), onSuccess: () => { toast.success("Removido"); refresh(); } });
  const syncMut = useMutation({
    mutationFn: () => syncAll(),
    onSuccess: (r: any) => {
      const errPart = r?.wabasErr ? ` — ${r.wabasErr} com erro` : "";
      toast.success(`${r?.synced ?? 0}/${r?.total ?? 0} templates sincronizados em ${r?.wabas ?? 0} números${errPart}`);
      refresh();
    },
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
  const dupMut = useMutation({
    mutationFn: (id: string) => dupFn({ data: { template_id: id } }),
    onSuccess: () => { toast.success("Template duplicado"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  return (
    <>
      <PageHeader
        title="Templates"
        description="Sincronização automática a cada 15 min com todos os números cadastrados. Use o botão ao lado para forçar uma sincronização imediata."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" disabled={syncMut.isPending} onClick={() => syncMut.mutate()}>
              <RefreshCw className={`mr-2 h-4 w-4 ${syncMut.isPending ? "animate-spin" : ""}`} />
              {syncMut.isPending ? "Sincronizando…" : "Sincronizar todos agora"}
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
        : error ? <div className="p-4"><ErrorCard error={error} onRetry={() => refetch()} /></div>
        : !rows || rows.length === 0 ? <EmptyState title="Nenhum template" description="Cadastre manualmente ou sincronize com a Meta." />
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
                  <Button size="icon" variant="ghost" title="Duplicar" disabled={dupMut.isPending} onClick={() => dupMut.mutate(r.id)}><Copy className="h-4 w-4" /></Button>
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

