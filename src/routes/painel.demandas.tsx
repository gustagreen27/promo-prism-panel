import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getMyContext } from "@/lib/auth.functions";
import { listMyDemands } from "@/lib/campaign-approval.functions";
import { CheckCircle2, Clock, ListChecks, XCircle, Loader2 } from "lucide-react";

export const Route = createFileRoute("/painel/demandas")({
  head: () => ({
    meta: [
      { title: "Minhas demandas — Painel" },
      { name: "description", content: "Acompanhe o status de aprovação de cada disparo solicitado." },
      { property: "og:title", content: "Minhas demandas — Painel" },
      { property: "og:description", content: "Status de aprovação dos seus disparos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type Demand = {
  id: string;
  name: string;
  status: string;
  approval_status: string | null;
  rejection_reason: string | null;
  approved_at: string | null;
  total_recipients: number | null;
  scheduled_at: string | null;
  created_at: string;
  list_name: string | null;
  decisions: Array<{ action: string; message: string | null; created_at: string }>;
};

type Bucket = "pending" | "scheduled" | "queued" | "approved" | "rejected";

function bucketOf(d: Demand): Bucket {
  if (d.approval_status === "rejected") return "rejected";
  if (d.approval_status === "pending") return d.scheduled_at ? "scheduled" : "pending";
  if (["queued", "scheduled"].includes(d.status)) return "queued";
  return "approved";
}

const BUCKETS: Record<Bucket, { label: string; className: string; icon: typeof Clock }> = {
  pending: { label: "Aguardando envio", className: "bg-amber-500/15 text-amber-600 border-amber-500/30", icon: Clock },
  scheduled: { label: "Agendada", className: "bg-amber-500/15 text-amber-600 border-amber-500/30", icon: Clock },
  queued: { label: "Em fila", className: "bg-sky-500/15 text-sky-600 border-sky-500/30", icon: ListChecks },
  approved: { label: "Aprovada", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30", icon: CheckCircle2 },
  rejected: { label: "Rejeitada", className: "bg-destructive/15 text-destructive border-destructive/30", icon: XCircle },
};

const fmt = (v: string | null | undefined) => (v ? new Date(v).toLocaleString("pt-BR") : "—");

function Page() {
  const ctxFn = useServerFn(getMyContext);
  const demandsFn = useServerFn(listMyDemands);
  const [filter, setFilter] = useState<Bucket | "all">("all");

  const { data: ctx } = useQuery({ queryKey: ["my-context"], queryFn: () => ctxFn(), staleTime: 30_000 });
  const workspaceId = (ctx as any)?.primary_workspace?.id ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ["my-demands", workspaceId],
    enabled: !!workspaceId,
    refetchInterval: 20_000,
    queryFn: () => demandsFn({ data: { workspace_id: workspaceId } }),
  });

  const items = useMemo(() => ((data as any)?.items ?? []) as Demand[], [data]);
  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { pending: 0, scheduled: 0, queued: 0, approved: 0, rejected: 0 };
    for (const d of items) c[bucketOf(d)] += 1;
    return c;
  }, [items]);

  const visible = filter === "all" ? items : items.filter((d) => bucketOf(d) === filter);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Minhas demandas</h1>
        <p className="text-sm text-muted-foreground">
          Todos os disparos solicitados passam por aprovação da nossa equipe antes do envio real.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-5">
        {(Object.keys(BUCKETS) as Bucket[]).map((b) => {
          const Icon = BUCKETS[b].icon;
          return (
            <Card key={b} className="cursor-pointer" onClick={() => setFilter(filter === b ? "all" : b)}>
              <CardContent className="flex items-center gap-3 p-4">
                <Icon className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="text-xl font-semibold">{counts[b]}</div>
                  <div className="text-xs text-muted-foreground">{BUCKETS[b].label}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>
            {filter === "all" ? "Todas as demandas" : BUCKETS[filter].label}
          </CardTitle>
          {filter !== "all" && (
            <Button size="sm" variant="ghost" onClick={() => setFilter("all")}>
              Limpar filtro
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma demanda por aqui.</p>
          ) : (
            <div className="divide-y">
              {visible.map((d) => {
                const b = bucketOf(d);
                const decision = d.decisions?.[0];
                return (
                  <div key={d.id} className="space-y-2 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium">{d.name}</div>
                      <Badge variant="outline" className={BUCKETS[b].className}>{BUCKETS[b].label}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Criada em {fmt(d.created_at)} · {(d.total_recipients ?? 0).toLocaleString("pt-BR")} destinatários
                      {d.list_name ? ` · Lista: ${d.list_name}` : ""}
                      {d.scheduled_at ? ` · Agendada para ${fmt(d.scheduled_at)}` : ""}
                    </div>
                    {b === "pending" && (
                      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                        Sua demanda está na fila de aprovação. Você será avisado assim que houver decisão.
                      </div>
                    )}
                    {b === "rejected" && (
                      <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        Rejeitada em {fmt(d.approved_at)}. Motivo: {d.rejection_reason || decision?.message || "não informado"}
                      </div>
                    )}
                    {(b === "approved" || b === "queued") && d.approved_at && (
                      <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
                        Aprovada em {fmt(d.approved_at)}
                        {b === "queued" ? " — aguardando execução na fila de envio." : "."}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
