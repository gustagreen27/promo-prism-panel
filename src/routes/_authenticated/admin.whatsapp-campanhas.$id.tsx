import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { campaignReport, getWaCampaign } from "@/lib/wa-campaigns.functions";

export const Route = createFileRoute("/_authenticated/admin/whatsapp-campanhas/$id")({
  head: () => ({ meta: [{ title: "Relatório da Campanha" }] }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const reportFn = useServerFn(campaignReport);
  const getFn = useServerFn(getWaCampaign);
  const { data: camp } = useQuery({ queryKey: ["wa-camp", id], queryFn: () => getFn({ data: { id } }) });
  const { data: report } = useQuery({
    queryKey: ["wa-camp-report", id],
    queryFn: () => reportFn({ data: { id } }),
    refetchInterval: 5000,
  });

  const counts = report?.counts ?? {};
  const total = report?.total ?? 0;
  const sent = (counts.sent ?? 0) + (counts.delivered ?? 0) + (counts.read ?? 0) + (counts.replied ?? 0);
  const delivered = (counts.delivered ?? 0) + (counts.read ?? 0) + (counts.replied ?? 0);
  const read = (counts.read ?? 0) + (counts.replied ?? 0);
  const failed = counts.failed ?? 0;

  return (
    <>
      <PageHeader
        title={camp?.name ?? "Campanha"}
        description={`Status: ${camp?.status ?? "—"}`}
        actions={<Button asChild variant="outline"><Link to="/admin/whatsapp-campanhas"><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Link></Button>}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card label="Total" value={total} />
        <Card label="Enviadas" value={sent} />
        <Card label="Entregues" value={delivered} />
        <Card label="Lidas" value={read} />
        <Card label="Falhas" value={failed} />
      </div>
      <div className="mt-4 rounded-xl border bg-card p-4">
        <div className="mb-2 text-sm font-medium">Distribuição por status</div>
        <div className="space-y-1">
          {Object.entries(counts).map(([k, v]: [string, any]) => (
            <div key={k} className="flex items-center gap-2 text-sm">
              <Badge variant="outline" className="w-28 justify-center">{k}</Badge>
              <div className="flex-1 bg-muted h-2 rounded overflow-hidden"><div className="h-full bg-primary" style={{ width: `${total ? (v / total) * 100 : 0}%` }} /></div>
              <div className="w-12 text-right text-xs">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Card({ label, value }: any) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
