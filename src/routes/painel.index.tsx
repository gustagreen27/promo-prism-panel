import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, Send, Users, FileText, CreditCard, Building2, Sparkles, MessageSquare } from "lucide-react";
import { getMyContext, markOnboardingStep, getPanelHomeStats, type MyContext } from "@/lib/auth.functions";
import { listUpcomingCampaigns } from "@/lib/wa-schedule.functions";
import { CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/painel/")({
  head: () => ({ meta: [{ title: "Painel — Disparos FR" }] }),
  component: PanelHome,
});

const CHECKLIST: Record<string, { label: string; to: string; icon: typeof Send; description: string }> = {
  company_profile: { label: "Complete os dados da empresa", to: "/painel/configuracoes", icon: Building2, description: "Nome, telefone e CNPJ." },
  import_contacts: { label: "Importe seus contatos", to: "/painel/contatos", icon: Users, description: "Suba sua lista com opt-in." },
  request_template: { label: "Solicite ou escolha um template", to: "/painel/templates", icon: FileText, description: "Templates aprovados pela Meta." },
  add_balance: { label: "Adicione saldo em R$", to: "/painel/financeiro", icon: CreditCard, description: "Sem saldo, sem envio." },
  first_campaign: { label: "Crie sua primeira campanha", to: "/painel/campanhas/nova", icon: Send, description: "Configure e dispare." },
};

function PanelHome() {
  const ctxFn = useServerFn(getMyContext);
  const statsFn = useServerFn(getPanelHomeStats);
  const markFn = useServerFn(markOnboardingStep);
  const qc = useQueryClient();

  const { data: ctx } = useQuery({ queryKey: ["my-context"], queryFn: () => ctxFn(), staleTime: 30_000 });
  const ws = ctx?.primary_workspace;

  const { data: stats } = useQuery({
    queryKey: ["panel-stats", ws?.id],
    queryFn: () => statsFn({ data: { workspace_id: ws!.id } }),
    enabled: !!ws?.id,
    refetchInterval: 60_000,
  });

  const upcomingFn = useServerFn(listUpcomingCampaigns);
  const { data: upcoming = [] } = useQuery({
    queryKey: ["upcoming-campaigns", ws?.id],
    queryFn: () => upcomingFn({ data: { workspace_id: ws!.id, limit: 5 } }),
    enabled: !!ws?.id,
    refetchInterval: 60_000,
  });

  const onboarding = ws?.onboarding ?? [];
  const totalSteps = onboarding.length || 5;
  const doneSteps = onboarding.filter((o) => o.done).length;
  const progressPct = Math.round((doneSteps / totalSteps) * 100);

  async function toggle(key: string, done: boolean) {
    if (!ws) return;
    await markFn({ data: { workspace_id: ws.id, key, done } });
    qc.invalidateQueries({ queryKey: ["my-context"] });
  }

  const firstName = ctx?.profile?.full_name?.split(" ")[0] ?? "";
  const kpis = [
    { label: "Campanhas ativas", value: stats?.active_campaigns ?? 0 },
    { label: "Enviadas (30d)", value: stats?.sent ?? 0 },
    { label: "Entregues", value: stats?.delivered ?? 0 },
    { label: "Lidas", value: stats?.read ?? 0 },
    { label: "Respostas", value: stats?.replied ?? 0 },
    { label: "Falhas", value: stats?.failed ?? 0 },
    { label: "Opt-outs", value: stats?.opt_out ?? 0 },
    { label: "Total campanhas", value: stats?.total_campaigns ?? 0 },
  ];

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-2xl border bg-white p-6 shadow-elegant sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-grid-subtle opacity-60" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Painel Disparos FR
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {firstName ? `Bem-vindo, ${firstName}.` : "Bem-vindo."}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Painel de <span className="font-medium text-foreground">{ws?.name}</span> · complete os passos abaixo para operar em minutos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild className="shadow-elegant">
              <Link to="/painel/campanhas/nova"><Send className="mr-2 h-4 w-4" /> Criar campanha</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/painel/contatos"><Users className="mr-2 h-4 w-4" /> Importar contatos</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/painel/templates"><MessageSquare className="mr-2 h-4 w-4" /> Solicitar template</Link>
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle>Primeiros passos</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{doneSteps} de {totalSteps} concluídos</p>
            </div>
            <div className="w-40">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
              </div>
              <p className="mt-1 text-right text-xs text-muted-foreground">{progressPct}%</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {onboarding.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum passo carregado ainda.</p>
          )}
          {onboarding.map((item) => {
            const meta = CHECKLIST[item.key];
            if (!meta) return null;
            const Icon = meta.icon;
            return (
              <div key={item.key} className="flex items-center justify-between gap-3 rounded-lg border p-3 transition hover:bg-muted/50">
                <button
                  type="button"
                  onClick={() => toggle(item.key, !item.done)}
                  className="flex flex-1 items-center gap-3 text-left"
                >
                  {item.done ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                  ) : (
                    <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="grid h-8 w-8 place-items-center rounded-md bg-muted">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <span>
                    <span className={`block text-sm font-medium ${item.done ? "line-through text-muted-foreground" : ""}`}>{meta.label}</span>
                    <span className="block text-xs text-muted-foreground">{meta.description}</span>
                  </span>
                </button>
                <Button asChild variant="ghost" size="sm">
                  <Link to={meta.to as never}>Abrir</Link>
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-4 w-4" />Próximos disparos</CardTitle>
          <Button asChild size="sm" variant="ghost"><Link to="/painel/agenda">Ver agenda</Link></Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum disparo agendado.</p>
          ) : upcoming.map((c: any) => (
            <div key={c.id} className="flex items-center justify-between rounded border p-3 text-sm">
              <div>
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(c.scheduled_at).toLocaleString("pt-BR")} · {c.total_recipients ?? 0} contatos · {c.connection?.display_name ?? c.connection?.display_phone ?? "—"} · {c.template?.name ?? "—"}
                </div>
              </div>
              <Badge variant="outline">{c.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Últimos 30 dias</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((k) => (
            <Card key={k.label} className="transition hover:shadow-elegant">
              <CardContent className="p-4">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{k.label}</div>
                <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{k.value.toLocaleString("pt-BR")}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// suppress unused warning if any
export type { MyContext };
