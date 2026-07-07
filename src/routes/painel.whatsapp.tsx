import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmbeddedSignupButton } from "@/components/admin/whatsapp/embedded-signup-button";
import { listMyWorkspaceNumbers } from "@/lib/wa-embedded-signup.functions";
import { MessageCircle, ShieldCheck, Phone } from "lucide-react";

export const Route = createFileRoute("/painel/whatsapp")({
  head: () => ({ meta: [{ title: "WhatsApp — Disparos FR" }] }),
  component: Page,
});

function statusVariant(s: string | null): "default" | "secondary" | "destructive" | "outline" {
  if (s === "ativo") return "default";
  if (s === "aguardando_verificacao") return "secondary";
  if (s === "bloqueado" || s === "erro") return "destructive";
  return "outline";
}

function Page() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMyWorkspaceNumbers);
  const { data: numbers = [], isLoading } = useQuery({
    queryKey: ["panel-wa-numbers"],
    queryFn: () => listFn(),
    staleTime: 15_000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Conecte um número do WhatsApp Business para começar a disparar. Usamos o Embedded Signup
          oficial da Meta — o token de acesso é gerado automaticamente e vinculado ao seu workspace.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" /> Conectar novo número
          </CardTitle>
          <CardDescription>
            Você será redirecionado ao Facebook para autorizar sua Business Manager e escolher
            (ou criar) o número. Ao concluir, o número aparece na lista abaixo.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <EmbeddedSignupButton
            onCompleted={() => qc.invalidateQueries({ queryKey: ["panel-wa-numbers"] })}
          />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Fluxo oficial Meta • token seguro no servidor • webhooks configurados automaticamente
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Meus números</CardTitle>
          <CardDescription>Números vinculados ao seu workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : numbers.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhum número conectado ainda. Clique em <b>Conectar WhatsApp</b> acima para começar.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {numbers.map((n: any) => (
                <li key={n.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Phone className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-medium">
                        {n.display_name || n.name || n.display_phone || "Sem nome"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {n.display_phone ?? "—"} • ID {n.phone_number_id?.slice(-6)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {n.quality_rating && (
                      <Badge variant="outline">Qualidade: {n.quality_rating}</Badge>
                    )}
                    {n.messaging_limit && (
                      <Badge variant="outline">Tier: {n.messaging_limit}</Badge>
                    )}
                    <Badge variant={statusVariant(n.status)}>{n.status ?? "—"}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
