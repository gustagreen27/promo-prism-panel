import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw, Save, Upload, Send, KeyRound } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  getPhoneProfile, updatePhoneProfile, uploadPhoneProfilePicture,
  requestDisplayNameChange, applyDisplayName,
} from "@/lib/wa-profile.functions";

export const Route = createFileRoute("/_authenticated/admin/whatsapp/numeros/$id/perfil")({
  head: () => ({ meta: [{ title: "Perfil do número WhatsApp" }] }),
  component: Page,
});

const VERTICALS = [
  "UNDEFINED", "OTHER", "AUTO", "BEAUTY", "APPAREL", "EDU", "ENTERTAIN",
  "EVENT_PLAN", "FINANCE", "GROCERY", "GOVT", "HEALTH", "HOTEL",
  "NONPROFIT", "PROF_SERVICES", "RESTAURANT", "RETAIL", "TRAVEL",
];

const NAME_STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  APPROVED: { label: "Aprovado", variant: "default" },
  PENDING_REVIEW: { label: "Em análise", variant: "secondary" },
  DECLINED: { label: "Rejeitado", variant: "destructive" },
  EXPIRED: { label: "Expirado", variant: "outline" },
  AVAILABLE_WITHOUT_REVIEW: { label: "Disponível sem análise", variant: "outline" },
  NONE: { label: "—", variant: "outline" },
};

function Page() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const getFn = useServerFn(getPhoneProfile);
  const updateFn = useServerFn(updatePhoneProfile);
  const uploadFn = useServerFn(uploadPhoneProfilePicture);
  const reqNameFn = useServerFn(requestDisplayNameChange);
  const applyNameFn = useServerFn(applyDisplayName);

  const q = useQuery({
    queryKey: ["wa-phone-profile", id],
    queryFn: () => getFn({ data: { connection_id: id } }),
  });

  const [form, setForm] = useState({
    about: "", description: "", address: "", email: "",
    website1: "", website2: "", vertical: "UNDEFINED",
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    const p: any = (q.data as any)?.profile ?? {};
    setForm({
      about: p.about ?? "",
      description: p.description ?? "",
      address: p.address ?? "",
      email: p.email ?? "",
      website1: p.websites?.[0] ?? "",
      website2: p.websites?.[1] ?? "",
      vertical: p.vertical ?? "UNDEFINED",
    });
  }, [q.data]);

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
    onSuccess: () => { toast.success("Perfil atualizado"); qc.invalidateQueries({ queryKey: ["wa-phone-profile", id] }); },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar"),
  });

  const fileRef = useRef<HTMLInputElement>(null);
  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const b64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      return uploadFn({ data: { connection_id: id, file_base64: b64, file_name: file.name, mime_type: file.type || "image/jpeg" } });
    },
    onSuccess: () => { toast.success("Foto atualizada"); qc.invalidateQueries({ queryKey: ["wa-phone-profile", id] }); },
    onError: (e: any) => toast.error(e?.message ?? "Erro no upload"),
  });

  const [newName, setNewName] = useState("");
  const reqNameMut = useMutation({
    mutationFn: () => reqNameFn({ data: { connection_id: id, new_display_name: newName.trim() } }),
    onSuccess: () => { toast.success("Solicitação enviada à Meta"); setNewName(""); qc.invalidateQueries({ queryKey: ["wa-phone-profile", id] }); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const applyMut = useMutation({
    mutationFn: () => applyNameFn({ data: { connection_id: id, pin } }),
    onSuccess: () => { toast.success("Nome aplicado ao número"); setPinOpen(false); setPin(""); qc.invalidateQueries({ queryKey: ["wa-phone-profile", id] }); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const phone: any = (q.data as any)?.phone ?? {};
  const profile: any = (q.data as any)?.profile ?? {};
  const newStatusInfo = NAME_STATUS_LABEL[phone.new_name_status ?? "NONE"] ?? NAME_STATUS_LABEL.NONE;
  const currentStatusInfo = NAME_STATUS_LABEL[phone.name_status ?? "NONE"] ?? NAME_STATUS_LABEL.NONE;

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
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Foto e perfil comercial */}
          <div className="rounded-xl border bg-card p-5 lg:col-span-2 space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-muted">
                {profile.profile_picture_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
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
                <p className="text-xs text-muted-foreground">JPG ou PNG quadrado, até 5 MB.</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Recado / Sobre</Label>
                <Input value={form.about} onChange={(e) => set("about", e.target.value)} maxLength={139} placeholder="Ex.: Atendimento de segunda a sexta" />
                <p className="mt-1 text-xs text-muted-foreground">{form.about.length}/139</p>
              </div>
              <div className="sm:col-span-2">
                <Label>Descrição da empresa</Label>
                <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} maxLength={512} rows={3} />
              </div>
              <div>
                <Label>Categoria</Label>
                <Select value={form.vertical} onValueChange={(v) => set("vertical", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{VERTICALS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>E-mail</Label>
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label>Endereço</Label>
                <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
              </div>
              <div>
                <Label>Site principal</Label>
                <Input value={form.website1} onChange={(e) => set("website1", e.target.value)} placeholder="https://…" />
              </div>
              <div>
                <Label>Site secundário</Label>
                <Input value={form.website2} onChange={(e) => set("website2", e.target.value)} placeholder="https://…" />
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                <Save className="mr-2 h-4 w-4" />{saveMut.isPending ? "Salvando…" : "Salvar perfil"}
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
                <Badge variant={currentStatusInfo.variant}>{currentStatusInfo.label}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Novo nome</span>
                <span className="font-medium">{phone.new_display_name ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status do novo</span>
                <Badge variant={newStatusInfo.variant}>{newStatusInfo.label}</Badge>
              </div>
            </div>

            <div className="space-y-2 border-t pt-3">
              <Label>Solicitar novo nome</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome da empresa" />
              <Button
                size="sm" className="w-full"
                onClick={() => reqNameMut.mutate()}
                disabled={reqNameMut.isPending || !newName.trim()}
              >
                <Send className="mr-2 h-4 w-4" />Solicitar alteração
              </Button>
            </div>

            {phone.new_name_status === "APPROVED" && (
              <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <p className="text-xs">
                  Novo nome aprovado pela Meta. Aplique ao número para concluir.
                </p>
                <Button size="sm" className="w-full" onClick={() => setPinOpen(true)}>
                  <KeyRound className="mr-2 h-4 w-4" />Aplicar nome aprovado
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <Dialog open={pinOpen} onOpenChange={setPinOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>PIN de verificação em 2 fatores</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>PIN (6 dígitos)</Label>
            <Input value={pin} onChange={(e) => setPin(e.target.value)} maxLength={6} placeholder="000000" />
            <p className="text-xs text-muted-foreground">
              O número será registrado novamente na Cloud API com o novo nome.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => applyMut.mutate()} disabled={applyMut.isPending || !/^\d{6}$/.test(pin)}>
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
