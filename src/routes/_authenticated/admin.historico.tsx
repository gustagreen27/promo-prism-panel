import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { FINANCEIRO_TABS } from "@/components/admin/hub-tabs";
import { EmptyState } from "@/components/admin/empty-state";
import { ErrorCard } from "@/components/admin/query-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listActivity } from "@/lib/settings.functions";
import { listWaCampaigns } from "@/lib/wa-campaigns.functions";
import { listCampaigns } from "@/lib/campaigns.functions";
import { toCSV, downloadCSV, participantsLabel } from "@/lib/csv";
import {
  ParticipantsBadges,
  ParticipantsFilter,
  matchesParticipants,
  type Participant,
} from "@/components/participants";

export const Route = createFileRoute("/_authenticated/admin/historico")({
  head: () => ({ meta: [{ title: "Histórico — Painel" }] }),
  component: Page,
});

function Page() {
  const activityFn = useServerFn(listActivity);
  const waFn = useServerFn(listWaCampaigns);
  const linkFn = useServerFn(listCampaigns);
  const activityQ = useQuery({ queryKey: ["activity"], queryFn: () => activityFn() });
  const { data: activity = [], isLoading: lA, error: eA } = activityQ;
  const waQ = useQuery({ queryKey: ["wa-campaigns"], queryFn: () => waFn() });
  const { data: wa = [], isLoading: lW, error: eW } = waQ;
  const linkQ = useQuery({ queryKey: ["campaigns"], queryFn: () => linkFn() });
  const { data: link = [], isLoading: lL, error: eL } = linkQ;

  const [partFilter, setPartFilter] = useState<Participant[]>([]);
  const waFiltered = wa.filter((r: any) => matchesParticipants(r, partFilter));
  const linkFiltered = link.filter((r: any) => matchesParticipants(r, partFilter));

  const suffix = partFilter.length === 0 ? "todos" : partFilter.join("-");
  const exportWa = () => {
    const csv = toCSV(waFiltered, [
      { key: "created_at", label: "Data", get: (r) => new Date(r.created_at).toLocaleString("pt-BR") },
      { key: "name", label: "Nome" },
      { key: "participants", label: "Sócios", get: (r) => participantsLabel(r.participants) },
      { key: "client", label: "Cliente", get: (r) => r.client?.name ?? "" },
      { key: "sent_count", label: "Enviadas" },
      { key: "delivered_count", label: "Entregues" },
      { key: "read_count", label: "Lidas" },
      { key: "status", label: "Status" },
    ]);
    downloadCSV(`disparos-whatsapp-${suffix}.csv`, csv);
  };
  const exportLinks = () => {
    const csv = toCSV(linkFiltered, [
      { key: "created_at", label: "Data", get: (r) => new Date(r.created_at).toLocaleString("pt-BR") },
      { key: "name", label: "Nome" },
      { key: "participants", label: "Sócios", get: (r) => participantsLabel(r.participants) },
      { key: "slug", label: "Slug" },
      { key: "total_clicks", label: "Cliques", get: (r) => r.total_clicks ?? 0 },
      { key: "status", label: "Status" },
    ]);
    downloadCSV(`campanhas-link-${suffix}.csv`, csv);
  };
  const exportAudit = () => {
    const csv = toCSV(activity, [
      { key: "created_at", label: "Data", get: (r: any) => new Date(r.created_at).toLocaleString("pt-BR") },
      { key: "module", label: "Módulo" },
      { key: "action", label: "Ação" },
      { key: "description", label: "Descrição" },
      { key: "ip_address", label: "IP" },
    ]);
    downloadCSV(`auditoria.csv`, csv);
  };

  return (
    <>
      <PageHeader tabs={FINANCEIRO_TABS} title="Histórico" description="Auditoria de operações e disparos." />

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Filtrar por sócio:</span>
        <div className="w-56"><ParticipantsFilter value={partFilter} onChange={setPartFilter} /></div>
        {partFilter.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setPartFilter([])}>Limpar</Button>
        )}
      </div>

      <Tabs defaultValue="disparos">
        <TabsList>
          <TabsTrigger value="disparos">Disparos WhatsApp</TabsTrigger>
          <TabsTrigger value="links">Campanhas de link</TabsTrigger>
          <TabsTrigger value="auditoria">Auditoria do painel</TabsTrigger>
        </TabsList>

        <TabsContent value="disparos" className="pt-4 space-y-2">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={exportWa} disabled={waFiltered.length === 0}>
              <Download className="mr-2 h-4 w-4" />Exportar CSV
            </Button>
          </div>
          <div className="rounded-xl border bg-card">
            {lW ? <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
              : eW ? <div className="p-4"><ErrorCard error={eW} onRetry={() => waQ.refetch()} /></div>
              : waFiltered.length === 0 ? <EmptyState title="Sem disparos" />
              : <Table>
                  <TableHeader><TableRow>
                    <TableHead>Data</TableHead><TableHead>Nome</TableHead>
                    <TableHead>Sócios</TableHead><TableHead>Cliente</TableHead>
                    <TableHead>Enviadas</TableHead><TableHead>Entregues</TableHead>
                    <TableHead>Lidas</TableHead><TableHead>Status</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {waFiltered.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell><ParticipantsBadges value={r.participants} /></TableCell>
                        <TableCell>{r.client?.name ?? "—"}</TableCell>
                        <TableCell>{r.sent_count}</TableCell>
                        <TableCell>{r.delivered_count}</TableCell>
                        <TableCell>{r.read_count}</TableCell>
                        <TableCell><Badge variant="secondary">{r.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>}
          </div>
        </TabsContent>


        <TabsContent value="links" className="pt-4 space-y-2">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={exportLinks} disabled={linkFiltered.length === 0}>
              <Download className="mr-2 h-4 w-4" />Exportar CSV
            </Button>
          </div>
          <div className="rounded-xl border bg-card">
            {lL ? <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
              : eL ? <div className="p-4"><ErrorCard error={eL} onRetry={() => linkQ.refetch()} /></div>
              : linkFiltered.length === 0 ? <EmptyState title="Sem campanhas" />
              : <Table>
                  <TableHeader><TableRow>
                    <TableHead>Data</TableHead><TableHead>Nome</TableHead>
                    <TableHead>Sócios</TableHead><TableHead>Slug</TableHead>
                    <TableHead>Cliques</TableHead><TableHead>Status</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {linkFiltered.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell><ParticipantsBadges value={r.participants} /></TableCell>
                        <TableCell><code className="text-xs">/{r.slug}</code></TableCell>
                        <TableCell>{r.total_clicks ?? 0}</TableCell>
                        <TableCell><Badge variant="secondary">{r.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>}
          </div>
        </TabsContent>

        <TabsContent value="auditoria" className="pt-4 space-y-2">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={exportAudit} disabled={activity.length === 0}>
              <Download className="mr-2 h-4 w-4" />Exportar CSV
            </Button>
          </div>
          <div className="rounded-xl border bg-card">
            {lA ? <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
              : eA ? <div className="p-4"><ErrorCard error={eA} onRetry={() => activityQ.refetch()} /></div>
              : activity.length === 0 ? <EmptyState title="Sem registros" />
              : <Table>
                  <TableHeader><TableRow>
                    <TableHead>Data</TableHead><TableHead>Módulo</TableHead>
                    <TableHead>Ação</TableHead><TableHead>Descrição</TableHead><TableHead>IP</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {activity.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell>{new Date(r.created_at).toLocaleString("pt-BR")}</TableCell>
                        <TableCell><Badge variant="outline">{r.module}</Badge></TableCell>
                        <TableCell>{r.action}</TableCell>
                        <TableCell className="max-w-md truncate">{r.description ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{r.ip_address ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>}
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
