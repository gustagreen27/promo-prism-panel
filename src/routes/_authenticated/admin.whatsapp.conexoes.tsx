import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Save, Webhook, ListChecks, Building2, Users, Gauge, Info, RefreshCw, Link2, Phone, ShieldCheck, TrendingUp, ChevronDown, Unplug } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { ErrorCard } from "@/components/admin/query-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { EmbeddedSignupButton } from "@/components/admin/whatsapp/embedded-signup-button";
import { PostSignupDialog } from "@/components/admin/whatsapp/post-signup-dialog";
import {
  listWorkspaceConnections,
  setWorkspaceBusinessId,
  setWorkspaceDefaultConnection,
  subscribeConnectionToApp,
  recalcWorkspaceCapacity,
  disconnectWorkspaceBM,
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

  const recalcFn = useServerFn(recalcWorkspaceCapacity);
  const recalcMut = useMutation({
    mutationFn: (workspace_id: string | null) => recalcFn({ data: { workspace_id } }),
    onSuccess: (r: any) => {
      toast.success(`Capacidade recalculada (${r?.resolved ?? 0}/${r?.wabas ?? 0} WABAs)`);
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao recalcular capacidade"),
  });

  // Recalcula automaticamente ao abrir quando algum workspace está sem capacidade conhecida.
  const autoDone = useRef(false);
  useEffect(() => {
    if (autoDone.current || !rows) return;
    const missing = (rows as any[]).some(
      (w) => workspaceCapacity(w) === null && (w.connections ?? []).some((c: any) => c.waba_id),
    );
    if (!missing) return;
    autoDone.current = true;
    recalcMut.mutate(null);
  }, [rows]);

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
  const disconnectFn = useServerFn(disconnectWorkspaceBM);
  const disconnectMut = useMutation({
    mutationFn: (workspace_id: string) => disconnectFn({ data: { workspace_id } }),
    onSuccess: (r: any) => {
      toast.success(`BM desconectada · ${r?.wabas_removed ?? 0} portfólio(s) removido(s)`);
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao desconectar BM"),
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
        <EmbeddedSignupButton mode="standard" label="Conectar WhatsApp" />
      </div>
      {isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
      ) : error ? (
        <ErrorCard error={error} onRetry={() => refetch()} />
      ) : !rows || rows.length === 0 ? (
        <EmptyState title="Nenhum workspace" />
      ) : (
        <div className="space-y-8">
          {rows.map((w: any) => (
            <WorkspaceCard
              key={w.id}
              w={w}
              onSaveBiz={(p: { meta_business_id: string | null; meta_business_name: string | null }) => bizMut.mutate({ workspace_id: w.id, ...p })}
              onSaveDefault={(cid: string | null) => defMut.mutate({ workspace_id: w.id, connection_id: cid })}
              onSubscribe={(cid: string) => subMut.mutate(cid)}
              subscribingId={subMut.isPending ? (subMut.variables as string | undefined) : undefined}
              onRecalc={() => recalcMut.mutate(w.id)}
              recalcing={recalcMut.isPending && (recalcMut.variables === w.id || recalcMut.variables === null)}
              saving={bizMut.isPending || defMut.isPending}
              onDisconnect={() => disconnectMut.mutate(w.id)}
              disconnecting={disconnectMut.isPending && disconnectMut.variables === w.id}
            />
          ))}
        </div>
      )}
    </>
  );
}

function qualityMeta(q: any) {
  const v = String(q ?? "").toUpperCase();
  if (v === "GREEN" || v === "HIGH") return { label: "Alta", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" };
  if (v === "YELLOW" || v === "MEDIUM") return { label: "Média", cls: "border-amber-500/30 bg-amber-500/10 text-amber-600" };
  if (v === "RED" || v === "LOW") return { label: "Baixa", cls: "border-red-500/30 bg-red-500/10 text-red-600" };
  if (v) return { label: "Boa", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" };
  return { label: "sem dados", cls: "border-border bg-muted text-muted-foreground" };
}

function avgQuality(items: any[]) {
  const score: Record<string, number> = { GREEN: 3, HIGH: 3, YELLOW: 2, MEDIUM: 2, RED: 1, LOW: 1 };
  const vals = items.map((c) => score[String(c.quality_rating ?? "").toUpperCase()]).filter(Boolean) as number[];
  if (!vals.length) return null;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return avg >= 2.6 ? "alta" : avg >= 1.8 ? "boa" : "baixa";
}

function WorkspaceCard({ w, onSaveBiz, onSaveDefault, onSubscribe, subscribingId, saving, onRecalc, recalcing }: any) {
  const [bizId, setBizId] = useState<string>(w.meta_business_id ?? "");
  const [bizName, setBizName] = useState<string>(w.meta_business_name ?? "");
  const [defConn, setDefConn] = useState<string>(w.default_connection_id ?? "");
  const [finishId, setFinishId] = useState<string | null>(null);
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  const cap = workspaceCapacity(w);
  const used = Number(w.messages_last_24h ?? 0);
  const pct = cap && Number.isFinite(cap) ? Math.min(100, (used / cap) * 100) : null;
  const tplByWabaId = new Map<string, number>();
  for (const x of w.wabas ?? []) if (x.waba_id) tplByWabaId.set(String(x.waba_id), Number(x.templates_count ?? 0));

  return (
    <div className="space-y-4">
      {/* Cabeçalho do portfólio */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-5 py-4 md:px-6">
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* Configurações do BM */}
        <div className="rounded-2xl border bg-card p-5 md:p-6">
          <div className="mb-4 text-base font-semibold">Configurações do Business Manager</div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-1.5">
              <Label className="text-xs">Business Manager ID</Label>
              <Input className="h-11 rounded-xl" value={bizId} onChange={(e) => setBizId(e.target.value)} placeholder="1234567890" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nome do BM (opcional)</Label>
              <Input className="h-11 rounded-xl" value={bizName} onChange={(e) => setBizName(e.target.value)} placeholder="Minha Empresa" />
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                className="h-11 rounded-xl"
                disabled={saving}
                onClick={() =>
                  onSaveBiz({ meta_business_id: bizId.trim() || null, meta_business_name: bizName.trim() || null })
                }
              >
                <Save className="mr-2 h-4 w-4" />Salvar BM
              </Button>
            </div>
          </div>

          <div className="mt-4 space-y-1.5">
            <Label className="text-xs">Número padrão de envio</Label>
            <Select value={defConn} onValueChange={setDefConn}>
              <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="— nenhum —" /></SelectTrigger>
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

          <div className="mt-5 flex justify-end">
            <Button className="h-11 rounded-xl" disabled={saving} onClick={() => onSaveDefault(defConn || null)}>
              <Save className="mr-2 h-4 w-4" />Salvar padrão
            </Button>
          </div>
        </div>

        {/* Limite de disparos */}
        <div className="rounded-2xl border bg-primary/[0.04] p-5 md:p-6">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Gauge className="h-5 w-5" />
              </div>
              <div>
                <div className="text-lg font-bold leading-tight">Limite de disparos</div>
                <div className="text-sm text-muted-foreground">Portfólio empresarial</div>
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 px-2 text-sm text-primary hover:text-primary"
              disabled={recalcing}
              onClick={() => onRecalc?.()}
              title="Buscar o limite atual do portfólio na Meta"
            >
              <RefreshCw className={`h-4 w-4 ${recalcing ? "animate-spin" : ""}`} />
              {recalcing ? "Recalculando…" : "Recalcular"}
            </Button>
          </div>

          <div className="mt-5 flex items-end justify-between gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Capacidade atual</div>
              <div className="mt-1 text-4xl font-extrabold tracking-tight text-primary">
                {cap === null ? "sem dados" : cap === Infinity ? "ilimitado" : cap.toLocaleString("pt-BR")}
                {cap !== null && cap !== Infinity && <span className="ml-1 text-xl font-semibold text-foreground">/ dia</span>}
              </div>
            </div>
            <div
              className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-primary"
              style={{
                background: `conic-gradient(var(--primary) ${(pct ?? 0) * 3.6}deg, color-mix(in oklab, var(--primary) 12%, transparent) 0deg)`,
              }}
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-card">
                {pct === null ? "—" : `${pct.toFixed(1).replace(".", ",")}%`}
              </span>
            </div>
          </div>

          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-primary/15">
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

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5">
              <Link2 className="h-4 w-4 text-primary" />
              <div className="leading-tight">
                <div className="font-semibold">{w.wabas.length}</div>
                <div className="text-xs text-muted-foreground">WABAs vinculados</div>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5">
              <Phone className="h-4 w-4 text-primary" />
              <div className="leading-tight">
                <div className="font-semibold">{w.connections.length}</div>
                <div className="text-xs text-muted-foreground">números</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Números por WABA */}
      {w.connections.length > 0 && (
        <div>
          <div className="mb-2 flex flex-wrap items-baseline gap-2">
            <span className="text-base font-semibold">Números por WABA</span>
            <span className="text-sm text-muted-foreground">assinar app / finalizar integração</span>
          </div>
          <div className="space-y-3">
            {groupByWaba(w).map((g: any) => {
              const isClosed = !!closed[g.key];
              const q = avgQuality(g.items);
              const tpl = g.waba_id ? tplByWabaId.get(String(g.waba_id)) ?? 0 : 0;
              return (
                <div key={g.key} className="overflow-hidden rounded-2xl border bg-card">
                  <button
                    type="button"
                    onClick={() => setClosed((s) => ({ ...s, [g.key]: !isClosed }))}
                    className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Building2 className="h-4.5 w-4.5" />
                    </span>
                    <span className="text-lg font-bold">{g.label}</span>
                    {g.waba_id && (
                      <Badge variant="outline" className="rounded-full bg-muted/60 font-normal">
                        <span className="text-muted-foreground">WABA ID</span>
                        <span className="ml-1.5 font-mono">{g.waba_id}</span>
                      </Badge>
                    )}
                    <Badge variant="outline" className="gap-1.5 rounded-full bg-muted/60 font-normal">
                      <Users className="h-3.5 w-3.5" />{g.items.length} números
                    </Badge>
                    <Badge variant="outline" className="gap-1.5 rounded-full border-violet-500/30 bg-violet-500/10 font-normal text-violet-600">
                      <ShieldCheck className="h-3.5 w-3.5" />{tpl} templates
                    </Badge>
                    {q && (
                      <Badge variant="outline" className="gap-1.5 rounded-full border-emerald-500/30 bg-emerald-500/10 font-normal text-emerald-600">
                        <TrendingUp className="h-3.5 w-3.5" />Qualidade média: {q}
                      </Badge>
                    )}
                    <ChevronDown className={`ml-auto h-5 w-5 text-muted-foreground transition-transform ${isClosed ? "" : "rotate-180"}`} />
                  </button>

                  {!isClosed && (
                    <div className="divide-y border-t">
                      {g.items.map((c: any) => {
                        const qm = qualityMeta(c.quality_rating);
                        return (
                          <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                            <span className="min-w-[180px] font-medium">{c.name}</span>
                            <span className="min-w-[150px] text-muted-foreground">{c.display_phone ?? "—"}</span>
                            <Badge variant="outline" className={`rounded-md font-normal ${qm.cls}`}>{qm.label}</Badge>
                            <span className="text-sm text-muted-foreground">
                              {c.waba_id ? "usa templates da WABA" : "sem waba_id"}
                            </span>
                            <div className="ml-auto flex shrink-0 items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-lg"
                                disabled={!c.waba_id || subscribingId === c.id}
                                onClick={() => onSubscribe(c.id)}
                              >
                                <Webhook className="mr-2 h-3.5 w-3.5" />
                                {subscribingId === c.id ? "Assinando…" : "Assinar app"}
                              </Button>
                              <Button size="sm" className="rounded-lg" onClick={() => setFinishId(c.id)}>
                                <ListChecks className="mr-2 h-3.5 w-3.5" />
                                Finalizar integração
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
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
