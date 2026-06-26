import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { getCampaignAnalytics } from "@/lib/campaigns.functions";
import { Button } from "@/components/ui/button";
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
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/campaigns/$id")({
  head: () => ({ meta: [{ title: "Métricas da campanha" }] }),
  component: CampaignDetail,
});

function CampaignDetail() {
  const { id } = Route.useParams();
  const fn = useServerFn(getCampaignAnalytics);
  const { data, isLoading } = useQuery({
    queryKey: ["campaign-analytics", id],
    queryFn: () => fn({ data: { id } }),
  });

  const stats = useMemo(() => {
    if (!data) return null;
    const clicks = data.clicks;
    const uniqueIps = new Set(clicks.map((c) => c.ip).filter(Boolean)).size;
    const byDay: Record<string, number> = {};
    for (const c of clicks) {
      const d = new Date(c.clicked_at as string);
      const key = d.toISOString().slice(0, 10);
      byDay[key] = (byDay[key] ?? 0) + 1;
    }
    const series = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));
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
      countries: top("country"),
      cities: top("city"),
      devices: top("device_type"),
      browsers: top("browser"),
    };
  }, [data]);

  if (isLoading || !data || !stats) {
    return <p className="text-sm text-muted-foreground">Carregando métricas...</p>;
  }

  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/${data.campaign.slug}`
      : `/${data.campaign.slug}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">
              <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">{data.campaign.name}</h1>
          <p className="text-sm text-muted-foreground break-all">
            <a href={`/${data.campaign.slug}`} target="_blank" rel="noreferrer" className="hover:underline">
              {publicUrl}
            </a>{" "}
            →{" "}
            <a href={data.campaign.destination_url} target="_blank" rel="noreferrer" className="hover:underline">
              {data.campaign.destination_url}
            </a>
          </p>
        </div>
      </div>

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

      <div className="grid gap-4 md:grid-cols-2">
        <Breakdown title="Países" rows={stats.countries} />
        <Breakdown title="Cidades" rows={stats.cities} />
        <Breakdown title="Dispositivos" rows={stats.devices} />
        <Breakdown title="Navegadores" rows={stats.browsers} />
      </div>

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
                <TableHead>Provedor</TableHead>
                <TableHead>Dispositivo</TableHead>
                <TableHead>Navegador</TableHead>
                <TableHead>Origem</TableHead>
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
                  <TableCell className="max-w-[200px] truncate">{c.isp ?? "—"}</TableCell>
                  <TableCell>
                    {(c.device_type ?? "—") + (c.os ? ` · ${c.os}` : "")}
                  </TableCell>
                  <TableCell>
                    {(c.browser ?? "—") + (c.browser_version ? ` ${c.browser_version}` : "")}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">{c.referer ?? "direto"}</TableCell>
                </TableRow>
              ))}
              {data.clicks.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
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
