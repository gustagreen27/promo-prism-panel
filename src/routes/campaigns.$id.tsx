import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { getPublicCampaignReport } from "@/lib/campaigns.functions";
import {
  coerceSimulation,
  computeSimulationSnapshot,
  type SimSnapshot,
  type SimulationConfig,
} from "@/lib/public-simulation";
import {
  computeDispatchSnapshot,
  type DispatchOverrideRow,
  type DispatchSimRow,
  type Snapshot,
} from "@/lib/dispatch-simulation";
import {
  computeGeneratedClicks,
  distributeByPercent,
  distributeHierarchical,
  scaleSeries,
  seedFromString,
  type ClicksGeneratorConfig,
} from "@/lib/public-clicks-generator";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Printer, Activity, Send, CheckCheck, Eye, MessageSquare, XCircle, Users } from "lucide-react";

export const Route = createFileRoute("/campaigns/$id")({
  head: () => ({
    meta: [
      { title: "Relatório da campanha" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content: "Relatório público com métricas e resultados da campanha.",
      },
    ],
  }),
  component: PublicCampaignReport,
  notFoundComponent: () => (
    <div className="mx-auto flex min-h-screen max-w-md items-center justify-center p-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">Campanha não encontrada</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          O link do relatório pode estar incorreto ou expirado.
        </p>
      </div>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="mx-auto flex min-h-screen max-w-md items-center justify-center p-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">Não foi possível carregar</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      </div>
    </div>
  ),
});

