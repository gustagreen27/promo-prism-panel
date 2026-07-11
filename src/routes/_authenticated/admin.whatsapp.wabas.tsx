import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Eye, RefreshCw, ShieldCheck, Cloud, Download, Zap, CheckCircle2, XCircle, Loader2, AlertTriangle, Circle } from "lucide-react";
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
import { listWabas, createWaba, updateWaba, deleteWaba, getWabaChildren } from "@/lib/wa-wabas.functions";
import { syncWabaNumbers, syncAllWabas } from "@/lib/wa-meta-sync.functions";
import { debugToken, createWabaViaApi, importWabasFromBusiness } from "@/lib/wa-meta-api.functions";
import { quickConnectWa, parseQuickConnect } from "@/lib/wa-quick-connect.functions";
import { listWorkspaceConnections } from "@/lib/wa-connections.functions";
import { listClients } from "@/lib/clients.functions";
import { listProjects } from "@/lib/projects.functions";
import { EmbeddedSignupButton } from "@/components/admin/whatsapp/embedded-signup-button";
import { ErrorCard } from "@/components/admin/query-state";

export const Route = createFileRoute("/_authenticated/admin/whatsapp/wabas")({
  head: () => ({ meta: [{ title: "WABAs — WhatsApp Business" }] }),
  component: Page,
});

