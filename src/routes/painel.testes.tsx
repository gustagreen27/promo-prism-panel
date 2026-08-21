import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listTestOptions, listTestSends, sendCampaignTest } from "@/lib/wa-tests.functions";
import { getMyContext } from "@/lib/client-panel.functions";
import { FlaskConical, Loader2, Send } from "lucide-react";

export const Route = createFileRoute("/painel/testes")({
  head: () => ({
    meta: [
      { title: "Testes de disparo — Painel" },
      { name: "description", content: "Envie mensagens de teste para seus próprios números antes de solicitar o disparo completo." },
      { property: "og:title", content: "Testes de disparo — Painel" },
      { property: "og:description", content: "Teste sua campanha em números próprios antes da aprovação." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const STATUS: Record<string, { label: string; className: string }> = {
  sending: { label: "Enviando", className: "bg-muted text-muted-foreground" },
  sent: { label: "Enviado", className: "bg-sky-500/15 text-sky-600" },
  delivered: { label: "Entregue", className: "bg-emerald-500/15 text-emerald-600" },
  read: { label: "Lida", className: "bg-emerald-500/20 text-emerald-700" },
  failed: { label: "Falhou", className: "bg-destructive/15 text-destructive" },
};

function Page() {
  const qc = useQueryClient();
  const ctxFn = useServerFn(getMyContext);
  const { data: ctx } = useQuery({ queryKey: ["my-context"], queryFn: () => ctxFn(), staleTime: 30_000 });
  const workspaceId = ((ctx as any)?.primary_workspace?.id ?? undefined) as string | undefined;

  const optionsFn = useServerFn(listTestOptions);
  const historyFn = useServerFn(listTestSends);
  const sendFn = useServerFn(sendCampaignTest);

  const [campaignId, setCampaignId] = useState<string>("");
  const [templateId, setTemplateId] = useState<string>("");
  const [phones, setPhones] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: options } = useQuery({
    queryKey: ["test-options", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => optionsFn({ data: { workspace_id: workspaceId as string } }),
  });
  const { data: history } = useQuery({
    queryKey: ["test-sends", workspaceId],
    enabled: !!workspaceId,
    refetchInterval: 15_000,
    queryFn: () => historyFn({ data: { workspace_id: workspaceId as string, campaign_id: null } }),
  });

  const campaigns = ((options as any)?.campaigns ?? []) as Array<any>;
  const templates = ((options as any)?.templates ?? []) as Array<any>;
  const items = ((history as any)?.items ?? []) as Array<any>;

  async function send() {
    if (!workspaceId) return;
    const list = phones.split(/[\n,;]+/).map((p) => p.trim()).filter(Boolean);
    if (!list.length) {
      toast.error("Informe pelo menos um número de teste");
      return;
    }
    if (list.length > 5) {
      toast.error("Máximo de 5 números por teste");
      return;
    }
    setBusy(true);
    try {
      const res: any = await sendFn({
        data: {
          workspace_id: workspaceId,
          campaign_id: campaignId || null,
          template_id: templateId || null,
          phones: list,
        },
      });
      const ok = (res.results ?? []).filter((r: any) => r.status === "sent").length;
      const fail = (res.results ?? []).length - ok;
      if (ok) toast.success(`${ok} teste(s) enviado(s)`);
      if (fail) toast.error(`${fail} teste(s) falharam`);
      if (res.invalid?.length) toast.warning(`${res.invalid.length} número(s) inválido(s) ignorado(s)`);
      qc.invalidateQueries({ queryKey: ["test-sends"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar teste");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Testes de disparo</h1>
        <p className="text-sm text-muted-foreground">
          Envie a mensagem para os seus próprios números antes de solicitar o disparo completo. O teste é imediato e não
          precisa de aprovação.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FlaskConical className="h-4 w-4" /> Novo teste
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Campanha (opcional)</Label>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger><SelectValue placeholder="Testar uma campanha existente" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Template</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger><SelectValue placeholder="Usar o template da campanha" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name} · {t.language}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Números de teste (até 5)</Label>
              <Textarea
                value={phones}
                onChange={(e) => setPhones(e.target.value)}
                rows={4}
                placeholder={"62991301856\n11955028300"}
              />
              <p className="text-xs text-muted-foreground">
                Um por linha. Os números são padronizados automaticamente (ex.: 62991301856 → 5562991301856).
              </p>
            </div>

            <Button onClick={() => void send()} disabled={busy} className="w-full">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              {busy ? "Enviando…" : "Enviar teste agora"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Testes enviados</CardTitle></CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum teste enviado ainda.</p>
            ) : (
              <div className="divide-y">
                {items.map((t) => {
                  const st = STATUS[t.status] ?? { label: t.status, className: "bg-muted" };
                  return (
                    <div key={t.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium">{t.phone}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(t.created_at).toLocaleString("pt-BR")}
                        </div>
                        {t.error_message && (
                          <div className="mt-1 text-xs text-destructive">{t.error_message}</div>
                        )}
                      </div>
                      <Badge variant="outline" className={st.className}>{st.label}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
