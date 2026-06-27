import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listActivity } from "@/lib/settings.functions";
import { listWaCampaigns } from "@/lib/wa-campaigns.functions";
import { listCampaigns } from "@/lib/campaigns.functions";
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
  const { data: activity = [], isLoading: lA } = useQuery({ queryKey: ["activity"], queryFn: () => activityFn() });
  const { data: wa = [], isLoading: lW } = useQuery({ queryKey: ["wa-campaigns"], queryFn: () => waFn() });
  const { data: link = [], isLoading: lL } = useQuery({ queryKey: ["campaigns"], queryFn: () => linkFn() });

  const [partFilter, setPartFilter] = useState<Participant[]>([]);
  const waFiltered = wa.filter((r: any) => matchesParticipants(r, partFilter));
  const linkFiltered = link.filter((r: any) => matchesParticipants(r, partFilter));

  return (
    <>
      <PageHeader title="Histórico" description="Auditoria de operações e disparos." />

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

        <TabsContent value="disparos" className="pt-4">
          <div className="rounded-xl border bg-card">
            {lW ? <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
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

        <TabsContent value="links" className="pt-4">
          <div className="rounded-xl border bg-card">
            {lL ? <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
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

        <TabsContent value="auditoria" className="pt-4">
          <div className="rounded-xl border bg-card">
            {lA ? <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
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
