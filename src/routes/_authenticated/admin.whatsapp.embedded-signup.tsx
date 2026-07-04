import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Info } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/whatsapp/embedded-signup")({
  head: () => ({ meta: [{ title: "Embedded Signup — WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <>
      <PageHeader
        title="Embedded Signup"
        description="Permitir que clientes conectem a própria BM/WABA usando o fluxo oficial da Meta."
      />
      <div className="rounded-xl border bg-card p-6 space-y-4 max-w-2xl">
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm flex gap-2">
          <Info className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
          <div>
            <div className="font-medium">Estrutura preparada — integração pendente</div>
            <p className="text-muted-foreground mt-1">
              A integração completa do Embedded Signup (Facebook Login for Business + captura de business_id/waba_id/phone_number_id) exige criar App Meta com produto "WhatsApp Business Platform" e configurar OAuth. Deixe as configurações do App aqui:
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="font-medium">Fluxo esperado</h3>
          <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
            <li>Cliente clica em "Conectar WhatsApp"</li>
            <li>Abre popup oficial da Meta (Facebook Login for Business)</li>
            <li>Cliente seleciona ou cria uma WABA</li>
            <li>Cliente adiciona/verifica um número</li>
            <li>Sistema captura business_id, waba_id, phone_number_id e access_token do System User</li>
            <li>Sistema cria automaticamente a WABA + Número + libera templates/campanhas</li>
          </ol>
        </div>

        <div className="pt-2">
          <Button disabled title="Requer configuração do App Meta">Conectar WhatsApp (em breve)</Button>
        </div>
      </div>
    </>
  );
}
