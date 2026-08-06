import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, RefreshCw, PartyPopper } from "lucide-react";
import {
  getPostSignupStatus,
  finishSubscribeWebhooks,
  finishRegisterNumber,
  finishSaveBusinessProfile,
  finishSendTestMessage,
} from "@/lib/wa-post-signup.functions";

type Props = {
  connectionId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone?: () => void;
};

function StateIcon({ state }: { state: string }) {
  if (state === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (state === "pending") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  return <XCircle className="h-4 w-4 text-destructive" />;
}

export function PostSignupDialog({ connectionId, open, onOpenChange, onDone }: Props) {
  const qc = useQueryClient();
  const statusFn = useServerFn(getPostSignupStatus);
  const subscribeFn = useServerFn(finishSubscribeWebhooks);
  const registerFn = useServerFn(finishRegisterNumber);
  const profileFn = useServerFn(finishSaveBusinessProfile);
  const testFn = useServerFn(finishSendTestMessage);

  const [pin, setPin] = useState("");
  const [to, setTo] = useState("");
  const [about, setAbout] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [website, setWebsite] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["wa-post-signup", connectionId],
    queryFn: () => statusFn({ data: { connection_id: connectionId! } }),
    enabled: open && !!connectionId,
    refetchOnWindowFocus: false,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["wa-post-signup", connectionId] });

  const subscribe = useMutation({
    mutationFn: () => subscribeFn({ data: { connection_id: connectionId! } }),
    onSuccess: () => { toast.success("Webhooks assinados."); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao assinar webhooks."),
  });

  const register = useMutation({
    mutationFn: () => registerFn({ data: { connection_id: connectionId!, pin } }),
    onSuccess: (r: any) => { toast.success(r?.idempotent ? "Número já estava registrado." : "Número registrado na Cloud API."); setPin(""); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao registrar o número."),
  });

  const saveProfile = useMutation({
    mutationFn: () =>
      profileFn({
        data: {
          connection_id: connectionId!,
          about: about ?? q.data?.profile.about ?? "",
          description: description ?? q.data?.profile.description ?? "",
          email: email ?? q.data?.profile.email ?? "",
          website: website ?? q.data?.profile.website ?? "",
        },
      }),
    onSuccess: () => { toast.success("Perfil comercial atualizado."); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar o perfil."),
  });

  const sendTest = useMutation({
    mutationFn: () => testFn({ data: { connection_id: connectionId!, to } }),
    onSuccess: () => toast.success("Mensagem de teste enviada (hello_world)."),
    onError: (e: any) => toast.error(e?.message ?? "Falha ao enviar teste."),
  });

  const d = q.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PartyPopper className="h-5 w-5 text-primary" /> Cadastro concluído — finalize a integração
          </DialogTitle>
          <DialogDescription>
            A Meta devolveu a conta com sucesso. Complete os passos abaixo para deixar o número pronto para disparo.
          </DialogDescription>
        </DialogHeader>

        {q.isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Verificando a integração na Meta…
          </div>
        ) : q.error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            {(q.error as any)?.message ?? "Não foi possível carregar o status."}
          </div>
        ) : d ? (
          <div className="space-y-5">
            <div className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{d.connection.verified_name ?? "Número conectado"}</div>
                  <div className="text-xs text-muted-foreground">
                    {d.connection.display_phone ?? "—"} • WABA {d.connection.waba_id ?? "—"}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {d.connection.quality_rating && <Badge variant="outline">Qualidade: {d.connection.quality_rating}</Badge>}
                  {d.connection.messaging_limit_tier && <Badge variant="outline">{d.connection.messaging_limit_tier}</Badge>}
                  {d.connection.platform_type && <Badge variant="secondary">{d.connection.platform_type}</Badge>}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Checklist</h4>
                <Button variant="ghost" size="sm" onClick={() => refresh()} disabled={q.isFetching}>
                  <RefreshCw className={`mr-2 h-3.5 w-3.5 ${q.isFetching ? "animate-spin" : ""}`} /> Reverificar
                </Button>
              </div>
              <ul className="space-y-2">
                {d.checklist.map((c) => (
                  <li key={c.key} className="flex items-start gap-2 rounded-md border p-2.5 text-sm">
                    <StateIcon state={c.state} />
                    <div className="min-w-0">
                      <div className="font-medium">{c.label}</div>
                      <div className="text-xs text-muted-foreground break-words">{c.detail ?? "—"}</div>
                    </div>
                    {c.key === "webhook" && c.state !== "ok" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-auto shrink-0"
                        onClick={() => subscribe.mutate()}
                        disabled={subscribe.isPending}
                      >
                        {subscribe.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Assinar
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {d.needs_register && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Registrar o número (PIN de 6 dígitos)</h4>
                  <p className="text-xs text-muted-foreground">
                    Defina um PIN de verificação em duas etapas para ativar o número na Cloud API. Guarde-o: será exigido em migrações futuras.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="000000"
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="max-w-[140px]"
                    />
                    <Button onClick={() => register.mutate()} disabled={pin.length !== 6 || register.isPending}>
                      {register.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Registrar
                    </Button>
                  </div>
                </div>
              </>
            )}

            <Separator />
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Perfil comercial</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>Recado (about)</Label>
                  <Input
                    value={about ?? d.profile.about}
                    maxLength={139}
                    onChange={(e) => setAbout(e.target.value)}
                    placeholder="Ex.: Atendimento oficial da sua empresa"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Descrição</Label>
                  <Textarea
                    value={description ?? d.profile.description}
                    maxLength={512}
                    rows={2}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <div>
                  <Label>E-mail</Label>
                  <Input value={email ?? d.profile.email} onChange={(e) => setEmail(e.target.value)} placeholder="contato@empresa.com" />
                </div>
                <div>
                  <Label>Site</Label>
                  <Input value={website ?? d.profile.website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://empresa.com" />
                </div>
              </div>
              <Button variant="outline" onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending}>
                {saveProfile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar perfil
              </Button>
            </div>

            <Separator />
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Teste de envio</h4>
              <p className="text-xs text-muted-foreground">
                Envia o template <code>hello_world</code> para validar token, número e webhooks.
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="5511999999999"
                  value={to}
                  onChange={(e) => setTo(e.target.value.replace(/[^\d+]/g, ""))}
                  className="max-w-[220px]"
                />
                <Button variant="outline" onClick={() => sendTest.mutate()} disabled={to.length < 10 || sendTest.isPending}>
                  {sendTest.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enviar teste
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            onClick={() => {
              onOpenChange(false);
              onDone?.();
            }}
          >
            Concluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
