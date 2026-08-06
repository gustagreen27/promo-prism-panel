import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RefreshCw, ShieldCheck, ShieldAlert, ShieldX, History, Clock } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getHealthOverview, refreshHealthNode, refreshAllHealth, listHealthEvents } from "@/lib/wa-health.functions";

export const Route = createFileRoute("/_authenticated/admin/whatsapp/saude")({
  head: () => ({
    meta: [
      { title: "Saúde de envio — WhatsApp" },
      { name: "description", content: "Monitoramento do health_status de números, WABAs e templates do WhatsApp com histórico e alertas." },
    ],
  }),
  component: HealthPage,
});

function statusMeta(s?: string | null) {
  if (s === "AVAILABLE") return { cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200", Icon: ShieldCheck };
  if (s === "LIMITED") return { cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200", Icon: ShieldAlert };
  if (s === "BLOCKED") return { cls: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200", Icon: ShieldX };
  return { cls: "bg-muted text-muted-foreground", Icon: ShieldAlert };
}

function StatusPill({ value }: { value?: string | null }) {
  const { cls, Icon } = statusMeta(value);
  return (
    <Badge variant="secondary" className={cls}>
      <Icon className="mr-1 h-3 w-3" />
      {value ?? "não verificado"}
    </Badge>
  );
}

function when(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

function HealthPage() {
  const overviewFn = useServerFn(getHealthOverview);
  const refreshFn = useServerFn(refreshHealthNode);
  const refreshAllFn = useServerFn(refreshAllHealth);
  const eventsFn = useServerFn(listHealthEvents);
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string | null>(null);

  const overview = useQuery({ queryKey: ["wa-health-overview"], queryFn: () => overviewFn(), refetchInterval: 60_000 });
  const events = useQuery({
    queryKey: ["wa-health-events", filter],
    queryFn: () => eventsFn({ data: filter ? { node_id: filter, limit: 60 } : { limit: 60 } }),
    refetchInterval: 60_000,
  });

  const refreshOne = useMutation({
    mutationFn: (v: { connection_id?: string; template_ref_id?: string }) => refreshFn({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wa-health-overview"] }); qc.invalidateQueries({ queryKey: ["wa-health-events"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao verificar"),
  });
  const refreshAll = useMutation({
    mutationFn: (include_templates: boolean) => refreshAllFn({ data: { include_templates } }),
    onSuccess: (r: any) => {
      toast.success(`Verificados: ${r.numbers} número(s), ${r.templates} template(s)`);
      if (r.errors?.length) toast.warning(`${r.errors.length} falha(s) na verificação`);
      qc.invalidateQueries({ queryKey: ["wa-health-overview"] });
      qc.invalidateQueries({ queryKey: ["wa-health-events"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao verificar"),
  });

  const data = overview.data as any;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Saúde de envio"
        description="health_status de números, WABAs e templates. A pré-checagem automática bloqueia disparos quando o status estiver BLOCKED ou LIMITED."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refreshAll.mutate(false)} disabled={refreshAll.isPending}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshAll.isPending ? "animate-spin" : ""}`} />
              Verificar números
            </Button>
            <Button size="sm" onClick={() => refreshAll.mutate(true)} disabled={refreshAll.isPending}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshAll.isPending ? "animate-spin" : ""}`} />
              Verificar tudo
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Números / WABAs</CardTitle>
          <CardDescription>Status agregado do número, WABA, portfólio de negócios e app.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {overview.isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando…</div>
          ) : (data?.numbers ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhum número cadastrado.</div>
          ) : (
            (data.numbers as any[]).map((n) => <HealthRow
              key={n.connection_id}
              title={n.label}
              subtitle={`phone_number_id: ${n.phone_number_id ?? "—"}`}
              health={n.health}
              busy={refreshOne.isPending}
              onRefresh={() => refreshOne.mutate({ connection_id: n.connection_id })}
              onHistory={() => setFilter(n.health?.node_id ?? n.phone_number_id ?? null)}
            />)
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Message Templates</CardTitle>
          <CardDescription>
            Consulta <code>GET /&lt;TEMPLATE_ID&gt;?fields=health_status</code> — mostra can_send_message, errors e additional_info.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {overview.isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando…</div>
          ) : (data?.templates ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhum template sincronizado com meta_template_id.</div>
          ) : (
            (data.templates as any[]).map((t) => <HealthRow
              key={t.template_ref_id}
              title={`${t.name} · ${t.language}`}
              subtitle={`template_id: ${t.meta_template_id} · aprovação: ${t.approval_status}`}
              health={t.health}
              busy={refreshOne.isPending}
              onRefresh={() => refreshOne.mutate({ template_ref_id: t.template_ref_id })}
              onHistory={() => setFilter(t.meta_template_id)}
            />)
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" /> Histórico de mudanças</CardTitle>
              <CardDescription>
                {filter ? <>Filtrado por <code>{filter}</code></> : "Todas as transições AVAILABLE ↔ LIMITED ↔ BLOCKED, com data e hora."}
              </CardDescription>
            </div>
            {filter && <Button variant="ghost" size="sm" onClick={() => setFilter(null)}>Limpar filtro</Button>}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {(events.data as any[] | undefined)?.length ? (
            (events.data as any[]).map((e) => (
              <div key={e.id} className="rounded-lg border p-3 text-sm space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{e.label ?? e.node_id} <span className="text-muted-foreground">· {e.entity_type}</span></span>
                  <span className="flex items-center gap-2">
                    <StatusPill value={e.previous_status} />
                    <span className="text-muted-foreground">→</span>
                    <StatusPill value={e.new_status} />
                  </span>
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{when(e.created_at)}</div>
                {(e.errors ?? []).length > 0 && (
                  <ul className="list-disc pl-5 text-xs text-red-600 dark:text-red-400">
                    {(e.errors as any[]).map((x, i) => <li key={i}>[{x.error_code}] {x.error_description}{x.possible_solution ? ` — ${x.possible_solution}` : ""}</li>)}
                  </ul>
                )}
              </div>
            ))
          ) : (
            <div className="text-sm text-muted-foreground">Nenhuma mudança registrada ainda.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function HealthRow({
  title, subtitle, health, busy, onRefresh, onHistory,
}: {
  title: string; subtitle: string; health: any; busy: boolean;
  onRefresh: () => void; onHistory: () => void;
}) {
  const errors: any[] = health?.errors ?? [];
  const info: any[] = health?.additional_info ?? [];
  const entities: any[] = health?.entities ?? [];
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium truncate">{title}</div>
          <div className="text-xs text-muted-foreground truncate">{subtitle}</div>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill value={health?.can_send_message} />
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={busy}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Verificar
          </Button>
          <Button variant="ghost" size="sm" onClick={onHistory}><History className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      <div className="text-xs text-muted-foreground flex items-center gap-1">
        <Clock className="h-3 w-3" /> Última verificação: {when(health?.checked_at)}
        {health?.fetch_error && <span className="ml-2 text-red-600 dark:text-red-400">· {health.fetch_error}</span>}
      </div>

      {entities.length > 0 && (
        <div className="grid gap-1 md:grid-cols-2">
          {entities.map((e: any, i: number) => (
            <div key={i} className="flex items-center justify-between gap-2 rounded border bg-muted/30 px-2 py-1 text-xs">
              <span className="truncate">{e.entity_type} <span className="font-mono text-muted-foreground">{e.id}</span></span>
              <StatusPill value={e.can_send_message} />
            </div>
          ))}
        </div>
      )}

      {errors.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-red-600 dark:text-red-400 space-y-0.5">
          {errors.map((x, i) => <li key={i}>[{x.entity} · {x.error_code}] {x.error_description}{x.possible_solution ? ` — ${x.possible_solution}` : ""}</li>)}
        </ul>
      )}
      {info.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-amber-600 dark:text-amber-400 space-y-0.5">
          {info.map((x, i) => <li key={i}>[{x.entity}] {x.message}</li>)}
        </ul>
      )}
    </div>
  );
}
