import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { PublicCustomizationDialog } from "@/components/admin/public-customization-dialog";
import { Sparkles } from "lucide-react";
import {
  getCampaignAnalytics,
  getCampaignDispatchAudit,
  listWaCampaignsForLinking,
  recalculateLinkedDispatchMetrics,
  setWaCampaignLink,
} from "@/lib/campaigns.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowLeft, Pencil, Printer, RefreshCw, Share2 } from "lucide-react";
import { toast } from "sonner";
import { IntentScoreBadge, StatusBadge } from "@/components/campaign-badges";
import { CampaignAnalytics } from "@/components/CampaignAnalytics";
import { ErrorCard } from "@/components/admin/query-state";

export const Route = createFileRoute("/_authenticated/admin/campaigns/$id")({
  head: () => ({ meta: [{ title: "Métricas da campanha" }] }),
  component: CampaignDetail,
});

function CampaignDetail() {
  const { id } = Route.useParams();
  const [overridesOpen, setOverridesOpen] = useState(false);
  const fn = useServerFn(getCampaignAnalytics);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["campaign-analytics", id],
    queryFn: () => fn({ data: { id } }),
  });

  const stats = useMemo(() => {
    if (!data) return null;
    const clicks = data.clicks;
    const uniqueIps = new Set(clicks.map((c) => c.ip).filter(Boolean)).size;
    const byDay: Record<string, number> = {};
    const byHour: number[] = new Array(24).fill(0);
    for (const c of clicks) {
      const d = new Date(c.clicked_at as string);
      const key = d.toISOString().slice(0, 10);
      byDay[key] = (byDay[key] ?? 0) + 1;
      byHour[d.getHours()] += 1;
    }
    const series = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));
    const hourly = byHour.map((count, hour) => ({
      hour: `${String(hour).padStart(2, "0")}h`,
      count,
    }));
    const top = (field: keyof (typeof clicks)[number]) => {
      const m: Record<string, number> = {};
      for (const c of clicks) {
        const k = (c[field] as string | null) || "—";
        m[k] = (m[k] ?? 0) + 1;
      }
      return Object.entries(m)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([label, count]) => ({ label, count }));
    };
    return {
      total: clicks.length,
      unique: uniqueIps,
      series,
      hourly,
      countries: top("country"),
      cities: top("city"),
      devices: top("device_type"),
      browsers: top("browser"),
    };
  }, [data]);

  if (error) {
    return <ErrorCard error={error} onRetry={() => refetch()} />;
  }

  if (isLoading || !data || !stats) {
    return <p className="text-sm text-muted-foreground">Carregando métricas...</p>;
  }

  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/${data.campaign.slug}`
      : `/${data.campaign.slug}`;

  return (
    <div className="space-y-6 print-root">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <Button variant="ghost" size="sm" asChild className="-ml-2 no-print">
            <Link to="/admin">
              <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{data.campaign.name}</h1>
            <StatusBadge status={data.campaign.status} />
            <IntentScoreBadge score={data.campaign.intent_score} />
            {data.campaign.category && (
              <span className="text-xs text-muted-foreground">{data.campaign.category}</span>
            )}
          </div>
          <p className="text-sm text-muted-foreground break-all">
            <a href={`/${data.campaign.slug}`} target="_blank" rel="noreferrer" className="hover:underline">
              {publicUrl}
            </a>{" "}
            →{" "}
            <a href={data.campaign.destination_url} target="_blank" rel="noreferrer" className="hover:underline">
              {data.campaign.destination_url}
            </a>
          </p>
          <p className="hidden print:block text-xs text-muted-foreground">
            Relatório gerado em {new Date().toLocaleString("pt-BR")}
          </p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const url = `${window.location.origin}/campaigns/${data.campaign.id}`;
              try {
                await navigator.clipboard.writeText(url);
                toast.success("Link público copiado", { description: url });
              } catch {
                toast.error("Não foi possível copiar", { description: url });
              }
            }}
          >
            <Share2 className="mr-1 h-4 w-4" /> Link público
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" /> Imprimir PDF
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/campaigns/$id/edit" params={{ id: data.campaign.id }}>
              <Pencil className="mr-1 h-4 w-4" /> Editar
            </Link>
          </Button>
          <Button variant="default" size="sm" onClick={() => setOverridesOpen(true)}>
            <Sparkles className="mr-1 h-4 w-4" /> Personalizar página pública
          </Button>
        </div>
      </div>

      <PublicCustomizationDialog
        campaignId={data.campaign.id}
        campaignName={data.campaign.name ?? "Campanha"}
        campaignSlug={data.campaign.slug ?? undefined}
        open={overridesOpen}
        onOpenChange={setOverridesOpen}
      />

      <CampaignAnalytics campaignId={id} hours={24} />


      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Cliques totais" value={stats.total} />
        <StatCard label="Cliques únicos" value={stats.unique} />
        <StatCard label="Países" value={stats.countries.length} />
        <StatCard label="Cidades" value={stats.cities.length} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cliques ao longo do tempo</CardTitle>
          <CardDescription>Agrupado por dia.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            {stats.series.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados ainda.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.series}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis allowDecimals={false} fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary, 222 47% 11%))" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Acessos por hora do dia</CardTitle>
          <CardDescription>Soma de cliques agrupada por hora local do servidor.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-56">
            {stats.total === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados ainda.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.hourly}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" fontSize={11} interval={1} />
                  <YAxis allowDecimals={false} fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary, 222 47% 11%))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Breakdown title="Países" rows={stats.countries} />
        <Breakdown title="Cidades" rows={stats.cities} />
        <Breakdown title="Dispositivos" rows={stats.devices} />
        <Breakdown title="Navegadores" rows={stats.browsers} />
      </div>

      <LinkedDispatches campaignId={id} />

      <DispatchAudit campaignId={id} />

      <Card>
        <CardHeader>
          <CardTitle>Histórico de acessos</CardTitle>
          <CardDescription>Últimos {data.clicks.length} cliques.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Local</TableHead>
                <TableHead>Provedor / ASN</TableHead>
                <TableHead>Dispositivo</TableHead>
                <TableHead>Navegador</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>URL final</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.clicks.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="whitespace-nowrap">
                    {new Date(c.clicked_at as string).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell>{c.ip ?? "—"}</TableCell>
                  <TableCell>
                    {[c.city, c.region, c.country].filter(Boolean).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {c.isp ?? "—"}
                    {c.as_name ? <div className="text-xs text-muted-foreground truncate">{c.as_name}</div> : null}
                  </TableCell>
                  <TableCell>
                    {(c.device_type ?? "—") + (c.os ? ` · ${c.os}${c.os_version ? " " + c.os_version : ""}` : "")}
                  </TableCell>
                  <TableCell>
                    {(c.browser ?? "—") + (c.browser_version ? ` ${c.browser_version}` : "")}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">{c.referer ?? "direto"}</TableCell>
                  <TableCell className="max-w-[240px] truncate">
                    {c.final_url ? (
                      <a href={c.final_url} target="_blank" rel="noreferrer" className="hover:underline">
                        {c.final_url}
                      </a>
                    ) : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {data.clicks.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    Nenhum acesso registrado ainda.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function LinkedDispatches({ campaignId }: { campaignId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listWaCampaignsForLinking);
  const linkFn = useServerFn(setWaCampaignLink);
  const recalcFn = useServerFn(recalculateLinkedDispatchMetrics);
  const { data, isLoading } = useQuery({
    queryKey: ["wa-campaigns-for-linking", campaignId],
    queryFn: () => listFn({ data: { campaignId } }),
  });
  const mutation = useMutation({
    mutationFn: (vars: { waCampaignId: string; link: boolean }) =>
      linkFn({ data: { waCampaignId: vars.waCampaignId, campaignId: vars.link ? campaignId : null } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wa-campaigns-for-linking", campaignId] });
      toast.success("Vínculo atualizado");
    },
    onError: (e) => toast.error("Falha ao atualizar vínculo", { description: (e as Error).message }),
  });
  const recalcMutation = useMutation({
    mutationFn: () => recalcFn({ data: { campaignId } }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["wa-campaigns-for-linking", campaignId] });
      qc.invalidateQueries({ queryKey: ["campaign-dispatch-audit", campaignId] });
      qc.invalidateQueries({ queryKey: ["campaign-analytics", campaignId] });
      const updated = result.updated?.length ?? 0;
      toast.success("Métricas recalculadas", { description: `${updated} disparo(s) atualizado(s).` });
    },
    onError: (e) => toast.error("Falha ao recalcular métricas", { description: (e as Error).message }),
  });

  const linked = (data ?? []).filter((r) => r.is_linked);
  const available = (data ?? []).filter((r) => !r.is_linked && !r.linked_campaign_id);

  return (
    <Card className="no-print">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Disparos WhatsApp vinculados</CardTitle>
            <CardDescription>
              Vincule campanhas de disparo para que os contadores (contatos, enviados, entregues e falhas) apareçam no relatório público em tempo real.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={recalcMutation.isPending || linked.length === 0}
            onClick={() => recalcMutation.mutate()}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${recalcMutation.isPending ? "animate-spin" : ""}`} />
            Recalcular métricas
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando disparos...</p>
        ) : (
          <>
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase text-muted-foreground">Vinculados</div>
              {linked.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum disparo vinculado.</p>
              )}
              {linked.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded border p-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{r.name || "Sem nome"}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.status} · {r.sent_count ?? 0}/{r.total_recipients ?? 0} enviados
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ waCampaignId: r.id, link: false })}
                  >
                    Desvincular
                  </Button>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium uppercase text-muted-foreground">Disponíveis</div>
              {available.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum disparo disponível para vincular.</p>
              )}
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {available.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded border p-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm">{r.name || "Sem nome"}</div>
                      <div className="text-xs text-muted-foreground">{r.status}</div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ waCampaignId: r.id, link: true })}
                    >
                      Vincular
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DispatchAudit({ campaignId }: { campaignId: string }) {
  const auditFn = useServerFn(getCampaignDispatchAudit);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["campaign-dispatch-audit", campaignId],
    queryFn: () => auditFn({ data: { campaignId } }),
  });

  return (
    <Card className="no-print">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Auditoria de entrega WhatsApp</CardTitle>
            <CardDescription>
              Eventos processados, tentativas de envio e logs gravados para os disparos vinculados.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`mr-1 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Atualizar auditoria
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {error ? (
          <ErrorCard error={error} onRetry={() => refetch()} />
        ) : isLoading || !data ? (
          <p className="text-sm text-muted-foreground">Carregando auditoria...</p>
        ) : data.dispatches.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum disparo vinculado para auditar.</p>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              {data.dispatches.map((dispatch) => {
                const summary = data.recipientSummaries.find((s) => s.campaign_id === dispatch.id);
                return (
                  <div key={dispatch.id} className="rounded border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{dispatch.name || "Sem nome"}</div>
                        <div className="text-xs text-muted-foreground">
                          {dispatch.status} · {dispatch.progress?.percent ?? 0}% progresso
                        </div>
                      </div>
                      <Badge variant="secondary">{summary?.with_meta_message_id ?? 0} IDs Meta</Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                      <AuditNumber label="Contatos" value={summary?.total ?? dispatch.total_recipients ?? 0} />
                      <AuditNumber label="Enviados" value={dispatch.sent_count ?? 0} />
                      <AuditNumber label="Entregues" value={dispatch.delivered_count ?? 0} />
                      <AuditNumber label="Falhas" value={dispatch.failed_count ?? 0} />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                      <div>sent_at: {summary?.with_sent_at ?? 0}</div>
                      <div>delivered_at: {summary?.with_delivered_at ?? 0}</div>
                      <div>failed_at: {summary?.with_failed_at ?? 0}</div>
                      <div>accepted: {summary?.accepted ?? 0}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <AuditTable
              title="Últimos eventos do webhook localizados"
              empty="Nenhum log do webhook com campaign_id foi localizado para estes disparos."
              rows={data.webhookLogs.map((row) => ({
                id: row.id,
                when: row.created_at,
                type: row.event_type ?? "—",
                status: row.error ? "erro" : row.processed ? "processado" : "registrado",
                detail: row.error ?? compactJson(row.payload),
              }))}
            />

            <AuditTable
              title="Últimos logs de mensagens"
              empty="Nenhum log de mensagem encontrado."
              rows={data.messageLogs.map((row) => ({
                id: row.id,
                when: row.updated_at ?? row.created_at,
                type: row.message_status ?? "—",
                status: row.http_status ? `HTTP ${row.http_status}` : "—",
                detail: row.error_code || row.failed_reason || row.meta_message_id || "—",
              }))}
            />

            <AuditTable
              title="Últimas tentativas de disparo"
              empty="Nenhuma tentativa encontrada."
              rows={data.attempts.map((row) => ({
                id: row.id,
                when: row.attempted_at,
                type: row.message_status ?? "—",
                status: row.http_status ? `HTTP ${row.http_status}` : "—",
                detail: row.error_code || row.meta_message_id || compactJson(row.error_details),
              }))}
            />

            <AuditTable
              title="Linha do tempo de processamento"
              empty="Nenhum evento de processamento registrado."
              rows={data.timeline.map((row) => ({
                id: row.id,
                when: row.created_at,
                type: row.event_type ?? "—",
                status: row.message ?? "—",
                detail: compactJson(row.payload),
              }))}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AuditNumber({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded bg-muted p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function AuditTable({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: { id: string; when: string | null; type: string; status: string; detail: string }[];
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase text-muted-foreground">{title}</div>
      <div className="overflow-x-auto rounded border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quando</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Detalhe</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, 20).map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap">
                  {row.when ? new Date(row.when).toLocaleString("pt-BR") : "—"}
                </TableCell>
                <TableCell>{row.type}</TableCell>
                <TableCell>{row.status}</TableCell>
                <TableCell className="max-w-[520px] truncate font-mono text-xs">{row.detail}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  {empty}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function compactJson(value: unknown) {
  if (!value) return "—";
  try {
    return JSON.stringify(value).slice(0, 500);
  } catch {
    return "—";
  }
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">Sem dados.</p>}
        {rows.map((r) => (
          <div key={r.label} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="truncate pr-2">{r.label}</span>
              <span className="text-muted-foreground">{r.count}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded bg-muted">
              <div
                className="h-full bg-primary"
                style={{ width: `${(r.count / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
