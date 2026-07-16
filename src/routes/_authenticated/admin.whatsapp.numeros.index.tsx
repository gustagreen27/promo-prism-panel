import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, RefreshCw, Cloud, PhoneCall, ShieldCheck, KeyRound, UserCog } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { ErrorCard } from "@/components/admin/query-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { listNumbers, createNumber, updateNumber, deleteNumber } from "@/lib/whatsapp-numbers.functions";
import { updateConnectionToken, getConnectionCredentials, debugConnectionToken, getConnectionSubscribedApps, subscribeAppToWaba } from "@/lib/wa-diagnosis.functions";
import { syncAllWabas } from "@/lib/wa-meta-sync.functions";
import { addNumberToWaba, requestNumberCode, verifyNumberCode, registerNumberOnCloud } from "@/lib/wa-meta-api.functions";
import { listWabas } from "@/lib/wa-wabas.functions";
import { listClients } from "@/lib/clients.functions";
import { listProjects } from "@/lib/projects.functions";

export const Route = createFileRoute("/_authenticated/admin/whatsapp/numeros/")({
  head: () => ({ meta: [{ title: "Números WhatsApp" }] }),
  component: Page,
});

function Page() {
  const listFn = useServerFn(listNumbers);
  const create = useServerFn(createNumber);
  const update = useServerFn(updateNumber);
  const remove = useServerFn(deleteNumber);
  
  const syncAll = useServerFn(syncAllWabas);
  const clientsFn = useServerFn(listClients);
  const projectsFn = useServerFn(listProjects);
  const wabasFn = useServerFn(listWabas);
  const qc = useQueryClient();

  const numbersQuery = useQuery({ queryKey: ["wa-numbers"], queryFn: () => listFn() });
  const { data: rows, isLoading, error: rowsError, refetch: refetchRows } = numbersQuery;
  const clientsQuery = useQuery({ queryKey: ["clients"], queryFn: () => clientsFn() });
  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: () => projectsFn() });
  const wabasQuery = useQuery({ queryKey: ["wa-wabas"], queryFn: () => wabasFn() });
  const clients = clientsQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const wabas = wabasQuery.data ?? [];

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [apiOpen, setApiOpen] = useState(false);
  const [credsEditing, setCredsEditing] = useState<any>(null);

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

  const syncMut = useMutation({
    mutationFn: () => syncAll(),
    onSuccess: (r: any) => {
      const t = r?.totals;
      toast.success(`Sync: ${t?.created ?? 0} novos, ${t?.updated ?? 0} atualizados, ${t?.marked_missing ?? 0} sumidos${t?.errors ? `, ${t.errors} erro(s)` : ""}`);
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao sincronizar"),
  });

  return (
    <>
      <PageHeader
        title="Números WhatsApp Cloud API"
        description="Configure os números oficiais Meta usados pelos disparos."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" disabled={syncMut.isPending} onClick={() => syncMut.mutate()}>
              <RefreshCw className={`mr-2 h-4 w-4 ${syncMut.isPending ? "animate-spin" : ""}`} />
              Sincronizar agora
            </Button>
            <Button size="sm" onClick={() => setApiOpen(true)}>
              <Cloud className="mr-2 h-4 w-4" />Adicionar via API
            </Button>
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
              <DialogTrigger asChild><Button variant="outline" size="sm"><Plus className="mr-2 h-4 w-4" />Cadastro manual</Button></DialogTrigger>
              <FormDialog editing={editing} clients={clients} projects={projects} onSubmit={(p: any) => saveMut.mutate(p)} saving={saveMut.isPending} />
            </Dialog>
          </div>
        }
      />
      {(clientsQuery.error || projectsQuery.error || wabasQuery.error) && (
        <ErrorCard
          error={clientsQuery.error || projectsQuery.error || wabasQuery.error}
          onRetry={() => { clientsQuery.refetch(); projectsQuery.refetch(); wabasQuery.refetch(); }}
        />
      )}
      <div className="rounded-xl border bg-card">
        {isLoading ? <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
        : rowsError ? <div className="p-4"><ErrorCard error={rowsError} onRetry={() => refetchRows()} /></div>
        : !rows || rows.length === 0 ? <EmptyState title="Nenhum número cadastrado" />
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
                  <Button asChild size="icon" variant="ghost" title="Gerenciar perfil">
                    <Link to="/admin/whatsapp/numeros/$id/perfil" params={{ id: r.id }}><UserCog className="h-4 w-4" /></Link>
                  </Button>
                  <Button size="icon" variant="ghost" title="Trocar credenciais Meta (token, App ID, App Secret) sem alterar outros dados" onClick={() => setCredsEditing(r)}>
                    <KeyRound className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => confirm("Remover este número?") && delMut.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>}
      </div>

      <Dialog open={apiOpen} onOpenChange={setApiOpen}>
        <AddNumberWizard wabas={wabas} onDone={() => { setApiOpen(false); refresh(); }} />
      </Dialog>

      <Dialog open={!!credsEditing} onOpenChange={(v) => { if (!v) setCredsEditing(null); }}>
        {credsEditing && (
          <CredentialsDialog
            connection={credsEditing}
            onClose={() => setCredsEditing(null)}
            onSaved={() => { setCredsEditing(null); refresh(); }}
          />
        )}
      </Dialog>
    </>
  );
}

