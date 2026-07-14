import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MousePointerClick, Users, Globe2, Smartphone, Activity, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getCampaignRealtimeAnalytics } from "@/lib/analytics.functions";

const COLORS = ["hsl(var(--primary))", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#6366F1"];

function Kpi({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function Donut({ title, data }: { title: string; data: { key: string; count: number }[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent>
        {total === 0 ? (
          <div className="grid h-[180px] place-items-center text-xs text-muted-foreground">Sem dados</div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={data} dataKey="count" nameKey="key" innerRadius={45} outerRadius={70} paddingAngle={2}>
                {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function CampaignAnalytics({ campaignId, hours = 24 }: { campaignId: string; hours?: number }) {
  const qc = useQueryClient();
  const fn = useServerFn(getCampaignRealtimeAnalytics);

  const { data, isLoading } = useQuery({
    queryKey: ["campaign-analytics", campaignId, hours],
    queryFn: () => fn({ data: { campaign_id: campaignId, hours } }),
    refetchInterval: 15_000,
  });

  // Realtime — refetch on new clicks
  useEffect(() => {
    const channel = supabase
      .channel(`clicks:${campaignId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "campaign_clicks", filter: `campaign_id=eq.${campaignId}` },
        () => qc.invalidateQueries({ queryKey: ["campaign-analytics", campaignId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [campaignId, qc]);

  if (isLoading || !data) {
    return <div className="grid grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) =>
      <Card key={i}><CardContent className="p-4"><div className="h-16 animate-pulse rounded bg-muted" /></CardContent></Card>)}
    </div>;
  }

  const t = data.totals;
  return (
    <div className="space-y-4 print-root">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Activity className="h-4 w-4 text-primary animate-pulse" />
          Métricas em tempo real
          <Badge variant="outline" className="text-[10px]">últimas {hours}h</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">
            Coleta: {t.collection_rate}%
          </Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.print()}
            className="no-print h-7 gap-1.5 text-xs"
          >
            <Printer className="h-3.5 w-3.5" />
            Imprimir
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={MousePointerClick} label="Cliques" value={t.clicks} sub={`${t.unique} únicos`} />
        <Kpi icon={Users} label="Únicos" value={t.unique} sub={t.clicks ? `${Math.round((t.unique / t.clicks) * 100)}% do total` : "—"} />
        <Kpi icon={Globe2} label="Países" value={t.countries} sub={`${data.by_country.length} distintos`} />
        <Kpi icon={Smartphone} label="Dispositivos" value={t.devices} sub={data.by_device[0]?.key ?? "—"} />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Cliques por hora</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data.timeline} margin={{ left: -20, right: 8, top: 4, bottom: 0 }}>
              <XAxis dataKey="hour" fontSize={10} tickMargin={4} />
              <YAxis fontSize={10} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="clicks" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <Donut title="País" data={data.by_country} />
        <Donut title="Dispositivo" data={data.by_device} />
        <Donut title="Navegador" data={data.by_browser} />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Top cidades</CardTitle></CardHeader>
        <CardContent>
          {data.by_city.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">Sem dados</div>
          ) : (
            <ul className="space-y-1.5">
              {data.by_city.map((c: any, i: number) => {
                const max = data.by_city[0].count;
                const pct = (c.count / max) * 100;
                return (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <span className="w-32 truncate text-muted-foreground">{c.key}</span>
                    <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-10 text-right tabular-nums text-xs font-medium">{c.count}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
