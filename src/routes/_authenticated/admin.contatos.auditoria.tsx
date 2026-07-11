import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download, ChevronDown, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { CLIENTES_TABS, HubTabs } from "@/components/admin/hub-tabs";
import { EmptyState } from "@/components/admin/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listImportJobs } from "@/lib/contact-lists.functions";

export const Route = createFileRoute("/_authenticated/admin/contatos/auditoria")({
  head: () => ({ meta: [{ title: "Auditoria de import de contatos" }] }),
  component: Page,
});

function Page() {
  const fn = useServerFn(listImportJobs);
  const { data: jobs = [], isLoading } = useQuery({ queryKey: ["import-jobs"], queryFn: () => fn() });
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const downloadInvalid = (job: any) => {
    const rows = job.report?.invalidRows ?? [];
    if (!rows.length) return;
    const csv = ["input,name,reason", ...rows.map((r: any) => `"${(r.input ?? "").replace(/"/g, '""')}","${(r.name ?? "").toString().replace(/"/g, '""')}","${r.reason}"`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `invalidos-${job.id}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader title="Auditoria de import" description="Histórico dos últimos 100 imports/upserts de contatos, com detalhes de falha." />
      <HubTabs tabs={CLIENTES_TABS} />
      <div className="rounded-xl border bg-card">
        {isLoading ? <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
        : jobs.length === 0 ? <EmptyState title="Nenhum import registrado" description="Ao importar leads em uma lista, o job aparecerá aqui." />
        : <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-6" />
                <TableHead>Quando</TableHead>
                <TableHead>Arquivo/origem</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Recebidas</TableHead>
                <TableHead className="text-right">Válidas</TableHead>
                <TableHead className="text-right">Duplicadas</TableHead>
                <TableHead className="text-right">Inválidas</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((j: any) => (
                <>
                  <TableRow key={j.id}>
                    <TableCell>
                      <button onClick={() => setOpen((s) => ({ ...s, [j.id]: !s[j.id] }))}>
                        {open[j.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </TableCell>
                    <TableCell className="text-xs">{new Date(j.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-sm">{j.filename ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={j.status === "completed" ? "default" : j.status === "failed" ? "destructive" : "secondary"}>{j.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">{j.total}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{j.valid}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{j.duplicated}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-amber-600">{j.invalid}</TableCell>
                    <TableCell className="text-right">
                      {j.invalid > 0 && (
                        <Button size="sm" variant="ghost" onClick={() => downloadInvalid(j)}>
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                  {open[j.id] && (
                    <TableRow key={`${j.id}-detail`} className="bg-muted/30">
                      <TableCell colSpan={9}>
                        <div className="space-y-2 text-xs">
                          {j.report?.error && (
                            <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-destructive">
                              <b>Erro:</b> {j.report.error}
                            </div>
                          )}
                          {j.report?.stats && (
                            <div className="grid grid-cols-4 gap-2">
                              {Object.entries(j.report.stats).map(([k, v]) => (
                                <div key={k} className="rounded border bg-card p-2">
                                  <div className="text-muted-foreground">{k}</div>
                                  <div className="font-mono">{String(v)}</div>
                                </div>
                              ))}
                            </div>
                          )}
                          {(j.report?.invalidRows ?? []).length > 0 && (
                            <div className="max-h-40 overflow-auto rounded border bg-card p-2">
                              {j.report.invalidRows.slice(0, 100).map((r: any, i: number) => (
                                <div key={i} className="flex justify-between gap-2 py-0.5">
                                  <span className="font-mono truncate">{r.input || "(vazio)"}</span>
                                  <span className="text-muted-foreground">{r.reason}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
            </TableBody>
          </Table>}
      </div>
    </>
  );
}
