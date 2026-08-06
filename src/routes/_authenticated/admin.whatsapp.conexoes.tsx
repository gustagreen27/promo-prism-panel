import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Save, Webhook, ListChecks } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { ErrorCard } from "@/components/admin/query-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmbeddedSignupButton } from "@/components/admin/whatsapp/embedded-signup-button";
import {
  listWorkspaceConnections,
  setWorkspaceBusinessId,
  setWorkspaceDefaultConnection,
  subscribeConnectionToApp,
} from "@/lib/wa-connections.functions";

export const Route = createFileRoute("/_authenticated/admin/whatsapp/conexoes")({
  head: () => ({ meta: [{ title: "Conexões — WhatsApp" }] }),
  component: Page,
});

function Page() {
  const listFn = useServerFn(listWorkspaceConnections);
  const setBiz = useServerFn(setWorkspaceBusinessId);
  const setDefault = useServerFn(setWorkspaceDefaultConnection);
  const subscribeFn = useServerFn(subscribeConnectionToApp);
  const qc = useQueryClient();

  const { data: rows, isLoading, error, refetch } = useQuery({
    queryKey: ["wa-workspace-conns"],
    queryFn: () => listFn(),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["wa-workspace-conns"] });

  const bizMut = useMutation({
    mutationFn: (p: { workspace_id: string; meta_business_id: string | null; meta_business_name: string | null }) =>
      setBiz({ data: p }),
    onSuccess: () => { toast.success("Business ID salvo"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const defMut = useMutation({
    mutationFn: (p: { workspace_id: string; connection_id: string | null }) =>
      setDefault({ data: p }),
    onSuccess: () => { toast.success("Número padrão atualizado"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const subMut = useMutation({
    mutationFn: (connection_id: string) => subscribeFn({ data: { connection_id } }),
    onSuccess: (r: any) => {
      const app = r?.apps?.[0]?.whatsapp_business_api_data?.name;
      toast.success(app ? `App assinado: ${app}` : "App assinado com sucesso");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao assinar app"),
  });

  return (
    <>
      <PageHeader
        title="Conexões"
        description="Vincule cada workspace ao seu Business Manager (BM) e ao número padrão de envio."
      />
      <div className="mb-4 flex flex-wrap gap-2 rounded-xl border bg-card p-4">
        <div className="flex-1 min-w-[220px]">
          <div className="font-semibold text-sm">Conectar novo WhatsApp Business</div>
          <div className="text-xs text-muted-foreground">Abre o Cadastro incorporado da Meta em um popup.</div>
        </div>
        <EmbeddedSignupButton mode="coexistence" label="Conectar WhatsApp" />
      </div>
      {isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
      ) : error ? (
        <ErrorCard error={error} onRetry={() => refetch()} />
      ) : !rows || rows.length === 0 ? (
        <EmptyState title="Nenhum workspace" />
      ) : (
        <div className="space-y-4">
          {rows.map((w: any) => (
            <WorkspaceCard
              key={w.id}
              w={w}
              onSaveBiz={(p: { meta_business_id: string | null; meta_business_name: string | null }) => bizMut.mutate({ workspace_id: w.id, ...p })}
              onSaveDefault={(cid: string | null) => defMut.mutate({ workspace_id: w.id, connection_id: cid })}
              onSubscribe={(cid: string) => subMut.mutate(cid)}
              subscribingId={subMut.isPending ? (subMut.variables as string | undefined) : undefined}
              saving={bizMut.isPending || defMut.isPending}
            />
          ))}
        </div>
      )}
    </>
  );
}

function WorkspaceCard({ w, onSaveBiz, onSaveDefault, onSubscribe, subscribingId, saving }: any) {
  const [bizId, setBizId] = useState<string>(w.meta_business_id ?? "");
  const [bizName, setBizName] = useState<string>(w.meta_business_name ?? "");
  const [defConn, setDefConn] = useState<string>(w.default_connection_id ?? "");
  const [finishId, setFinishId] = useState<string | null>(null);


  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold">{w.name}</h3>
          <div className="text-xs text-muted-foreground flex items-center gap-1">/{w.slug} · {w.plan} · <Badge variant="outline">{w.status}</Badge></div>
        </div>
        <div className="text-xs text-muted-foreground">
          {w.wabas.length} WABA · {w.connections.length} números
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Business Manager ID</Label>
          <Input value={bizId} onChange={(e) => setBizId(e.target.value)} placeholder="1234567890" />
        </div>
        <div>
          <Label className="text-xs">Nome do BM (opcional)</Label>
          <Input value={bizName} onChange={(e) => setBizName(e.target.value)} placeholder="Minha Empresa" />
        </div>
        <div className="flex items-end">
          <Button
            variant="outline"
            disabled={saving}
            onClick={() =>
              onSaveBiz({ meta_business_id: bizId.trim() || null, meta_business_name: bizName.trim() || null })
            }
          >
            <Save className="mr-2 h-4 w-4" />Salvar BM
          </Button>
        </div>

        <div className="md:col-span-2">
          <Label className="text-xs">Número padrão de envio</Label>
          <Select value={defConn} onValueChange={setDefConn}>
            <SelectTrigger><SelectValue placeholder="— nenhum —" /></SelectTrigger>
            <SelectContent>
              {w.connections.length === 0 ? (
                <SelectItem value="__none" disabled>Sem números vinculados</SelectItem>
              ) : w.connections.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} · {c.display_phone ?? "—"} · {c.status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button
            disabled={saving}
            onClick={() => onSaveDefault(defConn || null)}
          >
            <Save className="mr-2 h-4 w-4" />Salvar padrão
          </Button>
        </div>
      </div>

      {w.connections.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <div className="text-xs font-medium text-muted-foreground mb-2">Webhooks (assinar app na WABA)</div>
          <div className="space-y-1.5">
            {w.connections.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground"> · {c.display_phone ?? "—"}</span>
                  {c.waba_id ? (
                    <span className="text-xs text-muted-foreground"> · WABA {c.waba_id}</span>
                  ) : (
                    <span className="text-xs text-destructive"> · sem waba_id</span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!c.waba_id || subscribingId === c.id}
                    onClick={() => onSubscribe(c.id)}
                  >
                    <Webhook className="mr-2 h-3.5 w-3.5" />
                    {subscribingId === c.id ? "Assinando…" : "Assinar app"}
                  </Button>
                  <Button size="sm" onClick={() => setFinishId(c.id)}>
                    <ListChecks className="mr-2 h-3.5 w-3.5" />
                    Finalizar integração
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
