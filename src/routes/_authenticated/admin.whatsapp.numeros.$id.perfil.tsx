import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw, Save, Upload, Send, KeyRound, Stethoscope, Shield, CheckCircle2, XCircle, AlertCircle, History } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  getPhoneProfile, updatePhoneProfile, uploadPhoneProfilePicture,
  requestDisplayNameChange, applyDisplayName, diagnoseConnection, listProfileAuditLogs,
} from "@/lib/wa-profile.functions";
import {
  updateConnectionToken, toggleGlobalToken, applyFixPhoneNumberId,
  applyFixWabaId, subscribeAppToWaba,
} from "@/lib/wa-diagnosis.functions";
import { syncWabaNumbers } from "@/lib/wa-meta-sync.functions";

export const Route = createFileRoute("/_authenticated/admin/whatsapp/numeros/$id/perfil")({
  head: () => ({ meta: [{ title: "Perfil do número WhatsApp" }] }),
  component: Page,
});

const VERTICALS = [
  "UNDEFINED", "OTHER", "AUTO", "BEAUTY", "APPAREL", "EDU", "ENTERTAIN",
  "EVENT_PLAN", "FINANCE", "GROCERY", "GOVT", "HEALTH", "HOTEL",
  "NONPROFIT", "PROF_SERVICES", "RESTAURANT", "RETAIL", "TRAVEL",
];

const NAME_STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; dot: string }> = {
  APPROVED: { label: "Aprovado", variant: "default", dot: "bg-green-500" },
  PENDING_REVIEW: { label: "Em análise", variant: "secondary", dot: "bg-yellow-500" },
  DECLINED: { label: "Rejeitado", variant: "destructive", dot: "bg-red-500" },
  EXPIRED: { label: "Expirado", variant: "outline", dot: "bg-gray-400" },
  AVAILABLE_WITHOUT_REVIEW: { label: "Disponível sem análise", variant: "outline", dot: "bg-blue-400" },
  NONE: { label: "—", variant: "outline", dot: "bg-gray-300" },
};

type FormState = {
  about: string; description: string; address: string; email: string;
  website1: string; website2: string; vertical: string;
};

function DiffRow({ label, from, to }: { label: string; from?: string; to?: string }) {
  const changed = (from ?? "") !== (to ?? "");
  if (!changed) return null;
  return (
    <div className="rounded-md border p-2 text-sm">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="grid grid-cols-2 gap-2 mt-1">
        <div className="text-xs"><span className="text-muted-foreground">De: </span>{from || "—"}</div>
        <div className="text-xs"><span className="text-muted-foreground">Para: </span>{to || "—"}</div>
      </div>
    </div>
  );
}

