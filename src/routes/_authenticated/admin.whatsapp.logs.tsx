import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { listWebhookLogs } from "@/lib/inbox.functions";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/whatsapp/logs")({
  head: () => ({ meta: [{ title: "Logs WhatsApp" }] }),
  component: Page,
});

function Page() {
  const fn = useServerFn(listWebhookLogs);
  const { data: rows = [], isLoading } = useQuery({ queryKey: ["wa-logs"], queryFn: () => fn() });
  return (
    <>
      <PageHeader title="Logs de Webhook" description="Eventos recebidos da Meta." />
      <div className="rounded-xl border bg-card">
        {isLoading ? <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
        : rows.length === 0 ? <EmptyState title="Nenhum evento recebido" />
        : <Table>
          <TableHeader><TableRow>
            <TableHead>Data</TableHead><TableHead>Evento</TableHead><TableHead>Processado</TableHead><TableHead>Erro</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs">{formatDate(r.created_at)}</TableCell>
                <TableCell><Badge variant="outline">{r.event_type ?? "—"}</Badge></TableCell>
                <TableCell>{r.processed ? "✓" : "—"}</TableCell>
                <TableCell className="text-xs text-destructive">{r.error ?? ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>}
      </div>
    </>
  );
}
