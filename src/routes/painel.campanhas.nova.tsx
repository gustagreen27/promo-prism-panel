import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useServerFn } from "@tanstack/react-start";
import {
  listMyNumbers,
  listMyTemplates,
  getMyBalance,
  createClientCampaign,
  startClientCampaign,
} from "@/lib/client-panel.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/painel/campanhas/nova")({
  head: () => ({ meta: [{ title: "Nova campanha — Disparos FR" }] }),
  component: Page,
});

type NumberRow = { id: string; display_name: string; phone_masked: string; status: string; daily_cap: number | null };
type TemplateRow = { id: string; name: string; language: string; category: string; body: string };
type ListRow = { id: string; name: string };

function Page() {
  const { workspaceId } = Route.useRouteContext() as { workspaceId: string };
  const navigate = useNavigate();
  const fnListNumbers = useServerFn(listMyNumbers);
  const fnListTemplates = useServerFn(listMyTemplates);
  const fnBalance = useServerFn(getMyBalance);
  const fnCreate = useServerFn(createClientCampaign);
  const fnStart = useServerFn(startClientCampaign);

  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [numbers, setNumbers] = useState<NumberRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [lists, setLists] = useState<ListRow[]>([]);
  const [connectionId, setConnectionId] = useState<string>("");
  const [templateId, setTemplateId] = useState<string>("");
  const [listId, setListId] = useState<string>("");
  const [balance, setBalance] = useState<{ available: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const [n, b, l] = await Promise.all([
        fnListNumbers({ data: { workspace_id: workspaceId } }),
        fnBalance({ data: { workspace_id: workspaceId } }),
        supabase.from("contact_lists").select("id,name").eq("workspace_id", workspaceId).limit(50),
      ]);
      setNumbers(n.numbers);
      setBalance(b);
      setLists(((l.data as ListRow[]) || []));
      if (n.numbers.length === 1) setConnectionId(n.numbers[0].id);
    })();
  }, [workspaceId, fnListNumbers, fnBalance]);

  useEffect(() => {
    if (!connectionId) return;
    fnListTemplates({ data: { workspace_id: workspaceId, connection_id: connectionId } }).then((r) =>
      setTemplates(r.templates)
    );
  }, [connectionId, workspaceId, fnListTemplates]);

  const selectedTemplate = useMemo(() => templates.find((t) => t.id === templateId), [templates, templateId]);
  const selectedList = useMemo(() => lists.find((l) => l.id === listId), [lists, listId]);

  async function handleSubmit(startNow: boolean) {
    if (!name || !connectionId || !templateId) {
      toast.error("Preencha nome, número e template");
      return;
    }
    setSubmitting(true);
    try {
      const { campaign } = await fnCreate({
        data: {
          workspace_id: workspaceId,
          name,
          connection_id: connectionId,
          template_id: templateId,
          list_id: listId || null,
        },
      });
      if (startNow) {
        const r = await fnStart({ data: { campaign_id: campaign.id } });
        toast.success(r.status === "queued" ? "Campanha na fila!" : "Aguardando aprovação interna.");
      } else {
        toast.success("Campanha salva como rascunho.");
      }
      navigate({ to: "/painel/campanhas" });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar campanha");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nova campanha — passo {step} de 4</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === 1 && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nome da campanha</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Boas-vindas outubro" />
            </div>
            <div className="space-y-1">
              <Label>Lista de contatos (opcional)</Label>
              <select
                className="w-full rounded border px-3 py-2 text-sm"
                value={listId}
                onChange={(e) => setListId(e.target.value)}
              >
                <option value="">— Sem lista específica —</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <Button onClick={() => setStep(2)} disabled={!name}>Continuar</Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <Label>Número remetente</Label>
            {numbers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum número liberado para você ainda. Entre em contato com o suporte.
              </p>
            ) : (
              <div className="space-y-2">
                {numbers.map((n) => (
                  <label
                    key={n.id}
                    className={`flex cursor-pointer items-center gap-3 rounded border p-3 text-sm ${connectionId === n.id ? "border-primary bg-primary/5" : ""}`}
                  >
                    <input
                      type="radio"
                      name="conn"
                      checked={connectionId === n.id}
                      onChange={() => setConnectionId(n.id)}
                    />
                    <div className="flex-1">
                      <div className="font-medium">{n.display_name}</div>
                      <div className="text-xs text-muted-foreground">{n.phone_masked} · {n.status}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>Voltar</Button>
              <Button onClick={() => setStep(3)} disabled={!connectionId}>Continuar</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <Label>Template</Label>
            {templates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum template liberado para este número. Solicite um novo em Templates.
              </p>
            ) : (
              <div className="space-y-2">
                {templates.map((t) => (
                  <label
                    key={t.id}
                    className={`block cursor-pointer rounded border p-3 text-sm ${templateId === t.id ? "border-primary bg-primary/5" : ""}`}
                  >
                    <input
                      type="radio"
                      name="tpl"
                      className="mr-2"
                      checked={templateId === t.id}
                      onChange={() => setTemplateId(t.id)}
                    />
                    <span className="font-medium">{t.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{t.language} · {t.category}</span>
                    <div className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{t.body}</div>
                  </label>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>Voltar</Button>
              <Button onClick={() => setStep(4)} disabled={!templateId}>Continuar</Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3 text-sm">
            <div className="rounded border p-3 space-y-1">
              <div><span className="text-muted-foreground">Campanha:</span> <b>{name}</b></div>
              <div><span className="text-muted-foreground">Lista:</span> {selectedList?.name || "—"}</div>
              <div><span className="text-muted-foreground">Número:</span> {numbers.find((n) => n.id === connectionId)?.display_name}</div>
              <div><span className="text-muted-foreground">Template:</span> {selectedTemplate?.name}</div>
              <div><span className="text-muted-foreground">Saldo disponível:</span> {balance?.available ?? "—"} mensagens</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setStep(3)}>Voltar</Button>
              <Button variant="secondary" onClick={() => handleSubmit(false)} disabled={submitting}>
                Salvar rascunho
              </Button>
              <Button onClick={() => handleSubmit(true)} disabled={submitting}>
                Salvar e iniciar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
