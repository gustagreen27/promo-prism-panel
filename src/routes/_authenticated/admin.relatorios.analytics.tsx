import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Legend,
} from "recharts";
import { ArrowLeft, Printer, BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { PeriodFilter } from "@/components/admin/period-filter";
import { ParticipantsFilter, matchesParticipants, type Participant } from "@/components/participants";
import { PERIOD_OPTIONS, getPeriodRange, type PeriodKey } from "@/lib/period";
import { fmtNum, fmtPct, formatBRDateTime } from "@/lib/report-utils";

type MetricType = "all" | "clicks" | "unique" | "ctr";

export const Route = createFileRoute("/_authenticated/admin/relatorios/analytics")({
  head: () => ({ meta: [{ title: "Analytics de campanhas — Painel" }] }),
  component: AnalyticsPage,
});

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

function AnalyticsPage() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PeriodKey>("last_30");
  const [campaignId, setCampaignId] = useState<string>("all");
  const [metric, setMetric] = useState<MetricType>("all");
  const [partFilter, setPartFilter] = useState<Participant[]>([]);

  const { start: from, end: to } = getPeriodRange(period);

  const { data: campaigns } = useQuery({
    queryKey: ["analytics-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id, name, slug, participants")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const allowedCampaignIds = useMemo(() => {
    if (partFilter.length === 0) return null;
    return new Set((campaigns ?? []).filter((c: any) => matchesParticipants(c, partFilter)).map((c) => c.id));
  }, [campaigns, partFilter]);

  const { data: clicks, isLoading } = useQuery({
    queryKey: ["analytics-clicks", period, campaignId, partFilter.join(",")],
    queryFn: async () => {
      let q = supabase
        .from("campaign_clicks")
        .select("id, campaign_id, clicked_at, ip, device_type, country")
        .gte("clicked_at", from.toISOString())
        .lte("clicked_at", to.toISOString())
        .order("clicked_at", { ascending: true })
        .limit(10000);
      if (campaignId !== "all") q = q.eq("campaign_id", campaignId);
      const { data, error } = await q;
      if (error) throw error;
      const list = data ?? [];
      return allowedCampaignIds ? list.filter((r) => allowedCampaignIds.has(r.campaign_id)) : list;
    },
  });

  const stats = useMemo(() => {
    const list = clicks ?? [];
    const total = list.length;
    const uniqueIps = new Set(list.map((c) => c.ip).filter(Boolean)).size;
    const ctr = total > 0 ? (uniqueIps / total) * 100 : 0;

    // Series por dia
    const byDay = new Map<string, { date: string; clicks: number; unique: Set<string> }>();
    for (const c of list) {
      const k = dayKey(c.clicked_at);
      if (!byDay.has(k)) byDay.set(k, { date: k, clicks: 0, unique: new Set() });
      const row = byDay.get(k)!;
      row.clicks += 1;
      if (c.ip) row.unique.add(c.ip);
    }
    const series = Array.from(byDay.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({
        date: r.date.slice(5),
        clicks: r.clicks,
        unique: r.unique.size,
        ctr: r.clicks > 0 ? Math.round((r.unique.size / r.clicks) * 1000) / 10 : 0,
      }));

    // Top campanhas
    const byCamp = new Map<string, number>();
    for (const c of list) byCamp.set(c.campaign_id, (byCamp.get(c.campaign_id) ?? 0) + 1);
    const nameOf = new Map((campaigns ?? []).map((c) => [c.id, c.name] as const));
    const top = Array.from(byCamp.entries())
      .map(([id, n]) => ({ name: nameOf.get(id) ?? id.slice(0, 6), clicks: n }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 8);

    return { total, uniqueIps, ctr, series, top };
  }, [clicks, campaigns]);

  const generatedAt = formatBRDateTime(new Date());
  const periodLabel = PERIOD_OPTIONS.find((o) => o.key === period)?.label ?? "";
  const campaignLabel =
    campaignId === "all"
      ? "Todas as campanhas"
      : campaigns?.find((c) => c.id === campaignId)?.name ?? "—";

  const showClicks = metric === "all" || metric === "clicks";
  const showUnique = metric === "all" || metric === "unique";
  const showCtr = metric === "all" || metric === "ctr";

  return (
    <div className="print-root space-y-4">
      <div className="no-print">
        <PageHeader
          title="Analytics de campanhas"
          description="Cliques, visitantes únicos, CTR e evolução por data."
          actions={
            <>
              <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/admin/relatorios" })}>
                <ArrowLeft className="size-4" /> Voltar
              </Button>
              <Button size="sm" onClick={() => window.print()}>
                <Printer className="size-4" /> Exportar PDF
              </Button>
            </>
          }
        />

        <Card className="p-4 mt-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">Período</Label>
              <PeriodFilter value={period} onChange={setPeriod} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Campanha</Label>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {campaigns?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Métrica</Label>
              <Select value={metric} onValueChange={(v) => setMetric(v as MetricType)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="clicks">Cliques</SelectItem>
                  <SelectItem value="unique">Únicos</SelectItem>
                  <SelectItem value="ctr">CTR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sócio responsável</Label>
              <ParticipantsFilter value={partFilter} onChange={setPartFilter} />
            </div>
          </div>
        </Card>
      </div>

      <div className="print-page bg-white text-foreground rounded-lg shadow-sm border overflow-hidden">
        <div className="px-6 pt-6 pb-3 flex items-end justify-between border-b-4 border-report-blue">
          <div>
            <div className="text-xl font-extrabold tracking-tight text-report-blue">Painel SaaS</div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground mt-2">
              Analytics de campanhas
            </p>
          </div>
          <div className="text-xs text-muted-foreground text-right">
            <div>Gerado em {generatedAt}</div>
            <div className="mt-0.5">{periodLabel} · {campaignLabel}</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-px bg-border">
          <Kpi label="Cliques totais" value={fmtNum(stats.total)} />
          <Kpi label="Visitantes únicos" value={fmtNum(stats.uniqueIps)} />
          <Kpi label="CTR (únicos / cliques)" value={fmtPct(stats.ctr)} />
        </div>

        <div className="px-6 py-5 space-y-6">
          {isLoading ? (
            <div className="text-muted-foreground text-sm">Carregando…</div>
          ) : stats.series.length === 0 ? (
            <div className="border rounded-lg p-10 text-center text-muted-foreground text-sm">
              <BarChart3 className="size-8 mx-auto mb-2 opacity-60" />
              Sem dados no período selecionado.
            </div>
          ) : (
            <>
              <section>
                <h3 className="text-sm font-bold uppercase tracking-wider text-report-blue mb-2">
                  Evolução por data
                </h3>
                <div className="w-full h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stats.series} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="date" stroke="#6b7280" fontSize={11} />
                      <YAxis stroke="#6b7280" fontSize={11} />
                      <RTooltip />
                      <Legend />
                      {showClicks && <Line type="monotone" dataKey="clicks" name="Cliques" stroke="#2563eb" strokeWidth={2} dot={false} />}
                      {showUnique && <Line type="monotone" dataKey="unique" name="Únicos" stroke="#16a34a" strokeWidth={2} dot={false} />}
                      {showCtr && <Line type="monotone" dataKey="ctr" name="CTR %" stroke="#f59e0b" strokeWidth={2} dot={false} />}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {campaignId === "all" && stats.top.length > 0 && (
                <section>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-report-blue mb-2">
                    Top campanhas por cliques
                  </h3>
                  <div className="w-full h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.top} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="name" stroke="#6b7280" fontSize={11} interval={0} angle={-15} textAnchor="end" height={60} />
                        <YAxis stroke="#6b7280" fontSize={11} />
                        <RTooltip />
                        <Bar dataKey="clicks" name="Cliques" fill="#2563eb" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              )}

              <section className="border-t pt-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-report-blue mb-2">
                  Resumo diário
                </h3>
                <div className="overflow-hidden border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-report-band-bg text-xs uppercase tracking-wider">
                      <tr>
                        <th className="text-left px-3 py-2">Data</th>
                        <th className="text-right px-3 py-2">Cliques</th>
                        <th className="text-right px-3 py-2">Únicos</th>
                        <th className="text-right px-3 py-2">CTR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.series.map((r) => (
                        <tr key={r.date} className="border-t">
                          <td className="px-3 py-2">{r.date}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtNum(r.clicks)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtNum(r.unique)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.ctr.toLocaleString("pt-BR")}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>
      </div>

      <div className="no-print text-center text-xs text-muted-foreground">
        <Link to="/admin/relatorios" className="underline">Voltar para relatórios de disparos</Link>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-4 py-4 text-center">
      <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-extrabold text-foreground">{value}</div>
    </div>
  );
}
