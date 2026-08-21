import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getMyContext } from "@/lib/auth.functions";
import { listMyDemands } from "@/lib/campaign-approval.functions";
import {
  demandStage,
  pendingCount,
  STAGE_CLASS,
  STAGE_LABEL,
  type DemandStage,
} from "@/lib/demand-stage";
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock,
  Info,
  ListChecks,
  Loader2,
  Plus,
  Search,
  Send,
  XCircle,
} from "lucide-react";

export const Route = createFileRoute("/painel/demandas")({
  head: () => ({
    meta: [
      { title: "Meus disparos — Painel" },
      { name: "description", content: "Acompanhe o status de aprovação de cada disparo solicitado." },
      { property: "og:title", content: "Meus disparos — Painel" },
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
  execution_type?: string | null;
  external_status?: string | null;
  external_total_count?: number | null;
  external_sent_count?: number | null;
  external_delivered_count?: number | null;
  external_failed_count?: number | null;
  external_started_at?: string | null;
  external_updated_at?: string | null;
  external_finished_at?: string | null;
  decisions: Array<{ action: string; message: string | null; created_at: string }>;
};

type Bucket = DemandStage;

const bucketOf = (d: Demand): Bucket => demandStage(d as any);

const BUCKETS: Record<
  Bucket,
  { label: string; className: string; icon: typeof Clock; accent: string; tile: string }
> = {
  pending: {
    label: STAGE_LABEL.pending,
    className: STAGE_CLASS.pending,
    icon: Clock,
    accent: "border-l-amber-500",
    tile: "bg-amber-500/10 text-amber-600",
  },
  scheduled: {
    label: STAGE_LABEL.scheduled,
    className: STAGE_CLASS.scheduled,
    icon: CalendarDays,
    accent: "border-l-blue-500",
    tile: "bg-blue-500/10 text-blue-600",
  },
  queued: {
    label: STAGE_LABEL.queued,
    className: STAGE_CLASS.queued,
    icon: ListChecks,
    accent: "border-l-emerald-500",
    tile: "bg-emerald-500/10 text-emerald-600",
  },
  completed: {
    label: STAGE_LABEL.completed,
    className: STAGE_CLASS.completed,
    icon: CheckCircle2,
    accent: "border-l-green-600",
    tile: "bg-green-600/10 text-green-700",
  },
  rejected: {
    label: STAGE_LABEL.rejected,
    className: STAGE_CLASS.rejected,
    icon: XCircle,
    accent: "border-l-destructive",
    tile: "bg-destructive/10 text-destructive",
  },
};

const fmt = (v: string | null | undefined) => (v ? new Date(v).toLocaleString("pt-BR") : "—");
const num = (v: number | null | undefined) => (v ?? 0).toLocaleString("pt-BR");

function progressOf(d: Demand) {
  const total = d.external_total_count ?? d.total_recipients ?? 0;
  if (!total) return 0;
  const done = (d.external_sent_count ?? 0) + (d.external_failed_count ?? 0);
  return Math.min(100, Math.round((done / total) * 100));
}

function Page() {
  const ctxFn = useServerFn(getMyContext);
  const demandsFn = useServerFn(listMyDemands);
  const [filter, setFilter] = useState<Bucket | "all">("all");
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<"all" | "7" | "30">("all");

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
    const c: Record<Bucket, number> = { pending: 0, scheduled: 0, queued: 0, completed: 0, rejected: 0 };
    for (const d of items) c[bucketOf(d)] += 1;
    return c;
  }, [items]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cutoff = period === "all" ? 0 : Date.now() - Number(period) * 86_400_000;
    return items.filter((d) => {
      if (filter !== "all" && bucketOf(d) !== filter) return false;
      if (cutoff && new Date(d.created_at).getTime() < cutoff) return false;
      if (q && !`${d.name} ${d.list_name ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, filter, search, period]);

  return (
    <div className="space-y-6">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">Meus disparos</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe o status das suas campanhas e solicitações de envio.
          </p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {(Object.keys(BUCKETS) as Bucket[]).map((b) => {
          const Icon = BUCKETS[b].icon;
          const active = filter === b;
          return (
            <Card
              key={b}
              onClick={() => setFilter(active ? "all" : b)}
              className={`cursor-pointer border-l-4 transition-shadow hover:shadow-md ${BUCKETS[b].accent} ${
                active ? "ring-2 ring-primary/40" : ""
              }`}
            >
              <CardContent className="flex items-center gap-3 p-4">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${BUCKETS[b].tile}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="text-2xl font-semibold leading-none">{counts[b]}</div>
                  <div className="truncate text-xs text-muted-foreground">{BUCKETS[b].label}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-center">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar campanha ou lista..."
              className="pl-9"
            />
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
            <SelectTrigger className="md:w-48">
              <SelectValue placeholder="Todos os status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {(Object.keys(BUCKETS) as Bucket[]).map((b) => (
                <SelectItem key={b} value={b}>
                  {BUCKETS[b].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={(v) => setPeriod(v as any)}>
            <SelectTrigger className="md:w-44">
              <SelectValue placeholder="Todas as datas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as datas</SelectItem>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
            </SelectContent>
          </Select>
          <Button asChild>
            <Link to="/painel/campanhas/nova">
              Nova campanha <Plus className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </p>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Nenhum disparo por aqui.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((d) => {
            const b = bucketOf(d);
            const Icon = BUCKETS[b].icon;
            const decision = d.decisions?.[0];
            const pct = progressOf(d);
            const showProgress =
              !!d.external_total_count || !!d.external_sent_count || b === "queued" || b === "scheduled";
            return (
              <Card key={d.id}>
                <CardContent className="grid grid-cols-[auto_minmax(0,1fr)] gap-4 p-4 lg:grid-cols-[auto_minmax(0,1fr)_auto]">
                  <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${BUCKETS[b].tile}`}>
                    <Icon className="h-6 w-6" />
                  </span>

                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-base font-semibold">{d.name}</h2>
                      <Badge variant="outline" className={BUCKETS[b].className}>
                        {BUCKETS[b].label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Criada em {fmt(d.created_at)} · {num(d.total_recipients)} destinatários
                      {d.list_name ? ` · Lista: ${d.list_name}` : ""}
                      {d.scheduled_at ? ` · Agendada para ${fmt(d.scheduled_at)}` : ""}
                    </p>

                    {b === "pending" && (
                      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        Sua campanha está em análise pela nossa equipe. Você será avisado assim que houver uma decisão.
                      </div>
                    )}
                    {b === "rejected" && (
                      <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        Rejeitada em {fmt(d.approved_at)}. Motivo:{" "}
                        {d.rejection_reason || decision?.message || "não informado"}
                      </div>
                    )}
                    {b === "scheduled" && d.scheduled_at && (
                      <div className="flex items-start gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-700">
                        <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        Envio agendado para {fmt(d.scheduled_at)}.
                      </div>
                    )}

                    {showProgress && (
                      <div className="rounded-xl border bg-muted/40 p-3">
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="font-medium">
                            {d.external_finished_at ? "Resultado da campanha" : "Andamento da campanha"}
                          </span>
                          <span className="text-muted-foreground">{pct}%</span>
                        </div>
                        <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                          <Metric
                            icon={<Send className="h-4 w-4 text-emerald-600" />}
                            value={num(d.external_sent_count)}
                            label="Enviados com sucesso"
                          />
                          <Metric
                            icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                            value={num(d.external_delivered_count)}
                            label="Entregues"
                          />
                          <Metric
                            icon={<XCircle className="h-4 w-4 text-destructive" />}
                            value={num(d.external_failed_count)}
                            label="Falhas"
                          />
                          <Metric
                            icon={<Clock className="h-4 w-4 text-muted-foreground" />}
                            value={num(pendingCount(d))}
                            label="Pendentes"
                          />
                          <Metric
                            icon={<CalendarDays className="h-4 w-4 text-muted-foreground" />}
                            value={fmt(d.external_updated_at ?? d.external_finished_at)}
                            label={d.external_finished_at ? "Finalizado em" : "Última atualização"}
                            small
                          />
                        </div>
                        {!d.external_finished_at && (
                          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <Info className="h-3 w-3" />
                            Os dados desta página são atualizados a cada 10 minutos.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="col-span-2 flex flex-wrap items-start justify-end gap-2 lg:col-span-1">
                    <Button asChild size="sm" variant="outline">
                      <Link to="/painel/campanhas/$id" params={{ id: d.id }}>
                        {b === "completed" ? (
                          <>
                            <BarChart3 className="mr-1 h-4 w-4" /> Ver relatório
                          </>
                        ) : (
                          <>Ver detalhes</>
                        )}
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Metric({
  icon,
  value,
  label,
  small,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  small?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className={`${small ? "text-xs" : "text-sm"} truncate font-semibold`}>{value}</div>
        <div className="truncate text-[11px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
