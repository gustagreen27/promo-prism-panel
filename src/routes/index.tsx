import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  MessageSquare,
  ShieldCheck,
  BarChart3,
  Users,
  FileCheck2,
  Database,
  Zap,
  CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Disparos FR — Campanhas oficiais no WhatsApp Business" },
      {
        name: "description",
        content:
          "Plataforma completa para disparos oficiais no WhatsApp Business Platform: templates aprovados, listas de contatos, relatórios em tempo real, opt-in/opt-out e controle financeiro.",
      },
      { property: "og:title", content: "Disparos FR — WhatsApp Business Platform" },
      {
        property: "og:description",
        content:
          "Dispare campanhas oficiais no WhatsApp com controle, automação e relatórios em tempo real.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-bold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <MessageSquare className="h-4 w-4" />
            </span>
            Disparos FR
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#recursos" className="hover:text-foreground">Recursos</a>
            <a href="#como-funciona" className="hover:text-foreground">Como funciona</a>
            <a href="#planos" className="hover:text-foreground">Preços</a>
            <a href="#faq" className="hover:text-foreground">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/login">Entrar</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/cadastro">Começar agora</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="mx-auto max-w-7xl px-4 py-20 text-center sm:px-6 sm:py-28">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> WhatsApp Business Platform oficial da Meta
          </div>
          <h1 className="mx-auto mt-6 max-w-4xl text-balance text-4xl font-black tracking-tight sm:text-6xl">
            Dispare campanhas oficiais no WhatsApp com controle, automação e relatórios em tempo real.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
            Uma plataforma completa para empresas criarem campanhas via WhatsApp Business Platform,
            com templates aprovados, contatos, filas de envio, relatórios, opt-out e controle financeiro.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/cadastro">Começar agora</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#como-funciona">Ver demonstração</a>
            </Button>
          </div>
        </div>
      </section>

      {/* Prova de valor */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { icon: ShieldCheck, label: "API oficial da Meta" },
            { icon: FileCheck2, label: "Templates aprovados" },
            { icon: BarChart3, label: "Relatórios em tempo real" },
            { icon: Users, label: "Contatos e listas" },
            { icon: CheckCircle2, label: "Opt-in e opt-out" },
            { icon: Database, label: "Estoque de mensagens" },
            { icon: Zap, label: "Filas de envio inteligentes" },
            { icon: MessageSquare, label: "Inbox integrada" },
          ].map((f) => (
            <Card key={f.label} className="border-border/60">
              <CardContent className="flex items-center gap-3 p-4">
                <f.icon className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">{f.label}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="border-y border-border/60 bg-muted/20">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Como funciona</h2>
            <p className="mt-3 text-muted-foreground">Do cadastro ao primeiro disparo em minutos.</p>
          </div>
          <ol className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              "Cadastre sua conta",
              "Conecte seu WhatsApp ou solicite configuração",
              "Importe seus contatos",
              "Escolha um template aprovado",
              "Inicie a campanha",
              "Acompanhe os resultados em tempo real",
            ].map((step, i) => (
              <li key={step} className="rounded-xl border border-border bg-background p-6">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                  {i + 1}
                </div>
                <p className="mt-3 font-medium">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Recursos */}
      <section id="recursos" className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Recursos completos</h2>
          <p className="mt-3 text-muted-foreground">Tudo que sua operação de WhatsApp precisa em um só lugar.</p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Campanhas WhatsApp", "Crie, agende e monitore disparos em massa via API oficial."],
            ["Templates", "Envie templates para aprovação da Meta e reutilize os aprovados."],
            ["Listas de contatos", "Importe CSV, aplique tags, remova duplicados e controle opt-in."],
            ["Variáveis dinâmicas", "Personalize cada mensagem com dados do contato."],
            ["Webhooks", "Receba status de entrega, leitura e resposta em tempo real."],
            ["Relatórios", "Métricas por campanha, período, número e template."],
            ["Inbox", "Responda conversas recebidas direto do painel."],
            ["Estoque de mensagens", "Controle de créditos e consumo por workspace."],
            ["Multiusuários e permissões", "Owner, admin, operador e viewer com controle fino."],
          ].map(([title, desc]) => (
            <Card key={title} className="border-border/60">
              <CardContent className="p-6">
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Segurança */}
      <section className="border-y border-border/60 bg-muted/20">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="grid gap-8 md:grid-cols-2 md:items-center">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Segurança e conformidade</h2>
              <p className="mt-3 text-muted-foreground">
                Operação 100% dentro das regras da Meta. Respeitamos opt-in, oferecemos opt-out obrigatório,
                nunca burlamos limites e mantemos tokens protegidos no backend com logs completos de auditoria.
              </p>
            </div>
            <ul className="grid gap-2 text-sm">
              {[
                "API oficial WhatsApp Business Platform",
                "Opt-in e opt-out obrigatórios",
                "Tokens armazenados no servidor",
                "Logs de auditoria completos",
                "Isolamento de dados por workspace (RLS)",
                "Sem bypass de limites da Meta",
              ].map((s) => (
                <li key={s} className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Planos</h2>
          <p className="mt-3 text-muted-foreground">
            Estrutura pronta para escalar. Valores serão anunciados em breve.
          </p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { name: "Starter", desc: "Para começar a operar disparos oficiais.", feats: ["1 número", "5k mensagens/mês", "1 usuário", "Relatórios básicos"] },
            { name: "Growth", desc: "Para times em crescimento.", feats: ["2 números", "25k mensagens/mês", "5 usuários", "Relatórios avançados"] },
            { name: "Scale", desc: "Para operações em escala.", feats: ["5 números", "100k mensagens/mês", "20 usuários", "Suporte prioritário"] },
            { name: "Enterprise", desc: "Sob medida para grandes operações.", feats: ["Números ilimitados", "Volume sob consulta", "SLA dedicado", "Onboarding assistido"] },
          ].map((p) => (
            <Card key={p.name} className="border-border/60">
              <CardContent className="p-6">
                <h3 className="text-lg font-bold">{p.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>
                <div className="mt-4 text-2xl font-bold text-muted-foreground">Em breve</div>
                <ul className="mt-4 space-y-2 text-sm">
                  {p.feats.map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary" /> {f}
                    </li>
                  ))}
                </ul>
                <Button asChild className="mt-6 w-full" variant={p.name === "Growth" ? "default" : "outline"}>
                  <Link to="/cadastro">Começar</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-y border-border/60 bg-muted/20">
        <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">Perguntas frequentes</h2>
          <div className="mt-10 divide-y divide-border rounded-xl border border-border bg-background">
            {[
              ["Preciso ter WhatsApp Business?", "Sim, sua empresa precisa de uma conta WhatsApp Business Account (WABA) na Meta. Ajudamos você a configurar."],
              ["Posso usar meu próprio número?", "Sim. Você pode conectar um número existente via Embedded Signup ou solicitar configuração pela nossa equipe."],
              ["O sistema usa API oficial?", "Sim, 100%. Usamos exclusivamente a WhatsApp Business Platform (Cloud API) da Meta."],
              ["Preciso aprovar templates?", "Sim. Todos os disparos em massa exigem templates aprovados pela Meta. Você cria e envia direto do painel."],
              ["Posso importar contatos?", "Sim, via CSV, com deduplicação, tags, listas e controle de opt-in/opt-out."],
              ["Como funcionam os relatórios?", "Métricas em tempo real por campanha, período, número e template, com exportação em CSV."],
              ["Posso cancelar?", "Sim. Você pode cancelar seu plano a qualquer momento."],
              ["Existe opt-out?", "Sim, opt-out é obrigatório e respeitado automaticamente."],
            ].map(([q, a]) => (
              <details key={q} className="group px-6 py-4">
                <summary className="cursor-pointer list-none font-medium">{q}</summary>
                <p className="mt-2 text-sm text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Comece hoje a operar campanhas profissionais no WhatsApp.
        </h2>
        <div className="mt-8">
          <Button asChild size="lg">
            <Link to="/cadastro">Criar conta</Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border/60 py-10 text-center text-sm text-muted-foreground">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <p>© {new Date().getFullYear()} Disparos FR. Todos os direitos reservados.</p>
          <div className="mt-2 flex justify-center gap-4">
            <Link to="/politica-de-privacidade" className="hover:text-foreground">Política de privacidade</Link>
            <Link to="/login" className="hover:text-foreground">Entrar</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