function Page() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const getFn = useServerFn(getPhoneProfile);
  const updateFn = useServerFn(updatePhoneProfile);
  const uploadFn = useServerFn(uploadPhoneProfilePicture);
  const reqNameFn = useServerFn(requestDisplayNameChange);
  const applyNameFn = useServerFn(applyDisplayName);
  const diagFn = useServerFn(diagnoseConnection);
  const auditFn = useServerFn(listProfileAuditLogs);

  const q = useQuery({
    queryKey: ["wa-phone-profile", id],
    queryFn: () => getFn({ data: { connection_id: id } }),
  });

  const audit = useQuery({
    queryKey: ["wa-phone-audit", id],
    queryFn: () => auditFn({ data: { connection_id: id, limit: 20 } }),
  });

  const [form, setForm] = useState<FormState>({
    about: "", description: "", address: "", email: "",
    website1: "", website2: "", vertical: "UNDEFINED",
  });
  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const initial = useMemo<FormState>(() => {
    const p: any = (q.data as any)?.profile ?? {};
    return {
      about: p.about ?? "",
      description: p.description ?? "",
      address: p.address ?? "",
      email: p.email ?? "",
      website1: p.websites?.[0] ?? "",
      website2: p.websites?.[1] ?? "",
      vertical: p.vertical ?? "UNDEFINED",
    };
  }, [q.data]);

  useEffect(() => { setForm(initial); }, [initial]);

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const [confirmSave, setConfirmSave] = useState(false);
  const saveMut = useMutation({
    mutationFn: () => updateFn({
      data: {
        connection_id: id,
        about: form.about || undefined,
        description: form.description || undefined,
        address: form.address || undefined,
        email: form.email || undefined,
        websites: [form.website1, form.website2].filter((w) => w && w.trim()) as string[],
        vertical: form.vertical || undefined,
      },
    }),
    onSuccess: () => {
      toast.success("Perfil atualizado");
      setConfirmSave(false);
      qc.invalidateQueries({ queryKey: ["wa-phone-profile", id] });
      qc.invalidateQueries({ queryKey: ["wa-phone-audit", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível atualizar o perfil."),
  });

  const fileRef = useRef<HTMLInputElement>(null);
  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      if (!/^image\/(jpeg|jpg|png)$/i.test(file.type)) {
        throw new Error("Use JPEG ou PNG.");
      }
      if (file.size > 5 * 1024 * 1024) throw new Error("Máximo 5 MB.");
      const b64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      return uploadFn({ data: { connection_id: id, file_base64: b64, file_name: file.name } });
    },
    onSuccess: () => {
      toast.success("Foto atualizada");
      qc.invalidateQueries({ queryKey: ["wa-phone-profile", id] });
      qc.invalidateQueries({ queryKey: ["wa-phone-audit", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro no upload"),
  });

  const [newName, setNewName] = useState("");
  const reqNameMut = useMutation({
    mutationFn: () => reqNameFn({ data: { connection_id: id, new_display_name: newName.trim() } }),
    onSuccess: () => {
      toast.success("Solicitação enviada à Meta");
      setNewName("");
      qc.invalidateQueries({ queryKey: ["wa-phone-profile", id] });
      qc.invalidateQueries({ queryKey: ["wa-phone-audit", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const applyMut = useMutation({
    mutationFn: () => applyNameFn({ data: { connection_id: id, pin } }),
    onSuccess: () => {
      toast.success("Nome aplicado ao número");
      setPinOpen(false);
      setPin(""); // descarta imediatamente
      qc.invalidateQueries({ queryKey: ["wa-phone-profile", id] });
      qc.invalidateQueries({ queryKey: ["wa-phone-audit", id] });
    },
    onError: (e: any) => { setPin(""); toast.error(e?.message ?? "Erro"); },
  });

  const [diagOpen, setDiagOpen] = useState(false);
  const diagMut = useMutation({
    mutationFn: () => diagFn({ data: { connection_id: id } }),
    onSuccess: () => setDiagOpen(true),
    onError: (e: any) => toast.error(e?.message ?? "Erro no diagnóstico"),
  });

  // Fix action mutations
  const updateTokenFn = useServerFn(updateConnectionToken);
  const toggleGlobalFn = useServerFn(toggleGlobalToken);
  const fixPhoneFn = useServerFn(applyFixPhoneNumberId);
  const fixWabaFn = useServerFn(applyFixWabaId);
  const subscribeFn = useServerFn(subscribeAppToWaba);
  const syncNumbersFn = useServerFn(syncWabaNumbers);

  const [tokenDlg, setTokenDlg] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [wabaDlg, setWabaDlg] = useState(false);
  const [wabaInput, setWabaInput] = useState("");

  const runAgain = () => diagMut.mutate();
  const invAll = () => {
    qc.invalidateQueries({ queryKey: ["wa-phone-profile", id] });
    qc.invalidateQueries({ queryKey: ["wa-phone-audit", id] });
  };

  const updTokenMut = useMutation({
    mutationFn: () => updateTokenFn({ data: { connection_id: id, access_token: tokenInput.trim() } }),
    onSuccess: (r: any) => { toast.success(`Token atualizado (…${r.last6})`); setTokenDlg(false); setTokenInput(""); invAll(); runAgain(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao atualizar token"),
  });
  const togGlobalMut = useMutation({
    mutationFn: (use: boolean) => toggleGlobalFn({ data: { connection_id: id, use_global_token: use } }),
    onSuccess: () => { toast.success("Origem do token alterada"); invAll(); runAgain(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const fixPhoneMut = useMutation({
    mutationFn: (pn: string) => fixPhoneFn({ data: { connection_id: id, phone_number_id: pn } }),
    onSuccess: () => { toast.success("phone_number_id corrigido"); invAll(); runAgain(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const fixWabaMut = useMutation({
    mutationFn: () => fixWabaFn({ data: { connection_id: id, waba_id: wabaInput.trim() } }),
    onSuccess: () => { toast.success("waba_id corrigido"); setWabaDlg(false); setWabaInput(""); invAll(); runAgain(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const subscribeMut = useMutation({
    mutationFn: () => subscribeFn({ data: { connection_id: id } }),
    onSuccess: () => { toast.success("Aplicativo inscrito no webhook"); runAgain(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao inscrever"),
  });
  const syncNumbersMut = useMutation({
    mutationFn: (waba_ref_id: string) => syncNumbersFn({ data: { waba_ref_id } }),
    onSuccess: (r: any) => { toast.success(`Sincronizado: ${r.total_from_meta} número(s) da WABA`); invAll(); runAgain(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro na sincronização"),
  });

  const phone: any = (q.data as any)?.phone ?? {};
  const profile: any = (q.data as any)?.profile ?? {};
  const connMeta: any = (q.data as any)?.connection ?? {};
  const newStatus = NAME_STATUS_LABEL[phone.new_name_status ?? "NONE"] ?? NAME_STATUS_LABEL.NONE;
  const currentStatus = NAME_STATUS_LABEL[phone.name_status ?? "NONE"] ?? NAME_STATUS_LABEL.NONE;
  const canApply = phone.new_name_status === "APPROVED";

  return (
    <>
      <PageHeader
        title="Perfil do número"
        description={phone.display_phone_number ? `${phone.display_phone_number} · ${phone.verified_name ?? ""}` : "Gerencie foto, dados comerciais e nome de exibição."}
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/whatsapp/numeros"><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => diagMut.mutate()} disabled={diagMut.isPending}>
              <Stethoscope className={`mr-2 h-4 w-4 ${diagMut.isPending ? "animate-pulse" : ""}`} />Testar conexão
            </Button>
            <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} />Sincronizar
            </Button>
          </div>
        }
      />

      {q.isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Carregando perfil…</div>
      ) : q.isError ? (
        <div className="rounded-xl border bg-card p-6 text-sm text-destructive">{(q.error as any)?.message ?? "Erro ao carregar."}</div>
      ) : (
        <div className="space-y-4">
          {(q.data as any)?.meta_error ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 text-sm space-y-2">
              <div className="font-semibold text-destructive">Não foi possível carregar o perfil da Meta</div>
              <div className="text-foreground/90">{(q.data as any).meta_error.message}</div>
              <div className="text-muted-foreground">{(q.data as any).meta_error.hint}</div>
              <div className="text-xs text-muted-foreground pt-1">
                <span className="font-mono">phone_number_id:</span> {connMeta.phone_number_id ?? "—"} · <span className="font-mono">waba_id:</span> {connMeta.waba_id ?? "—"} · <span className="font-mono">token:</span> {connMeta.use_global_token ? "global" : "conexão"}
                {(q.data as any).meta_error.code != null && <> · <span className="font-mono">code:</span> {(q.data as any).meta_error.code}</>}
              </div>
              <div className="pt-2">
                <Button size="sm" variant="outline" onClick={() => diagMut.mutate()} disabled={diagMut.isPending}>
                  <Stethoscope className="mr-2 h-4 w-4" />Executar diagnóstico
                </Button>
              </div>
            </div>
          ) : null}

          {/* Header card */}
          <div className="rounded-xl border bg-card p-5 flex flex-wrap items-center gap-4">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-muted ring-2 ring-border">
              {profile.profile_picture_url ? (
                <img src={profile.profile_picture_url} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="flex-1 min-w-[200px]">
              <div className="text-lg font-semibold">{phone.verified_name ?? "—"}</div>
              <div className="text-sm text-muted-foreground">{phone.display_phone_number ?? "—"}</div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div><div className="text-muted-foreground">Status</div><div className="font-medium">{phone.code_verification_status ?? "—"}</div></div>
              <div><div className="text-muted-foreground">Qualidade</div><div className="font-medium">{phone.quality_rating ?? "—"}</div></div>
              <div><div className="text-muted-foreground">WABA</div><div className="font-medium truncate max-w-[120px]" title={connMeta.waba_id ?? ""}>{connMeta.waba_id ?? "—"}</div></div>
              <div><div className="text-muted-foreground">Token</div><div className="font-medium">{connMeta.use_global_token ? "Global" : "Conexão"}</div></div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* Foto + perfil */}
            <div className="rounded-xl border bg-card p-5 lg:col-span-2 space-y-4">
              <div className="flex items-center gap-4">
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full bg-muted ring-2 ring-border">
                  {profile.profile_picture_url ? (
                    <img src={profile.profile_picture_url} alt="Foto do perfil" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">Sem foto</div>
                  )}
                </div>
                <div className="space-y-2">
                  <input
                    ref={fileRef} type="file" accept="image/jpeg,image/png,image/jpg" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMut.mutate(f); e.target.value = ""; }}
                  />
                  <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploadMut.isPending}>
                    <Upload className="mr-2 h-4 w-4" />{uploadMut.isPending ? "Enviando…" : "Trocar foto"}
                  </Button>
                  <p className="text-xs text-muted-foreground">JPG ou PNG quadrado, até 5 MB. A foto aparece redonda no WhatsApp.</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>Recado / Sobre</Label>
                  <Input value={form.about} onChange={(e) => set("about", e.target.value)} maxLength={139} disabled={saveMut.isPending} />
                  <p className="mt-1 text-xs text-muted-foreground">{form.about.length}/139</p>
                </div>
                <div className="sm:col-span-2">
                  <Label>Descrição da empresa</Label>
                  <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} maxLength={512} rows={3} disabled={saveMut.isPending} />
                </div>
                <div>
                  <Label>Categoria</Label>
                  <Select value={form.vertical} onValueChange={(v) => set("vertical", v)} disabled={saveMut.isPending}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{VERTICALS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>E-mail</Label>
                  <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} disabled={saveMut.isPending} />
                </div>
                <div className="sm:col-span-2">
                  <Label>Endereço</Label>
                  <Input value={form.address} onChange={(e) => set("address", e.target.value)} disabled={saveMut.isPending} />
                </div>
                <div>
                  <Label>Site principal</Label>
                  <Input value={form.website1} onChange={(e) => set("website1", e.target.value)} placeholder="https://…" disabled={saveMut.isPending} />
                </div>
                <div>
                  <Label>Site secundário</Label>
                  <Input value={form.website2} onChange={(e) => set("website2", e.target.value)} placeholder="https://…" disabled={saveMut.isPending} />
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={() => setConfirmSave(true)} disabled={!dirty || saveMut.isPending}>
                  <Save className="mr-2 h-4 w-4" />Revisar e salvar
                </Button>
              </div>
            </div>

            {/* Nome de exibição */}
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <div>
                <h3 className="font-semibold">Nome de exibição</h3>
                <p className="text-xs text-muted-foreground">Requer análise da Meta.</p>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Nome atual</span>
                  <span className="font-medium">{phone.verified_name ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status atual</span>
                  <Badge variant={currentStatus.variant}><span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${currentStatus.dot}`} />{currentStatus.label}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Novo nome</span>
                  <span className="font-medium">{phone.new_display_name ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status do novo</span>
                  <Badge variant={newStatus.variant}><span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${newStatus.dot}`} />{newStatus.label}</Badge>
                </div>
              </div>

              {phone.new_name_status === "DECLINED" && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
                  <div className="font-medium text-destructive">A Meta não aprovou este nome.</div>
                  {connMeta.display_name_rejection_reason && (
                    <div className="mt-1 text-muted-foreground">Motivo: {connMeta.display_name_rejection_reason}</div>
                  )}
                </div>
              )}

              <div className="space-y-2 border-t pt-3">
                <Label>Solicitar novo nome</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome da empresa" disabled={reqNameMut.isPending} />
                <Button
                  size="sm" className="w-full"
                  onClick={() => reqNameMut.mutate()}
                  disabled={reqNameMut.isPending || !newName.trim()}
                >
                  <Send className="mr-2 h-4 w-4" />{reqNameMut.isPending ? "Solicitando…" : "Solicitar alteração"}
                </Button>
              </div>

              {canApply && (
                <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <p className="text-xs">O nome foi aprovado pela Meta, mas ainda não foi aplicado ao número.</p>
                  <Button size="sm" className="w-full" onClick={() => setPinOpen(true)}>
                    <KeyRound className="mr-2 h-4 w-4" />Aplicar nome aprovado
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Auditoria */}
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <History className="h-4 w-4" /><h3 className="font-semibold">Histórico</h3>
            </div>
            {audit.isLoading ? (
              <div className="text-xs text-muted-foreground">Carregando…</div>
            ) : (audit.data?.rows ?? []).length === 0 ? (
              <div className="text-xs text-muted-foreground">Nenhuma alteração registrada.</div>
            ) : (
              <div className="space-y-1 text-xs">
                {audit.data!.rows.map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between border-b py-1.5 last:border-0">
                    <div className="flex items-center gap-2">
                      {r.status === "success" ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <XCircle className="h-3.5 w-3.5 text-red-500" />}
                      <span className="font-medium">{r.action}</span>
                      {r.meta_error_code && <span className="text-muted-foreground">[{r.meta_error_code}]</span>}
                    </div>
                    <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString("pt-BR")}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Diff / confirmação de salvamento */}
      <Dialog open={confirmSave} onOpenChange={setConfirmSave}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirmar alterações</DialogTitle>
            <DialogDescription>Revise as mudanças antes de enviar para a Meta.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            <DiffRow label="Sobre" from={initial.about} to={form.about} />
            <DiffRow label="Descrição" from={initial.description} to={form.description} />
            <DiffRow label="Categoria" from={initial.vertical} to={form.vertical} />
            <DiffRow label="E-mail" from={initial.email} to={form.email} />
            <DiffRow label="Endereço" from={initial.address} to={form.address} />
            <DiffRow label="Site principal" from={initial.website1} to={form.website1} />
            <DiffRow label="Site secundário" from={initial.website2} to={form.website2} />
            {!dirty && <div className="text-xs text-muted-foreground">Nenhuma alteração.</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSave(false)}>Cancelar</Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !dirty}>
              {saveMut.isPending ? "Salvando…" : "Confirmar e salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PIN */}
      <Dialog open={pinOpen} onOpenChange={(o) => { setPinOpen(o); if (!o) setPin(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>PIN de verificação em 2 fatores</DialogTitle>
            <DialogDescription>Digite o PIN de 6 dígitos configurado para este número. Ele será usado apenas nesta chamada e não será armazenado.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>PIN</Label>
            <Input type="password" inputMode="numeric" autoComplete="one-time-code" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} maxLength={6} placeholder="••••••" />
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Shield className="h-3 w-3" /> Máximo 3 tentativas a cada 15 minutos.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPinOpen(false); setPin(""); }}>Cancelar</Button>
            <Button onClick={() => applyMut.mutate()} disabled={applyMut.isPending || !/^\d{6}$/.test(pin)}>
              {applyMut.isPending ? "Aplicando…" : "Aplicar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diagnóstico */}
      <Dialog open={diagOpen} onOpenChange={setDiagOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Diagnóstico da conexão</DialogTitle>
            <DialogDescription>Verificação em tempo real com a Meta.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1 text-sm max-h-[400px] overflow-y-auto">
            {(diagMut.data?.results ?? []).map((r: any, i: number) => (
              <div key={i} className="flex items-start gap-2 border-b py-2 last:border-0">
                {r.ok ? <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" /> : <AlertCircle className="h-4 w-4 text-red-500 mt-0.5" />}
                <div className="flex-1">
                  <div className="font-medium">{r.step}</div>
                  {r.detail && <div className="text-xs text-muted-foreground">{r.detail}</div>}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiagOpen(false)}>Fechar</Button>
            <Button onClick={() => diagMut.mutate()} disabled={diagMut.isPending}>Rodar novamente</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
