import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, Send, Users, FileText, CreditCard, Building2, Sparkles, MessageSquare } from "lucide-react";
import { getMyContext, markOnboardingStep, getPanelHomeStats, type MyContext } from "@/lib/auth.functions";

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
      <div className="rounded-2xl border bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Painel Disparos FR
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              {firstName ? `Bem-vindo, ${firstName}!` : "Bem-vindo!"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Este é o painel do <span className="font-medium text-foreground">{ws?.name}</span>. Complete os passos abaixo para começar a operar.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
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

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Últimos 30 dias</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((k) => (
            <Card key={k.label}>
              <CardContent className="p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</div>
                <div className="mt-2 text-2xl font-bold tabular-nums">{k.value.toLocaleString("pt-BR")}</div>
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