function AddNumberWizard({ wabas, onDone }: { wabas: any[]; onDone: () => void }) {
  const addFn = useServerFn(addNumberToWaba);
  const reqFn = useServerFn(requestNumberCode);
  const verFn = useServerFn(verifyNumberCode);
  const regFn = useServerFn(registerNumberOnCloud);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [waba_ref_id, setWaba] = useState<string>("");
  const [cc, setCc] = useState("55");
  const [phone, setPhone] = useState("");
  const [verified_name, setName] = useState("");
  const [connection_id, setConnId] = useState<string>("");
  const [code_method, setMethod] = useState<"SMS" | "VOICE">("SMS");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");

  const [loading, setLoading] = useState(false);

  async function step1() {
    if (!waba_ref_id || !cc || !phone || !verified_name) return toast.error("Preencha WABA, DDI, número e nome.");
    setLoading(true);
    try {
      const r: any = await addFn({ data: { waba_ref_id, cc, phone_number: phone, verified_name } });
      setConnId(r.connection.id);
      toast.success(`Número criado (phone_number_id ${r.phone_number_id})`);
      setStep(2);
    } catch (e: any) { toast.error(e?.message ?? "Erro"); } finally { setLoading(false); }
  }
  async function step2() {
    if (!connection_id) return;
    setLoading(true);
    try {
      await reqFn({ data: { connection_id, code_method, language: "pt_BR" } });
      toast.success(`Código enviado por ${code_method}`);
      setStep(3);
    } catch (e: any) { toast.error(e?.message ?? "Erro"); } finally { setLoading(false); }
  }
  async function step3() {
    if (!code) return toast.error("Informe o código recebido.");
    setLoading(true);
    try {
      await verFn({ data: { connection_id, code } });
      toast.success("Número verificado");
      setStep(4);
    } catch (e: any) { toast.error(e?.message ?? "Erro"); } finally { setLoading(false); }
  }
  async function step4() {
    if (!/^\d{6}$/.test(pin)) return toast.error("PIN deve ter 6 dígitos.");
    setLoading(true);
    try {
      await regFn({ data: { connection_id, pin } });
      toast.success("Registrado na Cloud API!");
      onDone();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); } finally { setLoading(false); }
  }

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          Adicionar número via API — passo {step}/4
        </DialogTitle>
      </DialogHeader>

      {step === 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><Label>WABA *</Label>
            <Select value={waba_ref_id} onValueChange={setWaba}>
              <SelectTrigger><SelectValue placeholder="Escolha uma WABA" /></SelectTrigger>
              <SelectContent>{wabas.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.nome_interno} · {w.waba_id}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>DDI *</Label><Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="55" /></div>
          <div><Label>Número (sem DDI) *</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="11999999999" /></div>
          <div className="sm:col-span-2"><Label>Nome de exibição *</Label><Input value={verified_name} onChange={(e) => setName(e.target.value)} placeholder="Minha Empresa" /></div>
          <DialogFooter className="sm:col-span-2"><Button disabled={loading} onClick={step1}><Plus className="mr-2 h-4 w-4" />Criar número na WABA</Button></DialogFooter>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <p className="text-sm">Escolha como receber o código de verificação:</p>
          <Select value={code_method} onValueChange={(v: any) => setMethod(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="SMS">SMS</SelectItem>
              <SelectItem value="VOICE">Ligação</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter><Button disabled={loading} onClick={step2}><PhoneCall className="mr-2 h-4 w-4" />Enviar código</Button></DialogFooter>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <Label>Código recebido *</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
          <DialogFooter><Button disabled={loading} onClick={step3}><ShieldCheck className="mr-2 h-4 w-4" />Verificar</Button></DialogFooter>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3">
          <Label>PIN de 2 fatores (6 dígitos) *</Label>
          <Input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="000000" maxLength={6} />
          <p className="text-xs text-muted-foreground">Guarde este PIN — ele será usado para futuros re-registros do número.</p>
          <DialogFooter><Button disabled={loading} onClick={step4}><KeyRound className="mr-2 h-4 w-4" />Registrar na Cloud API</Button></DialogFooter>
        </div>
      )}
    </DialogContent>
  );
}


function initialNumberForm(editing: any) {
  return editing ? { ...editing, access_token: "" } : {
    name: "", display_phone: "", phone: "", provider: "meta_cloud", phone_number_id: "",
    waba_id: "", business_id: "", access_token: "", verify_token: "", webhook_url: "",
    quality_rating: "", daily_limit: 1000, graph_api_version: "v21.0",
    client_id: "", project_id: "", status: "ativa",
  };
}

function FormDialog({ editing, clients, projects, onSubmit, saving }: any) {
  const [form, setForm] = useState<any>(() => initialNumberForm(editing));
  useEffect(() => { setForm(initialNumberForm(editing)); }, [editing]);
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
        <div className="sm:col-span-2"><Label>Access Token (permanente){editing ? " — deixe em branco para manter" : ""}</Label><Input type="password" value={form.access_token ?? ""} onChange={(e) => set("access_token", e.target.value)} placeholder={editing ? "Cole apenas se quiser trocar" : "EAAG…"} autoComplete="off" /></div>
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
