import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Copy,
  KeyRound,
  Loader2,
  Plug,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import {
  addMetaPhoneNumber,
  createMetaTemplate,
  createMetaWaba,
  getMetaAssetCreds,
  listMetaTemplates,
  listMetaWabas,
  metaAssetHealth,
  requestMetaPhoneCode,
  saveMetaAssetCreds,
  testMetaAssetConnection,
  verifyMetaPhoneCode,
} from "@/lib/meta-assets.functions";

export const Route = createFileRoute("/_authenticated/admin/meta-ativos")({
  head: () => ({
    meta: [
      { title: "Gestão de Ativos Meta — next DISPAROS" },
      {
        name: "description",
        content: "Provisionamento de WABAs, números e templates direto pela Graph API da Meta.",
      },
      { property: "og:title", content: "Gestão de Ativos Meta — next DISPAROS" },
      {
        property: "og:description",
        content: "Crie WABAs, registre números, envie templates e monitore a saúde dos ativos Meta.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function copy(text: string) {
  void navigator.clipboard.writeText(text);
  toast.success("Copiado");
}

function Page() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestão de Ativos Meta"
        description="Provisionamento técnico via Graph API — WABAs, números, templates e saúde."
      />
      <Tabs defaultValue="auth">
        <TabsList className="flex-wrap">
          <TabsTrigger value="auth" className="gap-2">
            <KeyRound className="h-4 w-4" /> Conexão
          </TabsTrigger>
          <TabsTrigger value="waba" className="gap-2">
            <Plus className="h-4 w-4" /> WABAs
          </TabsTrigger>
          <TabsTrigger value="numeros" className="gap-2">
            <Smartphone className="h-4 w-4" /> Números
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2">
            <Send className="h-4 w-4" /> Templates
          </TabsTrigger>
          <TabsTrigger value="saude" className="gap-2">
            <ShieldCheck className="h-4 w-4" /> Saúde
          </TabsTrigger>
        </TabsList>

        <TabsContent value="auth" className="mt-4">
          <AuthPanel />
        </TabsContent>
        <TabsContent value="waba" className="mt-4">
          <WabaPanel />
        </TabsContent>
        <TabsContent value="numeros" className="mt-4">
          <NumbersPanel />
        </TabsContent>
        <TabsContent value="templates" className="mt-4">
          <TemplatesPanel />
        </TabsContent>
        <TabsContent value="saude" className="mt-4">
          <HealthPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AuthPanel() {
  const qc = useQueryClient();
  const get = useServerFn(getMetaAssetCreds);
  const save = useServerFn(saveMetaAssetCreds);
  const test = useServerFn(testMetaAssetConnection);
  const { data } = useQuery({ queryKey: ["meta-assets", "creds"], queryFn: () => get() });
  const [businessId, setBusinessId] = useState("");
  const [token, setToken] = useState("");

  const saveMut = useMutation({
    mutationFn: () => save({ data: { business_id: businessId.trim(), access_token: token.trim() } }),
    onSuccess: () => {
      toast.success("Credenciais salvas");
      setToken("");
      void qc.invalidateQueries({ queryKey: ["meta-assets"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar"),
  });

  const testMut = useMutation({
    mutationFn: () => test(),
    onSuccess: (r: any) => (r.ok ? toast.success(r.message) : toast.error(r.message)),
    onError: (e: any) => toast.error(e?.message ?? "Falha ao testar"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Plug className="h-4 w-4" /> Painel de conexão
        </CardTitle>
        <CardDescription>
          O token é armazenado no backend e nunca fica exposto no navegador. Requer permissão{" "}
          <code className="rounded bg-muted px-1">whatsapp_business_management</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data?.configured ? (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            Configurado — Business ID <strong>{data.business_id}</strong> · token{" "}
            <code>{data.token_masked}</code>
          </div>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Business ID</Label>
            <Input
              value={businessId}
              onChange={(e) => setBusinessId(e.target.value)}
              placeholder="Ex.: 1047578338203627"
            />
          </div>
          <div className="space-y-1.5">
            <Label>System User Access Token</Label>
            <Input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="EAAG..."
              autoComplete="off"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || !businessId.trim() || token.trim().length < 20}
          >
            {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Salvar credenciais
          </Button>
          <Button variant="outline" onClick={() => testMut.mutate()} disabled={testMut.isPending}>
            {testMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
            Testar conexão
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function useWabas() {
  const list = useServerFn(listMetaWabas);
  return useQuery({ queryKey: ["meta-assets", "wabas"], queryFn: () => list() });
}

function WabaPanel() {
  const qc = useQueryClient();
  const create = useServerFn(createMetaWaba);
  const wabas = useWabas();
  const [name, setName] = useState("");
  const [created, setCreated] = useState("");

  const mut = useMutation({
    mutationFn: () => create({ data: { name: name.trim(), currency: "BRL", timezone_id: "1" } }),
    onSuccess: (r: any) => {
      if (!r.ok) return toast.error(r.message);
      setCreated(r.waba_id);
      toast.success(`WABA criada: ${r.waba_id}`);
      void qc.invalidateQueries({ queryKey: ["meta-assets", "wabas"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao criar WABA"),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4" /> Criar nova WABA
          </CardTitle>
          <CardDescription>POST /{"{business_id}"}/whatsapp_business_accounts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome da WABA</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Operação SP 01" />
          </div>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || name.trim().length < 2}>
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Criar nova WABA
          </Button>
          {created ? (
            <div className="space-y-1.5">
              <Label>WABA_ID gerado</Label>
              <div className="flex gap-2">
                <Input readOnly value={created} className="font-mono" />
                <Button variant="outline" size="icon" onClick={() => copy(created)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">WABAs da BM</CardTitle>
          <Button variant="ghost" size="icon" onClick={() => wabas.refetch()}>
            <RefreshCw className={`h-4 w-4 ${wabas.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent>
          {wabas.data?.error ? (
            <p className="text-sm text-destructive">{wabas.data.error}</p>
          ) : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(wabas.data?.wabas ?? []).map((w: any) => (
                <TableRow key={w.id}>
                  <TableCell>{w.name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">
                    <button className="hover:underline" onClick={() => copy(String(w.id))}>
                      {w.id}
                    </button>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{w.account_review_status ?? "—"}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {!wabas.isLoading && (wabas.data?.wabas ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-sm text-muted-foreground">
                    Nenhuma WABA retornada.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function NumbersPanel() {
  const add = useServerFn(addMetaPhoneNumber);
  const request = useServerFn(requestMetaPhoneCode);
  const verify = useServerFn(verifyMetaPhoneCode);

  const [wabaId, setWabaId] = useState("");
  const [cc, setCc] = useState("55");
  const [phone, setPhone] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [method, setMethod] = useState<"SMS" | "VOICE">("SMS");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");

  const addMut = useMutation({
    mutationFn: () =>
      add({ data: { waba_id: wabaId.trim(), cc, phone_number: phone, verified_name: displayName.trim() } }),
    onSuccess: (r: any) => {
      if (!r.ok) return toast.error(r.message);
      setPhoneNumberId(r.phone_number_id);
      toast.success(`Número criado: ${r.phone_number_id}`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao adicionar número"),
  });

  const codeMut = useMutation({
    mutationFn: () => request({ data: { phone_number_id: phoneNumberId.trim(), code_method: method, language: "pt_BR" } }),
    onSuccess: (r: any) => (r.ok ? toast.success("Código solicitado — verifique o telefone") : toast.error(r.message)),
    onError: (e: any) => toast.error(e?.message ?? "Falha ao solicitar código"),
  });

  const verifyMut = useMutation({
    mutationFn: () =>
      verify({
        data: {
          phone_number_id: phoneNumberId.trim(),
          code: code.trim(),
          ...(pin.trim() ? { pin: pin.trim() } : {}),
        },
      }),
    onSuccess: (r: any) => (r.ok ? toast.success(r.message ?? "Número verificado") : toast.error(r.message)),
    onError: (e: any) => toast.error(e?.message ?? "Falha ao confirmar registro"),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="h-4 w-4" /> Registrar número
          </CardTitle>
          <CardDescription>POST /{"{waba_id}"}/phone_numbers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>WABA_ID</Label>
            <Input value={wabaId} onChange={(e) => setWabaId(e.target.value)} className="font-mono" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>DDI</Label>
              <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="55" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Número (DDD + número)</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="11999999999" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Nome de exibição</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <Button
            onClick={() => addMut.mutate()}
            disabled={addMut.isPending || !wabaId.trim() || !phone.trim() || displayName.trim().length < 2}
          >
            {addMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Adicionar número à WABA
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Verificação</CardTitle>
          <CardDescription>request_code → verify_code → register</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>PHONE_NUMBER_ID</Label>
            <div className="flex gap-2">
              <Input
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                className="font-mono"
              />
              <Button variant="outline" size="icon" onClick={() => copy(phoneNumberId)} disabled={!phoneNumberId}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label>Método</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as "SMS" | "VOICE")}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SMS">SMS</SelectItem>
                  <SelectItem value="VOICE">Voz</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={() => codeMut.mutate()} disabled={codeMut.isPending || !phoneNumberId}>
              {codeMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Solicitar código
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Código (6 dígitos)</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>PIN de 2 etapas (opcional)</Label>
              <Input value={pin} onChange={(e) => setPin(e.target.value)} maxLength={6} className="font-mono" />
            </div>
          </div>
          <Button
            onClick={() => verifyMut.mutate()}
            disabled={verifyMut.isPending || !/^\d{6}$/u.test(code.trim()) || !phoneNumberId}
          >
            {verifyMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Confirmar registro
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

const TPL_STATUS: Record<string, string> = {
  APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  REJECTED: "border-red-200 bg-red-50 text-red-700",
};

function TemplatesPanel() {
  const qc = useQueryClient();
  const create = useServerFn(createMetaTemplate);
  const list = useServerFn(listMetaTemplates);
  const [wabaId, setWabaId] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("UTILITY");
  const [language, setLanguage] = useState("pt_BR");
  const [body, setBody] = useState("");

  const templates = useQuery({
    queryKey: ["meta-assets", "templates", wabaId],
    queryFn: () => list({ data: { waba_id: wabaId.trim() } }),
    enabled: wabaId.trim().length > 3,
  });

  const mut = useMutation({
    mutationFn: () =>
      create({
        data: {
          waba_id: wabaId.trim(),
          name: name.trim().toLowerCase(),
          category: category as "MARKETING" | "UTILITY" | "AUTHENTICATION",
          language,
          body: body.trim(),
        },
      }),
    onSuccess: (r: any) => {
      if (!r.ok) return toast.error(r.message);
      toast.success(`Template enviado — status ${r.status}`);
      void qc.invalidateQueries({ queryKey: ["meta-assets", "templates"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao enviar template"),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="h-4 w-4" /> Fast-upload de template
          </CardTitle>
          <CardDescription>POST /{"{waba_id}"}/message_templates</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1.5 md:col-span-2">
              <Label>WABA_ID</Label>
              <Input value={wabaId} onChange={(e) => setWabaId(e.target.value)} className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>Nome do template</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="utl_cy_01" />
            </div>
            <div className="space-y-1.5">
              <Label>Idioma</Label>
              <Input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="pt_BR" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MARKETING">Marketing</SelectItem>
                <SelectItem value="UTILITY">Utility</SelectItem>
                <SelectItem value="AUTHENTICATION">Authentication</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Corpo do texto</Label>
            <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !wabaId.trim() || name.trim().length < 3 || body.trim().length < 2}
          >
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar para aprovação
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Status dos templates</CardTitle>
          <Button variant="ghost" size="icon" onClick={() => templates.refetch()} disabled={!wabaId.trim()}>
            <RefreshCw className={`h-4 w-4 ${templates.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent>
          {templates.data?.error ? <p className="text-sm text-destructive">{templates.data.error}</p> : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Idioma</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Motivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(templates.data?.templates ?? []).map((t: any) => (
                <TableRow key={`${t.id}-${t.language}`}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>{t.category}</TableCell>
                  <TableCell>{t.language}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={TPL_STATUS[String(t.status)] ?? ""}>
                      {t.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {wabaId.trim() && !templates.isLoading && (templates.data?.templates ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-muted-foreground">
                    Nenhum template nesta WABA.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function HealthPanel() {
  const health = useServerFn(metaAssetHealth);
  const [wabaId, setWabaId] = useState("");
  const q = useQuery({
    queryKey: ["meta-assets", "health", wabaId],
    queryFn: () => health({ data: { waba_id: wabaId.trim() } }),
    enabled: wabaId.trim().length > 3,
  });

  const qualityClass = (q0: string) =>
    q0 === "GREEN"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : q0 === "YELLOW"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : q0 === "RED"
          ? "border-red-200 bg-red-50 text-red-700"
          : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" /> Monitor de saúde
        </CardTitle>
        <CardDescription>
          Quality rating da Meta + health score local (penalizado pelos erros 131048 e 131049 dos últimos 7 dias).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={wabaId}
            onChange={(e) => setWabaId(e.target.value)}
            placeholder="WABA_ID"
            className="max-w-sm font-mono"
          />
          <Button variant="outline" onClick={() => q.refetch()} disabled={!wabaId.trim() || q.isFetching}>
            {q.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </Button>
        </div>
        {q.data?.error ? <p className="text-sm text-destructive">{q.data.error}</p> : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Qualidade</TableHead>
              <TableHead>Health score</TableHead>
              <TableHead>Envios 7d</TableHead>
              <TableHead>131048/49</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(q.data?.numbers ?? []).map((n: any) => (
              <TableRow key={n.id}>
                <TableCell className="font-mono text-xs">{n.display_phone_number}</TableCell>
                <TableCell>{n.verified_name}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={qualityClass(n.quality_rating)}>
                    {n.quality_rating}
                  </Badge>
                </TableCell>
                <TableCell className="font-semibold">{n.health_score}</TableCell>
                <TableCell>{n.messages_7d}</TableCell>
                <TableCell>{n.restricted_errors_7d}</TableCell>
              </TableRow>
            ))}
            {wabaId.trim() && !q.isLoading && (q.data?.numbers ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-sm text-muted-foreground">
                  Nenhum número nesta WABA.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