function PublicCampaignReport() {
  const { id } = Route.useParams();
  const fn = useServerFn(getPublicCampaignReport);

  // A simulação define seu próprio intervalo de refetch (padrão 15s).
  const [refetchMs, setRefetchMs] = useState(15000);

  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: ["public-campaign-report", id],
    queryFn: () => fn({ data: { id } }),
    retry: false,
    refetchInterval: refetchMs,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    refetchOnReconnect: true,
  });

  const overrides = (data?.overrides ?? {}) as {
    total_clicks?: number | null;
    sent?: number | null;
    delivered?: number | null;
    failed?: number | null;
    countries?: { label: string; count: number }[] | null;
    cities?: { label: string; count: number }[] | null;
    devices?: { label: string; count: number }[] | null;
    simulation?: SimulationConfig | null;
  };

  const simulation = useMemo(
    () => (overrides.simulation ? coerceSimulation(overrides.simulation) : null),
    [overrides.simulation],
  );

  // Tick local para o "efeito ao vivo" da simulação
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!simulation || simulation.mode === "real" || !simulation.runtime?.active) return;
    if (simulation.growth?.kind === "on_reload") return;
    const intervalMs = Math.max(1000, (simulation.refetch_interval_sec ?? 5) * 1000);
    const t = setInterval(() => setTick((n) => n + 1), intervalMs);
    setRefetchMs(Math.max(intervalMs, 5000));
    return () => clearInterval(t);
  }, [simulation]);
  void tick;

  // Novas tabelas de personalização por-disparo e métricas gerais
  const publicSettings = (data as any)?.publicSettings ?? null;
  const publicMetrics = ((data as any)?.publicMetrics ?? []) as any[];
  const publicDispatches = ((data as any)?.publicDispatches ?? []) as any[];
  const publicSimulations = ((data as any)?.publicSimulations ?? []) as any[];

  // Tick para simulações auto por-disparo ativas
  useEffect(() => {
    const active = publicSimulations.find((s) => s?.runtime?.active === true && !s?.runtime?.paused_at);
    if (!active) return;
    const intervalMs = Math.max(1000, (active.refresh_interval_sec ?? 5) * 1000);
    const t = setInterval(() => setTick((n) => n + 1), intervalMs);
    setRefetchMs(Math.max(intervalMs, 5000));
    return () => clearInterval(t);
  }, [publicSimulations]);

  // Tick para gerador de cliques ativo
  useEffect(() => {
    const gen = publicSettings?.clicks_generator;
    if (!gen?.enabled || publicSettings?.enabled !== true) return;
    const intervalMs = Math.max(1000, (gen.refresh_interval_sec ?? 10) * 1000);
    const t = setInterval(() => setTick((n) => n + 1), intervalMs);
    setRefetchMs((prev) => Math.min(prev, intervalMs));
    return () => clearInterval(t);
  }, [publicSettings]);


  const customEnabled = publicSettings?.enabled === true;
  const metricsMode = (publicSettings?.metrics_mode ?? "real") as "real" | "replace" | "merge";
  const customTotals = (publicSettings?.custom_totals ?? {}) as Record<string, number | null>;

  // Total público de entregues (aplicando overrides por-disparo, se ativos)
  const publicDeliveredTotal = useMemo(() => {
    if (!data) return 0;
    let total = 0;
    for (const d of data.dispatches ?? []) {
      const ov = publicDispatches.find((x) => x.wa_campaign_id === d.id);
      const sim = publicSimulations.find((x) => x.wa_campaign_id === d.id);
      if (customEnabled && ov?.enabled) {
        const snap = computeDispatchSnapshot(
          ov as DispatchOverrideRow,
          (sim ?? null) as DispatchSimRow | null,
          {
            name: d.name ?? null,
            status: d.status ?? null,
            total: d.total_recipients ?? 0,
            sent: d.sent_count ?? 0,
            delivered: d.delivered_count ?? 0,
            failed: d.failed_count ?? 0,
          },
          new Date(),
        );
        total += snap.delivered ?? d.delivered_count ?? 0;
      } else {
        total += d.delivered_count ?? 0;
      }
    }
    return total;
  }, [data, publicDispatches, publicSimulations, customEnabled]);

  const realDeliveredTotal = useMemo(
    () =>
      (data?.dispatches ?? []).reduce(
        (s, d) => s + (d.delivered_count ?? 0),
        0,
      ),
    [data],
  );

  const clicksGenerator = (publicSettings?.clicks_generator ?? null) as
    | ClicksGeneratorConfig
    | null;
  const generatorActive = !!(customEnabled && clicksGenerator?.enabled);

  const stats = useMemo(() => {
    if (!data) return null;
    const clicks = data.clicks;
    const byDay: Record<string, number> = {};
    const byHour: number[] = new Array(24).fill(0);
    for (const c of clicks) {
      const d = new Date(c.clicked_at as string);
      const key = d.toISOString().slice(0, 10);
      byDay[key] = (byDay[key] ?? 0) + 1;
      byHour[d.getHours()] += 1;
    }
    let series = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));
    let hourly = byHour.map((count, hour) => ({
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

    const merge = (real: { label: string; count: number }[], kind: string) => {
      const customList = publicMetrics
        .filter((m) => m.kind === kind)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((m) => ({
          label: m.label,
          count: m.count,
          percent: m.percent ?? null,
        }));
      if (!customEnabled || metricsMode === "real" || customList.length === 0)
        return real.map((r) => ({ ...r, percent: null as number | null }));
      if (metricsMode === "replace") return customList;
      // merge: soma por label
      const map = new Map<string, number>();
      for (const r of real) map.set(r.label, (map.get(r.label) ?? 0) + r.count);
      for (const c of customList)
        map.set(c.label, (map.get(c.label) ?? 0) + c.count);
      return Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([label, count]) => ({ label, count, percent: null }));
    };

    const realCountries = top("country");
    const realCities = top("city");
    const realDevices = top("device_type");
    const realBrowsers = top("browser");

    let countries = merge(realCountries, "country");
    let cities = merge(realCities, "city");
    let devices = merge(realDevices, "device");
    let browsers = merge(realBrowsers, "browser");

    // Defaults quando o gerador está ativo mas não há dados/personalizações
    // suficientes: injeta um conjunto plausível de cidades/países/dispositivos
    // para que a distribuição não fique concentrada em um único item.
    const DEFAULT_CITIES = [
      { label: "São Paulo", count: 0, percent: 22 },
      { label: "Rio de Janeiro", count: 0, percent: 14 },
      { label: "Belo Horizonte", count: 0, percent: 9 },
      { label: "Salvador", count: 0, percent: 8 },
      { label: "Brasília", count: 0, percent: 7 },
      { label: "Fortaleza", count: 0, percent: 6 },
      { label: "Curitiba", count: 0, percent: 6 },
      { label: "Manaus", count: 0, percent: 5 },
      { label: "Recife", count: 0, percent: 5 },
      { label: "Porto Alegre", count: 0, percent: 5 },
      { label: "Goiânia", count: 0, percent: 4 },
      { label: "Belém", count: 0, percent: 3 },
      { label: "Campinas", count: 0, percent: 3 },
      { label: "São Luís", count: 0, percent: 3 },
    ];
    const DEFAULT_COUNTRIES = [
      { label: "Brasil", count: 0, percent: 92 },
      { label: "Portugal", count: 0, percent: 3 },
      { label: "Estados Unidos", count: 0, percent: 2 },
      { label: "Argentina", count: 0, percent: 2 },
      { label: "Paraguai", count: 0, percent: 1 },
    ];
    const DEFAULT_DEVICES = [
      { label: "mobile", count: 0, percent: 78 },
      { label: "desktop", count: 0, percent: 18 },
      { label: "tablet", count: 0, percent: 4 },
    ];
    const DEFAULT_BROWSERS = [
      { label: "Chrome", count: 0, percent: 55 },
      { label: "Safari", count: 0, percent: 22 },
      { label: "Android Browser", count: 0, percent: 12 },
      { label: "Edge", count: 0, percent: 6 },
      { label: "Firefox", count: 0, percent: 3 },
      { label: "Opera", count: 0, percent: 2 },
    ];
    const hasCustom = (kind: string) =>
      publicMetrics.some((m) => m.kind === kind);
    // Listas manuais definidas dentro do próprio gerador têm prioridade
    // sobre defaults e overrides "kind=city/country".
    const genCities = (clicksGenerator?.cities ?? []) as {
      label: string;
      percent: number;
      country?: string | null;
    }[];
    const genCountries = (clicksGenerator?.countries ?? []) as {
      label: string;
      percent: number;
    }[];
    const genHierarchical = Boolean(clicksGenerator?.hierarchical);

    if (generatorActive) {
      if (genCities.length > 0) {
        cities = genCities.map((c) => ({
          label: c.label,
          count: 0,
          percent: c.percent,
        }));
      } else if (!hasCustom("city") && cities.length <= 1) {
        cities = DEFAULT_CITIES;
      }
      if (genCountries.length > 0) {
        countries = genCountries.map((c) => ({
          label: c.label,
          count: 0,
          percent: c.percent,
        }));
      } else if (!hasCustom("country") && countries.length <= 1) {
        countries = DEFAULT_COUNTRIES;
      }
      if (!hasCustom("device") && devices.length <= 1) devices = DEFAULT_DEVICES;
      if (!hasCustom("browser") && browsers.length <= 1) browsers = DEFAULT_BROWSERS;
    }

    const realTotalClicks = clicks.length;
    let total: number;
    if (generatorActive && clicksGenerator) {
      const seed = seedFromString(String(data.campaign.id ?? ""));
      const source =
        clicksGenerator.use_source === "real"
          ? realDeliveredTotal
          : publicDeliveredTotal;
      const generated = computeGeneratedClicks(source, clicksGenerator, seed);
      total =
        clicksGenerator.replace_or_add === "add"
          ? generated + realTotalClicks
          : generated;
    } else if (customEnabled && customTotals.clicks != null) {
      total = customTotals.clicks;
    } else if (overrides.total_clicks != null) {
      total = overrides.total_clicks;
    } else {
      total = realTotalClicks;
    }

    // Distribui o total público entre as categorias por %/peso
    if (generatorActive) {
      if (genHierarchical && genCountries.length > 0 && genCities.length > 0) {
        const h = distributeHierarchical(genCountries, genCities, total);
        countries = h.countries.map((r) => ({ ...r, percent: null }));
        cities = h.cities.map((r) => ({ ...r, percent: null }));
      } else {
        countries = distributeByPercent(countries, total).map((r) => ({
          ...r,
          percent: null,
        }));
        cities = distributeByPercent(cities, total).map((r) => ({
          ...r,
          percent: null,
        }));
      }
      devices = distributeByPercent(devices, total).map((r) => ({
        ...r,
        percent: null,
      }));
      browsers = distributeByPercent(browsers, total).map((r) => ({
        ...r,
        percent: null,
      }));
      series = scaleSeries(series, total);
      hourly = scaleSeries(hourly, total);
    }

    return {
      total,
      countries,
      cities,
      devices,
      browsers,
      series,
      hourly,
    };
  }, [
    data,
    overrides,
    publicMetrics,
    customEnabled,
    metricsMode,
    customTotals,
    generatorActive,
    clicksGenerator,
    publicDeliveredTotal,
    realDeliveredTotal,
  ]);


  if (error) {
    if ((error as Error).message === "NOT_FOUND") throw notFound();
    return (
      <div className="mx-auto max-w-md p-6 text-center text-sm text-muted-foreground">
        {(error as Error).message}
      </div>
    );
  }

  if (isLoading || !data || !stats) {
    return (
      <div className="mx-auto max-w-4xl p-6 text-sm text-muted-foreground">
        Carregando relatório...
      </div>
    );
  }

  const dispatches = data.dispatches ?? [];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card no-print">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="text-sm font-medium text-muted-foreground">
              Relatório da campanha
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2 py-0.5 text-xs">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Ao vivo
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" /> Imprimir PDF
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 p-6 print-root">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {data.campaign.name}
          </h1>
          {data.campaign.category && (
            <p className="text-sm text-muted-foreground">
              {data.campaign.category}
            </p>
          )}
          {dataUpdatedAt ? (
            <p className="text-xs text-muted-foreground">
              Atualizado às {new Date(dataUpdatedAt).toLocaleTimeString("pt-BR")}
            </p>
          ) : null}
          <p className="hidden print:block text-xs text-muted-foreground">
            Relatório gerado em {new Date().toLocaleString("pt-BR")}
          </p>
        </div>

        {dispatches.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <h2 className="text-lg font-semibold">Disparos WhatsApp em tempo real</h2>
            </div>
            <div className="space-y-4">
              {dispatches.map((d, i) => {
                const perDispatchOverride = publicDispatches.find((x) => x.wa_campaign_id === d.id) ?? null;
                const perDispatchSim = publicSimulations.find((x) => x.wa_campaign_id === d.id) ?? null;
                const perSnap: Snapshot | null =
                  customEnabled && perDispatchOverride?.enabled
                    ? computeDispatchSnapshot(
                        perDispatchOverride as DispatchOverrideRow,
                        perDispatchSim as DispatchSimRow | null,
                        {
                          name: d.name ?? null,
                          status: d.status ?? null,
                          total: d.total_recipients ?? 0,
                          sent: d.sent_count ?? 0,
                          delivered: d.delivered_count ?? 0,
                          failed: d.failed_count ?? 0,
                        },
                        new Date(),
                      )
                    : null;
                let snapshot: SimSnapshot | null = null;
                if (!perSnap && i === 0 && simulation && simulation.mode !== "real") {
                  snapshot = computeSimulationSnapshot(
                    simulation,
                    {
                      sent: d.sent_count ?? 0,
                      delivered: d.delivered_count ?? 0,
                      failed: d.failed_count ?? 0,
                      total: d.total_recipients ?? 0,
                      status: d.status,
                      clicks: data.clicks.length,
                    },
                    new Date(),
                  );
                }
                return (
                  <DispatchCard
                    key={d.id}
                    d={d}
                    snapshot={snapshot}
                    perSnapshot={perSnap}
                    overrides={!perSnap && i === 0 ? {
                      sent: overrides.sent ?? undefined,
                      delivered: overrides.delivered ?? undefined,
                      failed: overrides.failed ?? undefined,
                    } : undefined}
                  />
                );
              })}
            </div>
          </section>

        )}

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Cliques totais" value={stats.total} />
          <StatCard label="Países" value={stats.countries.length} />
          <StatCard label="Cidades" value={stats.cities.length} />
          <StatCard label="Dispositivos" value={stats.devices.length} />
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
            <CardDescription>Soma de cliques agrupada por hora.</CardDescription>
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
                    <Bar
                      dataKey="count"
                      fill="hsl(var(--primary, 222 47% 11%))"
                      radius={[4, 4, 0, 0]}
                    />
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

        {dispatches.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Histórico de disparos</CardTitle>
              <CardDescription>
                Amostra dos 100 destinatários mais recentes por disparo (parcialmente ocultados por privacidade).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {dispatches.map((d) => {
                const recs = data.recipientsByDispatch?.[d.id] ?? [];
                const dispatchOv = publicDispatches.find(
                  (x: any) => x.wa_campaign_id === d.id,
                );
                const dispatchMap =
                  customEnabled && dispatchOv?.enabled
                    ? (dispatchOv?.status_map as Record<string, string | null> | undefined)
                    : undefined;
                const globalMap = customEnabled
                  ? (publicSettings?.status_map as Record<string, string | null> | undefined)
                  : undefined;
                const remap = (s: string | null) =>
                  applyStatusMap(s, dispatchMap, globalMap);
                return (
                  <div key={d.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">{d.name || "Disparo sem nome"}</div>
                      <div className="text-xs text-muted-foreground">
                        {recs.length.toLocaleString("pt-BR")} destinatário(s)
                      </div>
                    </div>
                    {recs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sem destinatários registrados ainda.</p>
                    ) : (
                      <div className="max-h-72 overflow-auto rounded-md border">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-muted/50 text-xs text-muted-foreground">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium">Número</th>
                              <th className="px-3 py-2 text-left font-medium">Status</th>
                              <th className="px-3 py-2 text-left font-medium">Enviado em</th>
                            </tr>
                          </thead>
                          <tbody>
                            {recs.map((r, i) => (
                              <tr key={i} className="border-t">
                                <td className="px-3 py-1.5 font-mono text-xs">{r.phone}</td>
                                <td className="px-3 py-1.5 text-xs">{recipientStatusLabel(remap(r.status))}</td>
                                <td className="px-3 py-1.5 text-xs text-muted-foreground">
                                  {r.sent_at ? new Date(r.sent_at).toLocaleString("pt-BR") : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Histórico de acessos</CardTitle>
            <CardDescription>
              Últimos acessos registrados na página pública.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.clicks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum acesso registrado ainda.</p>
            ) : (
              <div className="max-h-96 overflow-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Data/Hora</th>
                      <th className="px-3 py-2 text-left font-medium">Local</th>
                      <th className="px-3 py-2 text-left font-medium">Dispositivo</th>
                      <th className="px-3 py-2 text-left font-medium">Navegador</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.clicks.slice(0, 500).map((c) => (
                      <tr key={c.id as string} className="border-t">
                        <td className="px-3 py-1.5 text-xs">
                          {new Date(c.clicked_at as string).toLocaleString("pt-BR")}
                        </td>
                        <td className="px-3 py-1.5 text-xs">
                          {[c.city, c.region, c.country].filter(Boolean).join(", ") || "—"}
                        </td>
                        <td className="px-3 py-1.5 text-xs">
                          {[c.device_type, c.os].filter(Boolean).join(" · ") || "—"}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">
                          {(c.browser as string) || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.clicks.length > 500 && (
                  <div className="border-t bg-muted/30 px-3 py-1.5 text-center text-xs text-muted-foreground">
                    Mostrando os 500 mais recentes de {data.clicks.length.toLocaleString("pt-BR")}.
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <footer className="pt-6 text-center text-xs text-muted-foreground">
          Relatório somente para visualização.
        </footer>
      </main>
    </div>
  );
}

function recipientStatusLabel(status: string | null): string {
  switch (status) {
    case "pending": return "Pendente";
    case "processing": return "Processando";
    case "accepted": return "Aceito";
    case "sent": return "Enviado";
    case "delivered": return "Entregue";
    case "read": return "Lido";
    case "replied": return "Respondido";
    case "failed": return "Falhou";
    case "opt_out": return "Opt-out";
    case "cancelled": return "Cancelado";
    case "skipped": return "Ignorado";
    default: return status ?? "—";
  }
}

type Dispatch = {
  id: string;
  name: string | null;
  status: string | null;
  scheduled_at: string | null;
  total_recipients: number | null;
  sent_count: number | null;
  delivered_count: number | null;
  read_count: number | null;
  replied_count: number | null;
  failed_count: number | null;
  progress: unknown;
};

function DispatchCard({
  d,
  overrides,
  snapshot,
  perSnapshot,
}: {
  d: Dispatch;
  overrides?: { sent?: number; delivered?: number; failed?: number };
  snapshot?: SimSnapshot | null;
  perSnapshot?: Snapshot | null;
}) {
  // Prioridade: perSnapshot (novas tabelas por-disparo) > snapshot (simulação antiga) > overrides > real.
  const displayName = perSnapshot?.name ?? d.name;
  const total = perSnapshot?.total ?? snapshot?.total ?? d.total_recipients ?? 0;
  const realDelivered = d.delivered_count ?? 0;
  const delivered = perSnapshot?.delivered ?? snapshot?.delivered ?? overrides?.delivered ?? realDelivered;
  const sent = perSnapshot?.sent ?? snapshot?.sent ?? overrides?.sent ?? delivered;
  const failed = perSnapshot?.failed ?? snapshot?.failed ?? overrides?.failed ?? (d.failed_count ?? 0);
  const percent = perSnapshot
    ? perSnapshot.percent
    : snapshot
      ? snapshot.percent
      : total > 0
        ? Math.min(100, Math.round((sent / Math.max(total, sent)) * 100))
        : sent > 0
          ? 100
          : 0;

  const statusLabel = perSnapshot?.status ?? snapshot?.status_label ?? (() => {
    switch (d.status) {
      case "running": return "Em execução";
      case "scheduled": return "Agendada";
      case "completed": return "Concluída";
      case "paused": return "Pausada";
      case "failed": return "Falhou";
      case "cancelled": return "Cancelada";
      case "draft": return "Rascunho";
      default: return d.status ?? "—";
    }
  })();

  const etaSource = perSnapshot?.eta_at ?? snapshot?.eta_at ?? null;
  const etaText = etaSource
    ? new Date(etaSource).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{displayName || "Disparo sem nome"}</CardTitle>
          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
            {statusLabel}
          </span>
        </div>
        {d.scheduled_at && (
          <CardDescription>
            Agendado para {new Date(d.scheduled_at).toLocaleString("pt-BR")}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MiniStat icon={<Users className="h-3.5 w-3.5" />} label="Contatos" value={total} />
          <MiniStat icon={<Send className="h-3.5 w-3.5" />} label="Enviados" value={sent} />
          <MiniStat icon={<CheckCheck className="h-3.5 w-3.5" />} label="Entregues" value={delivered} />
          <MiniStat icon={<XCircle className="h-3.5 w-3.5" />} label="Falhas" value={failed} />
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progresso de envio</span>
            <span>
              {Math.round(percent)}%{etaText ? ` · previsão ${etaText}` : ""}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card/50 p-2">
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold">{value.toLocaleString("pt-BR")}</div>
    </div>
  );
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

function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; count: number }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">Sem dados.</p>
        )}
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
