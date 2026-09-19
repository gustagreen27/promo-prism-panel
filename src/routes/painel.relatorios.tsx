import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Lock, TrendingUp } from "lucide-react";
import { demandMetrics, demandStage, STAGE_CLASS, STAGE_LABEL } from "@/lib/demand-stage";
import { supabase } from "@/integrations/supabase/client";
import { getMyContext } from "@/lib/auth.functions";

export const Route = createFileRoute("/painel/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios — next DISPAROS" },
      { name: "description", content: "Desempenho e resultados das campanhas de WhatsApp." },
      { property: "og:title", content: "Relatórios — next DISPAROS" },
      { property: "og:description", content: "Desempenho e resultados das campanhas de WhatsApp." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type CampRow = {
  id: string; name: string; status: string; created_at: string;
  total_recipients: number | null; sent_count: number | null; delivered_count: number | null;
  read_count: number | null; replied_count: number | null; failed_count: number | null;
  charged_cents: number | null;
  execution_type: string | null;
  external_total_count: number | null;
  external_sent_count: number | null;
  external_delivered_count: number | null;
  external_failed_count: number | null;
  approval_status: string | null;
  scheduled_at: string | null;
  external_status: string | null;
  external_started_at: string | null;
  external_finished_at: string | null;
};

/** Usa os números da execução externa quando existirem (mesma fonte das demandas). */
function metrics(r: CampRow) {
  const n = (v: number | null | undefined) => Number(v) || 0;
  const m = demandMetrics(r);
  return {
    total: m.total,
    sent: m.sent,
    delivered: m.delivered,
    failed: m.failed,
    read: m.read,
    replied: m.replied,
    charged: n(r.charged_cents),
  };
}

function Page() {
  const ctxFn = useServerFn(getMyContext);
  const { data: ctx } = useQuery({ queryKey: ["my-context"], queryFn: () => ctxFn(), staleTime: 30_000 });
  const wsId = ctx?.primary_workspace?.id;
  const [days, setDays] = useState<"7" | "30" | "90" | "all">("30");

  const { data: rows = [], isLoading } = useQuery<CampRow[]>({
    queryKey: ["ws-report", wsId, days],
    enabled: !!wsId,
    queryFn: async () => {
      let q = supabase.from("wa_campaigns")
        .select("id,name,status,created_at,total_recipients,sent_count,delivered_count,read_count,replied_count,failed_count,charged_cents,execution_type,external_total_count,external_sent_count,external_delivered_count,external_failed_count,approval_status,scheduled_at,external_status,external_started_at,external_finished_at")
        .eq("workspace_id", wsId!)
        .order("created_at", { ascending: false }).limit(200);
      if (days !== "all") {
        const from = new Date(Date.now() - Number(days) * 86400_000).toISOString();
        q = q.gte("created_at", from);
      }
      const { data, error } = await q;
      if (error) throw error;
      // Somente campanhas que entraram no fluxo de envio: agendadas, em fila,
      // em execução e finalizadas. Rascunhos, rejeitadas e canceladas ficam fora.
      return ((data as CampRow[]) || []).filter((r) => {
        const raw = (r.status ?? "").toLowerCase();
        const approved = r.approval_status === "approved" || r.execution_type === "external";
        // Rascunho só é descartado quando a demanda não foi aprovada: execuções
        // externas continuam com status "draft" no motor mesmo já rodando.
        if (raw === "cancelled" || raw === "canceled" || raw === "rejected") return false;
        if (raw === "draft" && !approved) return false;
        const stage = demandStage(r);
        return stage === "scheduled" || stage === "queued" || stage === "completed";
      });

    },
  });

  const totals = useMemo(() => {
    const m = rows.map(metrics);
    const sum = (k: "total" | "sent" | "delivered" | "read" | "replied" | "failed" | "charged") =>
      m.reduce((a, r) => a + r[k], 0);
    const sent = sum("sent");
    const delivered = sum("delivered");
    const read = sum("read");
    return {
      campaigns: rows.length,
      recipients: sum("total"),
      sent, delivered, read, replied: sum("replied"), failed: sum("failed"),
      charged: sum("charged"),
      deliveryRate: sent ? (delivered / sent) * 100 : 0,
      readRate: delivered ? (read / delivered) * 100 : 0,
    };
  }, [rows]);

  if (!wsId) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Relatórios</h1>
          <p className="text-sm text-muted-foreground">Desempenho geral e relatório individual por campanha.</p>
        </div>
        <Select value={days} onValueChange={(v) => setDays(v as any)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
            <SelectItem value="all">Todo o período</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Campanhas" value={totals.campaigns.toLocaleString("pt-BR")} />
        <Kpi label="Destinatários" value={totals.recipients.toLocaleString("pt-BR")} />
        <Kpi label="Enviadas" value={totals.sent.toLocaleString("pt-BR")} />
        <Kpi label="Entregues" value={totals.delivered.toLocaleString("pt-BR")}
          hint={`${totals.deliveryRate.toFixed(1)}% de entrega`} />
        <Kpi label="Lidas" value={totals.read.toLocaleString("pt-BR")}
          hint={`${totals.readRate.toFixed(1)}% de leitura`} />
        <Kpi label="Respostas" value={totals.replied.toLocaleString("pt-BR")} />
        <Kpi label="Falhas" value={totals.failed.toLocaleString("pt-BR")} />
        <Kpi label="Total investido" value={brl(totals.charged)} icon={TrendingUp} />
      </div>

      <Card>
        <CardHeader><CardTitle>Campanhas no período</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : !rows.length ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <BarChart3 className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">Sem dados no período</p>
              <p className="text-xs text-muted-foreground">Ajuste o filtro ou crie uma campanha.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campanha</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Dest.</TableHead>
                    <TableHead className="text-right">Enviadas</TableHead>
                    <TableHead className="text-right">Entregues</TableHead>
                    <TableHead className="text-right">Lidas</TableHead>
                    <TableHead className="text-right">Falhas</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    <TableHead className="text-right">Relatório</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const m = metrics(r);
                    const stage = demandStage(r);
                    const ready = stage === "completed";
                    return (
                    <TableRow key={r.id}>
                      <TableCell>
                        {ready ? (
                          <Link
                            to="/painel/relatorio/$id"
                            params={{ id: r.id }}
                            className="font-medium text-primary hover:underline"
                          >
                            {r.name}
                          </Link>
                        ) : (
                          <span className="font-medium">{r.name}</span>
                        )}
                        <div className="text-xs text-muted-foreground">
                          {new Date(r.created_at).toLocaleDateString("pt-BR")}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STAGE_CLASS[stage]}>
                          {STAGE_LABEL[stage]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{m.total.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.sent.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.delivered.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.read.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.failed.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right tabular-nums">{brl(m.charged)}</TableCell>
                      <TableCell className="text-right">
                        {ready ? (
                          <Link
                            to="/painel/relatorio/$id"
                            params={{ id: r.id }}
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            Ver relatório
                          </Link>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Lock className="h-3 w-3" /> Relatório disponível após o envio completo
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, hint, icon: Icon }: { label: string; value: string; hint?: string; icon?: any }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        </div>
        <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}
