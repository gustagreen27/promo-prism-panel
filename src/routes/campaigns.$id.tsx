import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { getPublicCampaignReport } from "@/lib/campaigns.functions";
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
import { Printer } from "lucide-react";

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
  const { data, isLoading, error } = useQuery({
    queryKey: ["public-campaign-report", id],
    queryFn: () => fn({ data: { id } }),
    retry: false,
  });

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
      countries: top("country"),
      cities: top("city"),
      devices: top("device_type"),
      browsers: top("browser"),
      series,
      hourly,
    };
  }, [data]);

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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card no-print">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="text-sm font-medium text-muted-foreground">
            Relatório da campanha
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
          <p className="hidden print:block text-xs text-muted-foreground">
            Relatório gerado em {new Date().toLocaleString("pt-BR")}
          </p>
        </div>

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

        <footer className="pt-6 text-center text-xs text-muted-foreground">
          Relatório somente para visualização.
        </footer>
      </main>
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