function Page() {
  const listFn = useServerFn(listWabas);
  const create = useServerFn(createWaba);
  const update = useServerFn(updateWaba);
  const remove = useServerFn(deleteWaba);
  const childrenFn = useServerFn(getWabaChildren);
  const syncOne = useServerFn(syncWabaNumbers);
  const syncAll = useServerFn(syncAllWabas);
  const debugFn = useServerFn(debugToken);
  const createApiFn = useServerFn(createWabaViaApi);
  const importFn = useServerFn(importWabasFromBusiness);
  const clientsFn = useServerFn(listClients);
  const projectsFn = useServerFn(listProjects);
  const quickFn = useServerFn(quickConnectWa);
  const workspacesFn = useServerFn(listWorkspaceConnections);
  const qc = useQueryClient();

  const wabasQuery = useQuery({ queryKey: ["wa-wabas"], queryFn: () => listFn() });
  const { data: rows, isLoading, error, refetch } = wabasQuery;
  const clientsQuery = useQuery({ queryKey: ["clients"], queryFn: () => clientsFn() });
  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: () => projectsFn() });
  const clients = clientsQuery.data ?? [];
  const projects = projectsQuery.data ?? [];

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewing, setViewing] = useState<any>(null);
  const [diagOpen, setDiagOpen] = useState(false);
  const [diag, setDiag] = useState<any>(null);
  const [apiOpen, setApiOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const workspacesQuery = useQuery({ queryKey: ["wa-workspaces"], queryFn: () => workspacesFn(), enabled: quickOpen });

  const refresh = () => qc.invalidateQueries({ queryKey: ["wa-wabas"] });
  const save = useMutation({
    mutationFn: (p: any) => (editing ? update({ data: { id: editing.id, ...p } }) : create({ data: p })),
    onSuccess: () => { toast.success("WABA salva"); setOpen(false); setEditing(null); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { toast.success("Removida"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const importMut = useMutation({
    mutationFn: (id: string) => syncOne({ data: { waba_ref_id: id } }),
    onSuccess: (r: any) => {
      toast.success(`${r.created} novos · ${r.updated} atualizados · ${r.marked_missing} sumidos`);
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao sincronizar"),
  });
  const syncAllMut = useMutation({
    mutationFn: () => syncAll(),
    onSuccess: (r: any) => {
      const t = r?.totals;
      toast.success(`${t?.wabas ?? 0} WABAs · ${t?.created ?? 0} novos · ${t?.updated ?? 0} atualizados${t?.errors ? ` · ${t.errors} erro(s)` : ""}`);
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao sincronizar"),
  });
  const diagMut = useMutation({
    mutationFn: () => debugFn(),
    onSuccess: (r: any) => { setDiag(r); setDiagOpen(true); },
    onError: (e: any) => toast.error(e?.message ?? "Erro no diagnóstico"),
  });
  const apiCreateMut = useMutation({
    mutationFn: (p: any) => createApiFn({ data: p }),
    onSuccess: () => { toast.success("WABA criada na Meta"); setApiOpen(false); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const importBmMut = useMutation({
    mutationFn: (p: any) => importFn({ data: p }),
    onSuccess: (r: any) => { toast.success(`${r.created} nova(s), ${r.updated} atualizada(s)`); setImportOpen(false); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const quickMut = useMutation({
    mutationFn: (p: { raw: string; workspace_id: string | null }) => quickFn({ data: p }),
    onSuccess: (r: any) => {
      const parts = [
        r.connection_id ? "número vinculado" : "WABA salva",
        r.sync?.created ? `${r.sync.created} novo(s) da Meta` : null,
        r.sync?.updated ? `${r.sync.updated} atualizado(s)` : null,
        r.sync_error ? `sync pendente: ${r.sync_error}` : null,
      ].filter(Boolean);
      toast.success(`Conexão concluída — ${parts.join(" · ")}`);
      setQuickOpen(false);
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro na conexão rápida"),
  });

  return (
    <>
      <PageHeader
        title="WABAs"
        description="Contas oficiais do WhatsApp Business (WhatsApp Business Accounts)."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" onClick={() => setQuickOpen(true)}>
              <Zap className="mr-2 h-4 w-4" />Conexão rápida
            </Button>
            <Button variant="outline" size="sm" disabled={diagMut.isPending} onClick={() => diagMut.mutate()}>
              <ShieldCheck className="mr-2 h-4 w-4" />Testar token
            </Button>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Download className="mr-2 h-4 w-4" />Importar do BM
            </Button>
            <Button variant="outline" size="sm" onClick={() => setApiOpen(true)}>
              <Cloud className="mr-2 h-4 w-4" />Criar via API
            </Button>
            <Button variant="outline" size="sm" disabled={syncAllMut.isPending} onClick={() => syncAllMut.mutate()}>
              <RefreshCw className={`mr-2 h-4 w-4 ${syncAllMut.isPending ? "animate-spin" : ""}`} />
              Sincronizar tudo
            </Button>
            <EmbeddedSignupButton onCompleted={() => refresh()} />
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
              <DialogTrigger asChild><Button variant="outline" size="sm"><Plus className="mr-2 h-4 w-4" />Cadastro manual</Button></DialogTrigger>
              <FormDialog editing={editing} clients={clients} projects={projects} onSubmit={(p: any) => save.mutate(p)} saving={save.isPending} />
            </Dialog>
          </div>
        }
      />
      <div className="rounded-xl border bg-card">
        {isLoading ? <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
        : error ? <div className="p-4"><ErrorCard error={error} onRetry={() => refetch()} /></div>
        : !rows || rows.length === 0 ? <EmptyState title="Nenhuma WABA cadastrada" description="Cadastre a WABA da Meta para vincular números, templates e campanhas." />
        : <Table>
          <TableHeader><TableRow>
            <TableHead>Nome interno</TableHead><TableHead>WABA ID</TableHead><TableHead>Business ID</TableHead>
            <TableHead>Cliente</TableHead><TableHead>Projeto</TableHead>
            <TableHead>Números</TableHead><TableHead>Templates</TableHead><TableHead>Campanhas</TableHead>
            <TableHead>Status</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.nome_interno}</TableCell>
                <TableCell className="font-mono text-xs">{r.waba_id}</TableCell>
                <TableCell className="font-mono text-xs">{r.business_id ?? "—"}</TableCell>
                <TableCell className="text-sm">{r.client?.name ?? "—"}</TableCell>
                <TableCell className="text-sm">{r.project?.name ?? "—"}</TableCell>
                <TableCell>{r.numbers_count}</TableCell>
                <TableCell>{r.templates_count}</TableCell>
                <TableCell>{r.campaigns_count}</TableCell>
                <TableCell><Badge variant={r.status === "ativo" ? "default" : "secondary"}>{r.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" title="Importar números da Meta" disabled={importMut.isPending} onClick={() => importMut.mutate(r.id)}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" title="Ver vinculados" onClick={() => setViewing(r)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => confirm("Remover WABA?") && del.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>}
      </div>

      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{viewing?.nome_interno} — Vinculados</DialogTitle></DialogHeader>
          {viewing && <Children id={viewing.id} fetcher={childrenFn} />}
        </DialogContent>
      </Dialog>

      <Dialog open={diagOpen} onOpenChange={setDiagOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Diagnóstico do token Meta</DialogTitle></DialogHeader>
          {diag ? (
            <div className="space-y-2 text-sm">
              <div><b>App ID:</b> {diag.app_id ?? "—"}</div>
              <div><b>Tipo:</b> {diag.type ?? "—"}</div>
              <div><b>Válido:</b> {diag.is_valid ? "sim" : "não"}</div>
              <div><b>Expira em:</b> {diag.expires_at ? new Date(diag.expires_at * 1000).toLocaleString("pt-BR") : "nunca"}</div>
              <div><b>Escopos:</b> <div className="flex flex-wrap gap-1 mt-1">{diag.scopes.map((s: string) => <Badge key={s} variant="outline">{s}</Badge>)}</div></div>
              {diag.missing_scopes?.length ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 mt-2">
                  <b className="text-destructive">Faltam permissões:</b>
                  <div className="flex flex-wrap gap-1 mt-1">{diag.missing_scopes.map((s: string) => <Badge key={s} variant="destructive">{s}</Badge>)}</div>
                </div>
              ) : <div className="text-emerald-600 font-medium">Token OK — todas as permissões presentes.</div>}
            </div>
          ) : <div className="text-sm text-muted-foreground">Sem dados.</div>}
        </DialogContent>
      </Dialog>

      <Dialog open={apiOpen} onOpenChange={setApiOpen}>
        <CreateApiDialog clients={clients} projects={projects} saving={apiCreateMut.isPending} onSubmit={(p: any) => apiCreateMut.mutate(p)} />
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <ImportBmDialog clients={clients} projects={projects} saving={importBmMut.isPending} onSubmit={(p: any) => importBmMut.mutate(p)} />
      </Dialog>

      <Dialog open={quickOpen} onOpenChange={setQuickOpen}>
        <QuickConnectDialog
          workspaces={workspacesQuery.data ?? []}
          saving={quickMut.isPending}
          onSubmit={(p: { raw: string; workspace_id: string | null }) => quickMut.mutate(p)}
        />
      </Dialog>
    </>
  );
}

function CreateApiDialog({ clients, projects, saving, onSubmit }: any) {
  const [form, setForm] = useState<any>({ business_id: "", name: "", timezone_id: "25", currency: "BRL", client_id: "", project_id: "" });
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  return (
    <DialogContent className="max-w-xl">
      <DialogHeader><DialogTitle>Criar WABA via Graph API</DialogTitle></DialogHeader>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label>Business Manager ID *</Label><Input value={form.business_id} onChange={(e) => set("business_id", e.target.value)} placeholder="1234567890" /></div>
        <div className="sm:col-span-2"><Label>Nome da WABA *</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div><Label>Timezone ID</Label><Input value={form.timezone_id} onChange={(e) => set("timezone_id", e.target.value)} placeholder="25 = America/Sao_Paulo" /></div>
        <div><Label>Moeda</Label><Input value={form.currency} onChange={(e) => set("currency", e.target.value)} placeholder="BRL" /></div>
        <div><Label>Cliente</Label>
          <Select value={form.client_id} onValueChange={(v) => set("client_id", v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Projeto</Label>
          <Select value={form.project_id} onValueChange={(v) => set("project_id", v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{projects.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button disabled={saving || !form.business_id || !form.name} onClick={() => onSubmit(form)}>Criar na Meta</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function ImportBmDialog({ clients, projects, saving, onSubmit }: any) {
  const [form, setForm] = useState<any>({ business_id: "", client_id: "", project_id: "" });
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  return (
    <DialogContent className="max-w-xl">
      <DialogHeader><DialogTitle>Importar WABAs do Business Manager</DialogTitle></DialogHeader>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label>Business Manager ID *</Label><Input value={form.business_id} onChange={(e) => set("business_id", e.target.value)} placeholder="1234567890" /></div>
        <div><Label>Vincular ao cliente (opcional)</Label>
          <Select value={form.client_id} onValueChange={(v) => set("client_id", v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Projeto (opcional)</Label>
          <Select value={form.project_id} onValueChange={(v) => set("project_id", v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{projects.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button disabled={saving || !form.business_id} onClick={() => onSubmit(form)}>Importar</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Children({ id, fetcher }: { id: string; fetcher: any }) {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["waba-children", id], queryFn: () => fetcher({ data: { id } }) });
  if (isLoading) return <div className="text-sm text-muted-foreground">Carregando…</div>;
  if (error) return <ErrorCard error={error} onRetry={() => refetch()} />;
  if (!data) return <div className="text-sm text-muted-foreground">Sem dados.</div>;
  const { numbers, templates, campaigns } = data;
  return (
    <div className="space-y-4 text-sm">
      <section><h4 className="font-medium mb-2">Números ({numbers.length})</h4>
        {numbers.length === 0 ? <p className="text-muted-foreground text-xs">Nenhum</p>
        : <ul className="space-y-1">{numbers.map((n: any) => <li key={n.id} className="flex justify-between border-b py-1"><span>{n.name} · {n.display_phone}</span><Badge variant="outline">{n.quality_rating ?? n.status}</Badge></li>)}</ul>}
      </section>
      <section><h4 className="font-medium mb-2">Templates ({templates.length})</h4>
        {templates.length === 0 ? <p className="text-muted-foreground text-xs">Nenhum</p>
        : <ul className="space-y-1">{templates.map((t: any) => <li key={t.id} className="flex justify-between border-b py-1"><span>{t.name} ({t.language})</span><Badge>{t.status}</Badge></li>)}</ul>}
      </section>
      <section><h4 className="font-medium mb-2">Campanhas ({campaigns.length})</h4>
        {campaigns.length === 0 ? <p className="text-muted-foreground text-xs">Nenhuma</p>
        : <ul className="space-y-1">{campaigns.map((c: any) => <li key={c.id} className="flex justify-between border-b py-1"><span>{c.name}</span><span className="text-xs text-muted-foreground">{c.sent_count}/{c.total_recipients} · {c.status}</span></li>)}</ul>}
      </section>
    </div>
  );
}

function FormDialog({ editing, clients, projects, onSubmit, saving }: any) {
  const [form, setForm] = useState<any>(() => editing ?? {
    nome_interno: "", client_id: "", project_id: "", business_id: "", waba_id: "", status: "ativo", observacoes: "",
  });
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  return (
    <DialogContent className="max-w-xl">
      <DialogHeader><DialogTitle>{editing ? "Editar WABA" : "Nova WABA"}</DialogTitle></DialogHeader>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label>Nome interno *</Label><Input value={form.nome_interno} onChange={(e) => set("nome_interno", e.target.value)} /></div>
        <div><Label>WABA ID *</Label><Input value={form.waba_id} onChange={(e) => set("waba_id", e.target.value)} placeholder="37857640713834515" /></div>
        <div><Label>Business ID</Label><Input value={form.business_id ?? ""} onChange={(e) => set("business_id", e.target.value)} /></div>
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
          <Select value={form.status} onValueChange={(v) => set("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ativo">Ativo</SelectItem>
              <SelectItem value="inativo">Inativo</SelectItem>
              <SelectItem value="suspenso">Suspenso</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2"><Label>Observações</Label><Textarea rows={3} value={form.observacoes ?? ""} onChange={(e) => set("observacoes", e.target.value)} /></div>
      </div>
      <DialogFooter><Button disabled={saving} onClick={() => onSubmit(form)}>Salvar</Button></DialogFooter>
    </DialogContent>
  );
}

function QuickConnectDialog({
  workspaces, saving, onSubmit,
}: {
  workspaces: any[];
  saving: boolean;
  onSubmit: (p: { raw: string; workspace_id: string | null }) => void;
}) {
  const [raw, setRaw] = useState("");
  const [ws, setWs] = useState<string>("__none__");
  const example = `WABA:
Jéssica
Identificação:
1000997246176920
Propriedade de: BM Fio 10 Jeans

Número:
Perfil do telefone
Identificação:
1133638443176122
Jéssica
+55 11 95502-2059`;
  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Conexão rápida de WhatsApp</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Cole os dados da WABA e do número exatamente como aparecem no Business Manager
          (nome, "Identificação", "Propriedade de" e o telefone com o +). O sistema cria a WABA,
          vincula o número e tenta sincronizar com a Meta automaticamente.
        </p>
        <div>
          <Label>Dados colados *</Label>
          <Textarea
            rows={12}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={example}
            className="font-mono text-xs"
          />
        </div>
        <div>
          <Label>Workspace do cliente (opcional)</Label>
          <Select value={ws} onValueChange={setWs}>
            <SelectTrigger><SelectValue placeholder="Não vincular agora" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Não vincular agora</SelectItem>
              {workspaces.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Se escolher um workspace vazio, esse número vira o padrão para disparos.
          </p>
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={saving || raw.trim().length < 10}
          onClick={() => onSubmit({ raw, workspace_id: ws === "__none__" ? null : ws })}
        >
          {saving ? "Conectando…" : "Conectar"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
