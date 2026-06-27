import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/admin/page-header";
import { listNumbers } from "@/lib/whatsapp-numbers.functions";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { project_urls } from "@/integrations/supabase/types"; // not used, fallback below

export const Route = createFileRoute("/_authenticated/admin/whatsapp/webhooks")({
  head: () => ({ meta: [{ title: "Webhooks WhatsApp" }] }),
  component: Page,
});

function Page() {
  const fn = useServerFn(listNumbers);
  const { data: rows = [] } = useQuery({ queryKey: ["wa-numbers"], queryFn: () => fn() });
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const webhookUrl = `${origin}/api/public/whatsapp/webhook`;

  const copy = (txt: string) => { navigator.clipboard.writeText(txt); toast.success("Copiado"); };

  return (
    <>
      <PageHeader title="Webhooks" description="URL pública usada pela Meta para entregar eventos." />
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div>
          <div className="text-xs uppercase text-muted-foreground">Callback URL</div>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 rounded bg-muted px-3 py-2 text-sm">{webhookUrl}</code>
            <Button size="sm" variant="outline" onClick={() => copy(webhookUrl)}><Copy className="mr-2 h-4 w-4" />Copiar</Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Configure no Meta App → WhatsApp → Configuration → Webhook. Inscreva-se nos campos <strong>messages</strong> e <strong>message_template_status_update</strong>.</p>
        </div>
        <div className="border-t pt-3">
          <div className="text-xs uppercase text-muted-foreground">Verify Tokens por número</div>
          <div className="mt-2 grid gap-2">
            {rows.length === 0 && <div className="text-sm text-muted-foreground">Cadastre um número para configurar o verify token.</div>}
            {rows.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between rounded border p-2 text-sm">
                <div>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground">{r.display_phone ?? r.phone ?? "—"}</div>
                </div>
                <code className="font-mono text-xs">{r.verify_token ? "•••••• (configurado)" : "não definido"}</code>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
