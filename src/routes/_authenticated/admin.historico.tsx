import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { listActivity } from "@/lib/settings.functions";

export const Route = createFileRoute("/_authenticated/admin/historico")({
  head: () => ({ meta: [{ title: "Histórico — Painel" }] }),
  component: Page,
});

function Page() {
  const list = useServerFn(listActivity);
  const { data = [], isLoading } = useQuery({ queryKey: ["activity"], queryFn: () => list() });
  return (
    <>
      <PageHeader title="Histórico" description="Auditoria das operações do painel." />
      <div className="rounded-xl border bg-card">
        {isLoading ? <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
          : data.length === 0 ? <EmptyState title="Sem registros" />
          : <Table>
            <TableHeader><TableRow>
              <TableHead>Data</TableHead><TableHead>Módulo</TableHead>
              <TableHead>Ação</TableHead><TableHead>Descrição</TableHead><TableHead>IP</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.map((r: any) => (
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
    </>
  );
}
