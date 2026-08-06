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
import { updateConnectionToken, getConnectionCredentials, debugConnectionToken, getConnectionSubscribedApps, subscribeAppToWaba, getConnectionHealthStatus } from "@/lib/wa-diagnosis.functions";
import { syncAllWabas } from "@/lib/wa-meta-sync.functions";
import { addNumberToWaba, requestNumberCode, verifyNumberCode, registerNumberOnCloud, subscribeWabaWebhooks, listWabaNumbers } from "@/lib/wa-meta-api.functions";
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
      {isLoading ? (
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Carregando…</div>
      ) : rowsError ? (
        <div className="rounded-xl border bg-card p-4"><ErrorCard error={rowsError} onRetry={() => refetchRows()} /></div>
      ) : !rows || rows.length === 0 ? (
        <div className="rounded-xl border bg-card"><EmptyState title="Nenhum número cadastrado" /></div>
      ) : (
        <NumbersGrouped
          rows={rows}
          wabas={wabas}
          onEdit={(r: any) => { setEditing(r); setOpen(true); }}
          onCreds={(r: any) => setCredsEditing(r)}
          onDelete={(id: string) => delMut.mutate(id)}
        />
      )}

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
  const subFn = useServerFn(subscribeWabaWebhooks);
  const listFn = useServerFn(listWabaNumbers);
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [waba_ref_id, setWaba] = useState<string>("");
  const [cc, setCc] = useState("55");
  const [phone, setPhone] = useState("");
  const [verified_name, setName] = useState("");
  const [connection_id, setConnId] = useState<string>("");
  const [code_method, setMethod] = useState<"SMS" | "VOICE">("SMS");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [numbers, setNumbers] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);

  const STEPS = [
    "Adicionar número à WABA",
    "Solicitar código",
    "Confirmar código",
    "Registrar na Cloud API",
    "Assinar webhooks",
    "Conferir números",
  ];

  async function step1() {
    if (!waba_ref_id || !cc || !phone || !verified_name) return toast.error("Preencha WABA, DDI, número e nome.");
    setLoading(true);
    try {
      const r: any = await addFn({ data: { waba_ref_id, cc, phone_number: phone, verified_name } });
      setConnId(r.connection.id);
      toast.success(r.reused
        ? `Número já existia na WABA — reutilizando ${r.phone_number_id}`
        : `Número criado (phone_number_id ${r.phone_number_id})`);
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
      setStep(5);
    } catch (e: any) { toast.error(e?.message ?? "Erro"); } finally { setLoading(false); }
  }
  async function step5() {
    setLoading(true);
    try {
      await subFn({ data: { waba_ref_id } });
      toast.success("Webhooks assinados na WABA");
      await loadNumbers();
      setStep(6);
    } catch (e: any) { toast.error(e?.message ?? "Erro"); } finally { setLoading(false); }
  }
  async function loadNumbers() {
    try {
      const r: any = await listFn({ data: { waba_ref_id } });
      setNumbers(Array.isArray(r) ? r : []);
    } catch (e: any) { toast.error(e?.message ?? "Erro ao listar números"); }
  }

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Adicionar número via API — passo {step}/6</DialogTitle>
        <DialogDescription>{STEPS[step - 1]}</DialogDescription>
      </DialogHeader>

      <ol className="mb-2 flex flex-wrap gap-1.5 text-[11px]">
        {STEPS.map((s, i) => (
          <li key={s}
            className={`rounded-full border px-2 py-0.5 ${i + 1 < step ? "border-primary/40 bg-primary/10 text-primary" : i + 1 === step ? "border-foreground/30 font-medium" : "text-muted-foreground"}`}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

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
          <p className="sm:col-span-2 text-xs text-muted-foreground">
            Se o número já estiver na WABA, o cadastro reutiliza o Phone Number ID existente e segue direto para a verificação.
          </p>
          <DialogFooter className="sm:col-span-2">
            <Button variant="ghost" disabled={!waba_ref_id || loading} onClick={async () => { await loadNumbers(); setStep(6); }}>
              Já existe — ver números da WABA
            </Button>
            <Button disabled={loading} onClick={step1}><Plus className="mr-2 h-4 w-4" />Adicionar número à WABA</Button>
          </DialogFooter>
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
          <DialogFooter>
            <Button variant="ghost" disabled={loading} onClick={() => setStep(2)}>Reenviar código</Button>
            <Button disabled={loading} onClick={step3}><ShieldCheck className="mr-2 h-4 w-4" />Verificar</Button>
          </DialogFooter>
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

      {step === 5 && (
        <div className="space-y-3">
          <p className="text-sm">
            Último passo obrigatório: assinar o aplicativo aos webhooks da WABA para receber status de entrega e mensagens recebidas.
          </p>
          <DialogFooter>
            <Button variant="ghost" disabled={loading} onClick={async () => { await loadNumbers(); setStep(6); }}>Pular</Button>
            <Button disabled={loading} onClick={step5}><ShieldCheck className="mr-2 h-4 w-4" />Assinar webhooks</Button>
          </DialogFooter>
        </div>
      )}

      {step === 6 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Números da WABA</p>
            <Button size="sm" variant="outline" onClick={loadNumbers}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button>
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Número</TableHead><TableHead>Nome</TableHead>
                <TableHead>Verificação</TableHead><TableHead>Qualidade</TableHead><TableHead>Phone Number ID</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {numbers.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground">Nenhum número retornado.</TableCell></TableRow>
                ) : numbers.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="font-medium">{n.display_phone_number ?? "—"}</TableCell>
                    <TableCell>{n.verified_name ?? "—"}</TableCell>
                    <TableCell><Badge variant={n.code_verification_status === "VERIFIED" ? "default" : "secondary"}>{n.code_verification_status ?? "—"}</Badge></TableCell>
                    <TableCell>{n.quality_rating ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{n.id}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter><Button onClick={onDone}>Concluir</Button></DialogFooter>
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

// ────────────────────────────────────────────────────────────────────
// CredentialsDialog — troca token/App ID/App Secret/verify_token/business_id
// de uma conexão isoladamente, com diagnóstico integrado.
// Nunca mistura token da conexão com App Secret global.
// ────────────────────────────────────────────────────────────────────
function CredentialsDialog({ connection, onClose, onSaved }: { connection: any; onClose: () => void; onSaved: () => void }) {
  const getCreds = useServerFn(getConnectionCredentials);
  const updateCreds = useServerFn(updateConnectionToken);
  const debugFn = useServerFn(debugConnectionToken);
  const subAppsFn = useServerFn(getConnectionSubscribedApps);
  const subscribeFn = useServerFn(subscribeAppToWaba);
  const healthFn = useServerFn(getConnectionHealthStatus);

  const credsQuery = useQuery({
    queryKey: ["wa-conn-creds", connection.id],
    queryFn: () => getCreds({ data: { connection_id: connection.id } }),
  });
  const c: any = credsQuery.data;

  const [accessToken, setAccessToken] = useState("");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [useGlobal, setUseGlobal] = useState<boolean | null>(null);

  useEffect(() => {
    if (c) {
      setAppId(c.app_id ?? "");
      setBusinessId(c.business_id ?? "");
      setUseGlobal(!!c.use_global_token);
    }
  }, [c]);

  const [debugResult, setDebugResult] = useState<any>(null);
  const [subResult, setSubResult] = useState<any>(null);
  const [healthResult, setHealthResult] = useState<any>(null);

  const saveMut = useMutation({
    mutationFn: () => updateCreds({ data: {
      connection_id: connection.id,
      access_token: accessToken.trim() || undefined,
      app_id: appId.trim() || undefined,
      app_secret: appSecret.trim() || undefined,
      verify_token: verifyToken.trim() || undefined,
      business_id: businessId.trim() || undefined,
      use_global_token: useGlobal ?? undefined,
    } }),
    onSuccess: (r: any) => {
      toast.success(`Credenciais atualizadas${r?.last6 ? ` (token …${r.last6})` : ""}`);
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar"),
  });

  const debugMut = useMutation({
    mutationFn: () => debugFn({ data: { connection_id: connection.id } }),
    onSuccess: (r: any) => { setDebugResult(r); },
    onError: (e: any) => toast.error(e?.message ?? "Erro no diagnóstico"),
  });
  const subMut = useMutation({
    mutationFn: () => subAppsFn({ data: { connection_id: connection.id } }),
    onSuccess: (r: any) => { setSubResult(r); },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao consultar apps inscritos"),
  });
  const healthMut = useMutation({
    mutationFn: () => healthFn({ data: { connection_id: connection.id } }),
    onSuccess: (r: any) => { setHealthResult(r); },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao consultar health_status"),
  });
  const subscribeMut = useMutation({
    mutationFn: () => subscribeFn({ data: { connection_id: connection.id } }),
    onSuccess: () => { toast.success("Aplicativo inscrito no webhook"); subMut.mutate(); },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao inscrever"),
  });

  return (
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Credenciais Meta desta conexão</DialogTitle>
        <DialogDescription>
          {connection?.name ?? connection?.display_phone ?? "Conexão"} — cada conexão pode ter
          seu próprio Access Token, App ID e App Secret. Se marcar “Usar credenciais globais”,
          esta conexão utilizará as variáveis de ambiente do sistema.
        </DialogDescription>
      </DialogHeader>

      {credsQuery.isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : (
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!useGlobal}
              onChange={(e) => setUseGlobal(e.target.checked)}
            />
            Usar credenciais globais (variáveis do sistema)
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label>Access Token</Label>
              <Input
                type="password"
                autoComplete="off"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder={c?.access_token_mask ? `Credencial já configurada — termina em …${c.access_token_mask.last6}` : "EAAG…"}
              />
              <p className="text-xs text-muted-foreground mt-1">Deixe em branco para manter o valor atual.</p>
            </div>
            <div>
              <Label>Meta App ID</Label>
              <Input value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="ex.: 864475153084810" />
            </div>
            <div>
              <Label>Meta App Secret</Label>
              <Input
                type="password"
                autoComplete="off"
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
                placeholder={c?.app_secret_mask ? `Credencial já configurada — termina em …${c.app_secret_mask.last6}` : "app secret"}
              />
            </div>
            <div>
              <Label>Verify Token (webhook)</Label>
              <Input
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                placeholder={c?.verify_token_mask ? `Credencial já configurada — termina em …${c.verify_token_mask.last6}` : "verify token"}
              />
            </div>
            <div>
              <Label>Business ID</Label>
              <Input value={businessId} onChange={(e) => setBusinessId(e.target.value)} placeholder="opcional" />
            </div>
            <div>
              <Label>WABA ID</Label>
              <Input value={c?.waba_id ?? ""} disabled />
            </div>
            <div>
              <Label>Phone Number ID</Label>
              <Input value={c?.phone_number_id ?? ""} disabled />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <Button size="sm" variant="outline" onClick={() => debugMut.mutate()} disabled={debugMut.isPending}>
              {debugMut.isPending ? "Testando…" : "Testar token (debug_token)"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => subMut.mutate()} disabled={subMut.isPending}>
              {subMut.isPending ? "Consultando…" : "Ver apps inscritos"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => subscribeMut.mutate()} disabled={subscribeMut.isPending}>
              {subscribeMut.isPending ? "Inscrevendo…" : "Inscrever app no webhook"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => healthMut.mutate()} disabled={healthMut.isPending}>
              {healthMut.isPending ? "Verificando…" : "Saúde de envio (health_status)"}
            </Button>
          </div>

          {debugResult && (
            <div className="rounded-md border p-3 text-xs space-y-1 bg-muted/40">
              <div className="font-semibold">Resultado do debug_token ({debugResult.source})</div>
              <div>Token: {debugResult.token_last6 ? `…${debugResult.token_last6}` : "—"}</div>
              <div>App ID no token: <span className="font-mono">{debugResult.token_app_id ?? "—"}</span></div>
              <div>App ID configurado: <span className="font-mono">{debugResult.connection_app_id ?? "—"}</span></div>
              <div>Válido: {debugResult.is_valid ? "sim" : "não"}</div>
              {debugResult.app_id_matches === false && (
                <div className="text-destructive whitespace-pre-wrap">{debugResult.message}</div>
              )}
              {debugResult.error && (
                <div className="text-destructive">Erro: {debugResult.error?.message ?? JSON.stringify(debugResult.error)}</div>
              )}
              {debugResult.reason && <div className="text-destructive">{debugResult.reason}{debugResult.hint ? ` — ${debugResult.hint}` : ""}</div>}
            </div>
          )}

          {healthResult && (
            <div className="rounded-md border p-3 text-xs space-y-2 bg-muted/40">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">Saúde de envio — {healthResult.node_kind ?? "nó"} <span className="font-mono">{healthResult.node_id ?? "—"}</span></span>
                {healthResult.can_send_message && <HealthPill value={healthResult.can_send_message} />}
              </div>
              {healthResult.ok === false && (
                <div className="text-destructive">
                  {healthResult.reason ?? healthResult.error?.message ?? "Falha ao consultar"}
                </div>
              )}
              {(healthResult.entities ?? []).length > 0 && (
                <div className="space-y-1">
                  {(healthResult.entities as any[]).map((e, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 rounded border bg-background/60 px-2 py-1">
                      <span className="truncate">{e.entity_type} <span className="font-mono text-muted-foreground">{e.id}</span></span>
                      <HealthPill value={e.can_send_message} />
                    </div>
                  ))}
                </div>
              )}
              {(healthResult.errors ?? []).length > 0 && (
                <ul className="list-disc pl-5 space-y-0.5 text-destructive">
                  {(healthResult.errors as any[]).map((er, i) => (
                    <li key={i}>[{er.entity} · {er.error_code}] {er.error_description}{er.possible_solution ? ` — ${er.possible_solution}` : ""}</li>
                  ))}
                </ul>
              )}
              {(healthResult.additional_info ?? []).length > 0 && (
                <ul className="list-disc pl-5 space-y-0.5 text-amber-600 dark:text-amber-400">
                  {(healthResult.additional_info as any[]).map((a, i) => (
                    <li key={i}>[{a.entity}] {a.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {subResult && (
            <div className="rounded-md border p-3 text-xs space-y-1 bg-muted/40">
              <div className="font-semibold">Apps inscritos na WABA</div>
              <div>App esperado desta conexão: <span className="font-mono">{subResult.expected_app_id ?? "—"}</span></div>
              <div>
                Inscritos: {(subResult.subscribed ?? []).length === 0 ? "nenhum" : (subResult.subscribed as any[]).map((a) => `${a.name ?? "?"} (${a.app_id ?? "?"})`).join(", ")}
              </div>
              <div>
                Status: {subResult.is_subscribed === true ? "app da conexão está inscrito" :
                         subResult.is_subscribed === false ? "app da conexão NÃO está inscrito" : "indeterminado"}
              </div>
              {subResult.error && <div className="text-destructive">Erro: {subResult.error?.message ?? JSON.stringify(subResult.error)}</div>}
            </div>
          )}
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending || (!accessToken.trim() && !appId.trim() && !appSecret.trim() && !verifyToken.trim() && !businessId.trim() && useGlobal === !!c?.use_global_token)}
        >
          {saveMut.isPending ? "Salvando…" : "Salvar credenciais"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function HealthPill({ value }: { value: string | null }) {
  if (!value) return null;
  const cls =
    value === "AVAILABLE" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
    : value === "LIMITED" ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
    : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200";
  return <span className={`rounded px-1.5 py-0.5 font-medium ${cls}`}>{value}</span>;
}
