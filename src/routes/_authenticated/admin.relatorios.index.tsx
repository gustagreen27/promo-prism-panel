import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, FileText, BarChart3 } from "lucide-react";
import { computeTotals, fmtBRL, fmtNum, formatBRDate, type Campaign } from "@/lib/report-utils";
import { PageHeader } from "@/components/admin/page-header";

type ReportRow = {
  id: string;
  client_name: string;
  report_date: string;
  reference: string | null;
  project: string | null;
  campaigns: Campaign[];
  created_at: string;
};

export const Route = createFileRoute("/_authenticated/admin/relatorios/")({
  head: () => ({ meta: [{ title: "Relatórios — Painel" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("id, client_name, report_date, reference, project, final_value, campaigns, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as ReportRow[];
    },
  });

  return (
    <>
      <PageHeader
        title="Relatórios de fechamento"
        description="Histórico completo de disparos por cliente."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/admin/relatorios/analytics"><BarChart3 className="size-4" /> Analytics</Link>
            </Button>
            <Button asChild>
              <Link to="/admin/relatorios/new"><Plus className="size-4" /> Novo relatório</Link>
            </Button>
          </>
        }
      />

      {isLoading ? (
        <div className="text-muted-foreground">Carregando…</div>
      ) : !data?.length ? (
        <Card className="p-12 text-center">
          <FileText className="size-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">Nenhum relatório ainda</p>
          <p className="text-sm text-muted-foreground mb-4">Crie seu primeiro relatório de disparos.</p>
          <Button asChild><Link to="/admin/relatorios/new">Criar relatório</Link></Button>
        </Card>
      ) : (
        <div className="grid gap-3">
          {data.map((r) => {
            const t = computeTotals(r.campaigns ?? []);
            return (
              <Link
                key={r.id}
                to="/admin/relatorios/$id"
                params={{ id: r.id }}
                className="block"
              >
                <Card className="p-4 hover:border-primary/40 transition-colors">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-lg">{r.client_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatBRDate(r.report_date)}
                        {r.reference ? ` · Ref: ${r.reference}` : ""}
                        {r.project ? ` · ${r.project}` : ""}
                      </div>
                    </div>
                    <div className="flex gap-6 text-sm">
                      <Stat label="Entregues" value={fmtNum(t.delivered)} />
                      <Stat label="Falhou" value={fmtNum(t.failed)} />
                      <Stat label="Líquido" value={fmtBRL(t.net)} highlight />
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={highlight ? "font-bold text-report-blue" : "font-medium"}>{value}</div>
    </div>
  );
}
