import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { searchCampaignHistory } from "@/lib/wa-schedule.functions";

export const Route = createFileRoute("/painel/campanhas/historico")({
  head: () => ({ meta: [{ title: "Histórico — Disparos FR" }] }),
  component: Page,
});

const STATUSES = ["draft", "scheduled", "running", "paused", "completed", "cancelled", "error", "partial"];

function Page() {
  const { workspaceId } = Route.useRouteContext() as { workspaceId: string };
  const searchFn = useServerFn(searchCampaignHistory);
  const [filters, setFilters] = useState<{ from?: string; to?: string; status?: string; query?: string }>({});

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ["history", workspaceId, filters],
    queryFn: () => searchFn({ data: {
      workspace_id: workspaceId,
      from: filters.from ? new Date(filters.from).toISOString() : null,
      to: filters.to ? new Date(filters.to).toISOString() : null,
      status: filters.status || null,
      query: filters.query || null,
    } }),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Histórico de campanhas</h1>
        <p className="text-sm text-muted-foreground">Filtre e consulte todo o histórico de disparos do workspace.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-5">
          <div><Label>Nome</Label><Input value={filters.query ?? ""} onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))} placeholder="Buscar…" /></div>
          <div><Label>De</Label><Input type="date" value={filters.from ?? ""} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} /></div>
          <div><Label>Até</Label><Input type="date" value={filters.to ?? ""} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} /></div>
          <div>
            <Label>Status</Label>
            <select className="w-full rounded border px-3 py-2 text-sm" value={filters.status ?? ""} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value || undefined }))}>
              <option value="">— todos —</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex items-end"><Button onClick={() => refetch()} className="w-full">Filtrar</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
            : rows.length === 0 ? <div className="p-6 text-sm text-muted-foreground">Nenhum registro.</div>
            : <Table>
                <TableHeader><TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Agendada</TableHead>
                  <TableHead>Iniciada</TableHead>
                  <TableHead>Concluída</TableHead>
                  <TableHead>Número</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Criado por</TableHead>
                  <TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {rows.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                      <TableCell>{r.scheduled_at ? new Date(r.scheduled_at).toLocaleString("pt-BR") : "—"}</TableCell>
                      <TableCell>{r.started_at ? new Date(r.started_at).toLocaleString("pt-BR") : "—"}</TableCell>
                      <TableCell>{r.finished_at ? new Date(r.finished_at).toLocaleString("pt-BR") : "—"}</TableCell>
                      <TableCell>{r.connection?.display_name ?? r.connection?.display_phone ?? "—"}</TableCell>
                      <TableCell>{r.template?.name ?? "—"}</TableCell>
                      <TableCell>{r.total_recipients ?? 0}</TableCell>
                      <TableCell>{r.author?.full_name ?? r.author?.email ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="ghost"><Link to="/painel/agenda">Agenda</Link></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>}
        </CardContent>
      </Card>
    </div>
  );
}
