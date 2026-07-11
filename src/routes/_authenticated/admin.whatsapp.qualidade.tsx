import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorCard } from "@/components/admin/query-state";
import { EmptyState } from "@/components/admin/empty-state";
import { listNumbers } from "@/lib/whatsapp-numbers.functions";

export const Route = createFileRoute("/_authenticated/admin/whatsapp/qualidade")({
  head: () => ({ meta: [{ title: "Qualidade & Limites" }] }),
  component: Page,
});

const COLORS: Record<string, string> = { GREEN: "bg-green-500", YELLOW: "bg-yellow-500", RED: "bg-red-500" };

function Page() {
  const fn = useServerFn(listNumbers);
  const { data: rows, isLoading, error, refetch } = useQuery({ queryKey: ["wa-numbers"], queryFn: () => fn() });
  return (
    <>
      <PageHeader title="Qualidade & Limites" description="Acompanhe a saúde dos números." />
      <div className="rounded-xl border bg-card">
        {isLoading ? <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
        : error ? <div className="p-4"><ErrorCard error={error} onRetry={() => refetch()} /></div>
        : !rows || rows.length === 0 ? <EmptyState title="Nenhum número cadastrado" />
        : <Table>
          <TableHeader><TableRow>
            <TableHead>Número</TableHead><TableHead>Telefone</TableHead><TableHead>Qualidade</TableHead>
            <TableHead>Limite diário</TableHead><TableHead>Status</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="font-mono text-xs">{r.display_phone ?? r.phone ?? "—"}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-2">
                    <span className={`inline-block h-2 w-2 rounded-full ${COLORS[r.quality_rating] ?? "bg-gray-300"}`} />
                    {r.quality_rating ?? "—"}
                  </span>
                </TableCell>
                <TableCell>{r.daily_limit ?? "—"}</TableCell>
                <TableCell><Badge variant={r.status === "ativa" ? "default" : "secondary"}>{r.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>}
      </div>
    </>
  );
}
