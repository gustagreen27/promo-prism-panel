import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Send, Play, CheckCircle2, Wallet, Building2, ArrowRight } from "lucide-react";
import { getMyContext, type MyContext } from "@/lib/auth.functions";
import { getClientDashboard } from "@/lib/client-panel.functions";

export const Route = createFileRoute("/painel/")({
  head: () => ({
    meta: [
      { title: "Painel de disparos — Disparos FR" },
      { name: "description", content: "Acompanhe créditos, disparos em execução e resultados das suas campanhas de WhatsApp." },
      { property: "og:title", content: "Painel de disparos — Disparos FR" },
      { property: "og:description", content: "Créditos, disparos em execução e resultados das suas campanhas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PanelHome,
});

const nf = (n: number) => n.toLocaleString("pt-BR");

const BUCKET_LABEL: Record<string, string> = {
  recebido: "Recebido",
  configurando: "Configurando",
  disparando: "Disparando",
  realizado: "Realizado",
  cancelado: "Cancelado",
};

const BUCKET_CLASS: Record<string, string> = {
  recebido: "bg-primary/10 text-primary border-primary/20",
  configurando: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  disparando: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  realizado: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  cancelado: "bg-destructive/10 text-destructive border-destructive/20",
};

type RangeKey = "all" | "today" | "7d";

const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: "all", label: "Todos" },
  { key: "today", label: "Hoje" },
  { key: "7d", label: "Últimos 7 dias" },
];

function PanelHome() {
  const ctxFn = useServerFn(getMyContext);
  const dashFn = useServerFn(getClientDashboard);
  const [projectId, setProjectId] = useState<string>("all");
  const [campaignId, setCampaignId] = useState<string>("all");
  const [range, setRange] = useState<RangeKey>("all");

  const { data: ctx } = useQuery({ queryKey: ["my-context"], queryFn: () => ctxFn(), staleTime: 30_000 });
  const ws = ctx?.primary_workspace;

  const { data, isLoading } = useQuery({
    queryKey: ["client-dashboard", ws?.id, projectId],
    queryFn: () => dashFn({ data: { workspace_id: ws!.id, project_id: projectId === "all" ? null : projectId } }),
    enabled: !!ws?.id,
    refetchInterval: 60_000,
  });

  const firstName = ctx?.profile?.full_name?.split(" ")[0] ?? "";
  const credits = data?.credits;
  const counts = data?.counts;
  const campaigns = data?.campaigns ?? [];

  const selected = useMemo(
    () => (campaignId === "all" ? null : campaigns.find((c) => c.id === campaignId) ?? null),
    [campaignId, campaigns],
  );

  const report = selected
    ? { campaigns: 1, done: selected.bucket === "realizado" ? 1 : 0, used: selected.sent }
    : { campaigns: data?.totals.campaigns ?? 0, done: counts?.realizado ?? 0, used: data?.totals.sent ?? 0 };

  const usedPct = credits && credits.purchased > 0
    ? Math.min(100, Math.round((credits.used / credits.purchased) * 100))
    : 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {firstName ? `Olá, ${firstName}` : "Olá"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Bem-vindo ao seu painel de disparos</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(data?.projects?.length ?? 0) > 0 && (
            <Select value={projectId} onValueChange={(v) => { setProjectId(v); setCampaignId("all"); }}>
              <SelectTrigger className="h-9 w-52"><SelectValue placeholder="Empresa" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as empresas</SelectItem>
                {data!.projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button asChild className="shadow-elegant">
            <Link to="/painel/campanhas/nova"><Send className="mr-2 h-4 w-4" /> Novo disparo</Link>
          </Button>
        </div>
      </div>

      {/* Resumo da conta */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Resumo da conta</h2>
        <div className="grid gap-4 lg:grid-cols-4">
          <Card className="lg:col-span-1">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Wallet className="h-3.5 w-3.5" /> Saldo de créditos
              </div>
              <div className="mt-3 text-3xl font-semibold tabular-nums tracking-tight">
                {isLoading ? "—" : nf(credits?.available ?? 0)}
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${usedPct}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{nf(credits?.used ?? 0)}</span> utilizados de{" "}
                <span className="font-medium text-foreground">{nf(credits?.purchased ?? 0)}</span> comprados
              </p>
              <Button asChild variant="ghost" size="sm" className="mt-3 -ml-2 h-8 px-2 text-xs">
                <Link to="/painel/financeiro">Ver créditos <ArrowRight className="ml-1 h-3 w-3" /></Link>
              </Button>
            </CardContent>
          </Card>

          <StatusCard
            label="Em execução"
            value={(counts?.recebido ?? 0) + (counts?.configurando ?? 0)}
            hint="Recebidos e em configuração"
            icon={Send}
          />
          <StatusCard label="Em disparo" value={counts?.disparando ?? 0} hint="Na fila de envio ou aguardando horário" icon={Play} />
          <StatusCard label="Realizados" value={counts?.realizado ?? 0} hint="Disparos concluídos" icon={CheckCircle2} />
        </div>
      </section>

      {/* Consumo por empresa */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4" /> Consumo de créditos por empresa</CardTitle>
          <p className="text-xs text-muted-foreground">Uso consolidado por filial quando não há empresa selecionada; filtrável acima.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {(data?.by_project ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum consumo registrado.</p>
          ) : (
            data!.by_project.map((p) => {
              const max = Math.max(...data!.by_project.map((x) => x.credits), 1);
              return (
                <div key={p.name} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{p.name}</span>
                    <span className="tabular-nums">{nf(p.credits)} <span className="text-xs text-muted-foreground">créditos</span></span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${(p.credits / max) * 100}%` }} />
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Relatório de disparos */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Relatório de disparos</CardTitle>
              <p className="text-xs text-muted-foreground">Agregações do conjunto visível ao painel, respeitando o filtro de empresa.</p>
            </div>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger className="h-9 w-64"><SelectValue placeholder="Disparo específico" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os disparos</SelectItem>
                {campaigns.slice(0, 30).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {new Date(c.created_at).toLocaleDateString("pt-BR")} · {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <Metric label="Disparos" value={report.campaigns} />
            <Metric label="Realizados" value={report.done} />
            <Metric label="Créditos usados" value={report.used} />
          </div>
          {selected ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <Metric small label="Destinatários" value={selected.total_recipients} />
              <Metric small label="Entregues" value={selected.delivered} />
              <Metric small label="Lidas" value={selected.read} />
              <Metric small label="Falhas" value={selected.failed} />
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              Escolha “Todos os disparos” para métricas consolidadas.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Disparos recentes */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Disparos recentes</CardTitle>
              <Badge variant="secondary" className="tabular-nums">{recent.length}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-0.5">
                {RANGES.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setRange(r.key)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${range === r.key ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <Button asChild size="sm" variant="ghost"><Link to="/painel/campanhas">Ver todos</Link></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum disparo no período selecionado.</p>
          ) : (
            recent.slice(0, 5).map((c) => {
              const pct = c.total_recipients > 0 ? Math.round((c.delivered / c.total_recipients) * 100) : null;
              return (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 transition hover:bg-muted/40">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={BUCKET_CLASS[c.bucket]}>{BUCKET_LABEL[c.bucket]}</Badge>
                      <span className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString("pt-BR")}</span>
                    </div>
                    <div className="mt-1 truncate text-sm font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.project_name ?? "Sem empresa"}</div>
                  </div>
                  <div className="text-right text-sm tabular-nums">
                    {c.bucket === "realizado" && pct !== null ? (
                      <span className="font-medium text-emerald-600">{pct}% entregue</span>
                    ) : (
                      <span className="text-muted-foreground">{nf(c.total_recipients)} destinatários</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusCard({ label, value, hint, icon: Icon }: { label: string; value: number; hint: string; icon: typeof Send }) {
  return (
    <Card className="transition hover:shadow-elegant">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {label}
        </div>
        <div className="mt-3 text-3xl font-semibold tabular-nums tracking-tight">{nf(value)}</div>
        <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
        <Button asChild variant="ghost" size="sm" className="mt-3 -ml-2 h-8 px-2 text-xs">
          <Link to="/painel/campanhas">Ver disparos <ArrowRight className="ml-1 h-3 w-3" /></Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, small }: { label: string; value: number; small?: boolean }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 font-semibold tabular-nums tracking-tight ${small ? "text-xl" : "text-2xl"}`}>{nf(value)}</div>
    </div>
  );
}

export type { MyContext };
