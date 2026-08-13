import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { campaignFailureReasons, listFailedRecipients } from "@/lib/wa-failures.functions";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";

export function FailureReasonsCard({ campaignId }: { campaignId: string }) {
  const getReasons = useServerFn(campaignFailureReasons);
  const getRows = useServerFn(listFailedRecipients);
  const [open, setOpen] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const q = useQuery({
    queryKey: ["wa-failure-reasons", campaignId],
    queryFn: () => getReasons({ data: { campaign_id: campaignId } }),
    refetchInterval: 30000,
  });

  const rowsQ = useQuery({
    queryKey: ["wa-failed-recipients", campaignId, open, page],
    queryFn: () => getRows({ data: { campaign_id: campaignId, error_code: open!, page, page_size: 25 } }),
    enabled: !!open,
  });

  const reasons = q.data?.reasons ?? [];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          Motivos de falha
        </CardTitle>
        {(q.data?.dead_letters ?? 0) > 0 && (
          <Badge variant="outline" className="text-destructive border-destructive/40">
            {q.data?.dead_letters} em dead-letter
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : reasons.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma falha registrada nesta campanha.</p>
        ) : (
          reasons.map((r) => {
            const isOpen = open === r.error_code;
            return (
              <div key={r.error_code} className="rounded-md border">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-3 py-2 text-left"
                  onClick={() => {
                    setPage(0);
                    setOpen(isOpen ? null : r.error_code);
                  }}
                >
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{r.title}</span>
                      <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                        {r.error_code}
                      </Badge>
                    </div>
                    <Progress value={r.pct} className="mt-1 h-1.5" />
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold tabular-nums">{r.total.toLocaleString("pt-BR")}</div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">{r.pct.toFixed(1)}%</div>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t px-3 py-2">
                    {rowsQ.isLoading ? (
                      <p className="text-xs text-muted-foreground">Carregando destinatários…</p>
                    ) : (
                      <>
                        <ul className="space-y-1">
                          {(rowsQ.data?.rows ?? []).map((row: any) => (
                            <li key={row.id} className="flex items-center justify-between gap-3 text-xs">
                              <span className="font-mono">{row.phone}</span>
                              <span className="truncate text-muted-foreground">{row.failed_reason ?? row.title}</span>
                              <span className="shrink-0 text-muted-foreground">tent. {row.attempt ?? 0}</span>
                            </li>
                          ))}
                        </ul>
                        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                          <span>{(rowsQ.data?.total ?? 0).toLocaleString("pt-BR")} no total</span>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                              Anterior
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={(page + 1) * 25 >= (rowsQ.data?.total ?? 0)}
                              onClick={() => setPage((p) => p + 1)}
                            >
                              Próxima
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
