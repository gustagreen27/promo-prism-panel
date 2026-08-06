import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Save, Webhook, ListChecks, Building2, Users, Gauge, Info } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { ErrorCard } from "@/components/admin/query-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmbeddedSignupButton } from "@/components/admin/whatsapp/embedded-signup-button";
import { PostSignupDialog } from "@/components/admin/whatsapp/post-signup-dialog";
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


  const cap = workspaceCapacity(w);
  const used = Number(w.messages_last_24h ?? 0);
  const pct = cap && Number.isFinite(cap) ? Math.min(100, (used / cap) * 100) : null;

  return (
    <div className="rounded-2xl border bg-card p-5 md:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Building2 className="h-7 w-7" />
          </div>
          <div>
            <h3 className="text-2xl font-bold tracking-tight">{w.name}</h3>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{w.slug} · {w.plan}</span>
              <Badge variant="outline" className="gap-1.5 rounded-full border-emerald-500/30 bg-emerald-500/10 text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {w.status}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          {w.wabas.length} WABA · {w.connections.length} números
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-xl border bg-background p-4 md:p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_auto]">
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
          </div>

          <div className="mt-4">
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

          <div className="mt-4 flex justify-end">
            <Button disabled={saving} onClick={() => onSaveDefault(defConn || null)}>
              <Save className="mr-2 h-4 w-4" />Salvar padrão
            </Button>
          </div>
        </div>

        <div className="rounded-xl border bg-background p-4 md:p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Gauge className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold leading-tight">Limite de disparos</div>
                <div className="text-xs text-muted-foreground">Portfólio empresarial</div>
              </div>
            </div>
            <Info className="h-4 w-4 text-muted-foreground" />
          </div>

          <div className="mt-5 text-sm text-muted-foreground">Capacidade atual</div>
          <div className="mt-1 flex items-end justify-between gap-2">
            <div className="text-3xl font-bold text-primary">
              {cap === null ? "sem dados" : cap === Infinity ? "ilimitado" : cap.toLocaleString("pt-BR")}
              {cap !== null && cap !== Infinity && <span className="ml-1 text-xl font-semibold text-foreground">/ dia</span>}
            </div>
            {pct !== null && <div className="text-sm font-medium text-primary">{pct.toFixed(1).replace(".", ",")}%</div>}
          </div>

          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct ?? 0}%` }} />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary" />
              <span className="font-semibold">{used.toLocaleString("pt-BR")}</span>
              <span className="text-muted-foreground">usados</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
              <span className="font-semibold">
                {cap === null || cap === Infinity ? "—" : Math.max(0, cap - used).toLocaleString("pt-BR")}
              </span>
              <span className="text-muted-foreground">disponíveis</span>
            </span>
          </div>

          <div className="mt-4 flex items-center justify-between border-t pt-4 text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4" /> WABAs vinculados
            </span>
            <span className="font-semibold">{w.wabas.length}</span>
          </div>
        </div>
      </div>


      {w.connections.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <div className="text-xs font-medium text-muted-foreground mb-2">Números por WABA (assinar app / finalizar integração)</div>
          <div className="space-y-3">
            {groupByWaba(w).map((g: any) => (
              <div key={g.key} className="rounded-lg border bg-muted/30 p-2.5">
                <div className="mb-1.5 flex items-center gap-2 text-xs">
                  <span className="font-semibold">{g.label}</span>
                  {g.waba_id && <Badge variant="outline" className="font-mono text-[10px]">WABA {g.waba_id}</Badge>}
                  <span className="text-muted-foreground">{g.items.length} número(s)</span>
                </div>
                <div className="space-y-1.5">
                  {g.items.map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted-foreground"> · {c.display_phone ?? "—"}</span>
                        {!c.waba_id && <span className="text-xs text-destructive"> · sem waba_id</span>}
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
            ))}
          </div>
        </div>
      )}


      <PostSignupDialog
        connectionId={finishId}
        open={!!finishId}
        onOpenChange={(v) => !v && setFinishId(null)}
      />
    </div>
  );
}

function groupByWaba(w: any) {
  const wabaName = new Map<string, string>();
  for (const x of w.wabas ?? []) if (x.waba_id) wabaName.set(String(x.waba_id), x.nome_interno);
  const groups = new Map<string, any>();
  for (const c of [...(w.connections ?? [])].sort((a: any, b: any) => String(a.name ?? "").localeCompare(String(b.name ?? ""), "pt-BR"))) {
    const key = c.waba_id ? String(c.waba_id) : "__sem_waba";
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        waba_id: c.waba_id ?? null,
        label: c.waba_id ? (wabaName.get(String(c.waba_id)) ?? "WABA sem cadastro local") : "Sem WABA vinculada",
        items: [],
      });
    }
    groups.get(key).items.push(c);
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

const TIER_LIMITS: Record<string, number> = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1000,
  TIER_2K: 2000,
  TIER_10K: 10000,
  TIER_100K: 100000,
  TIER_UNLIMITED: Number.POSITIVE_INFINITY,
  UNTIERED: Number.POSITIVE_INFINITY,
  UNLIMITED: Number.POSITIVE_INFINITY,
};

function workspaceCapacity(w: any): number | null {
  let cap: number | null = null;
  for (const c of w.connections ?? []) {
    const v = TIER_LIMITS[String(c.messaging_limit ?? "").toUpperCase()];
    if (v === undefined) continue;
    cap = cap === null ? v : Math.max(cap, v);
  }
  return cap;
}
