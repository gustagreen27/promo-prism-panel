"use client";

import * as React from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Building2,
  CalendarClock,
  Check,
  ClipboardList,
  Contact,
  CreditCard,
  Database,
  FileBarChart,
  Filter,
  Gauge,
  History,
  KeyRound,
  Layers,
  LineChart,
  ListChecks,
  Lock,
  MessageCircle,
  Minus,
  Play,
  Repeat,
  Send,
  ShieldCheck,
  Store,
  TestTube2,
  Timer,
  Upload,
  UserCog,
  Users,
  Wand2,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { Reveal, SectionHeading } from "./site-reveal";
import { SITE_CONTACT } from "./site-shell";
import {
  CampaignsMock,
  RealtimeMock,
  ReportsMock,
  TeamMock,
} from "./site-mockups";

/* ── 3. Faixa de confiança ───────────────────────────────────── */

const TRUST = [
  { icon: Layers, label: "Gestão centralizada" },
  { icon: Activity, label: "Acompanhamento em tempo real" },
  { icon: Users, label: "Múltiplos usuários" },
  { icon: FileBarChart, label: "Relatórios organizados" },
  { icon: Gauge, label: "Operação em escala" },
];

export function TrustStrip() {
  return (
    <section aria-label="Benefícios da plataforma" className="border-y border-white/10 bg-graphite/60">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <ul className="grid grid-cols-2 gap-x-4 gap-y-4 py-6 sm:grid-cols-3 lg:flex lg:items-center lg:justify-between">
          {TRUST.map((t, i) => (
            <li key={t.label} className="flex items-center gap-3">
              {i > 0 && <span className="hidden h-6 w-px bg-white/10 lg:block" aria-hidden="true" />}
              <t.icon className="size-4 shrink-0 text-brand" aria-hidden="true" />
              <span className="text-sm text-white/70">{t.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ── 4. Métricas e capacidade (bento) ────────────────────────── */

export function CapacityBento() {
  return (
    <section id="plataforma" className="mx-auto w-full max-w-7xl scroll-mt-20 px-4 py-24 sm:px-6 lg:px-8">
      <Reveal>
        <SectionHeading
          eyebrow="Capacidade operacional"
          title="Estrutura pensada para volumes altos"
          description="Uma plataforma única para planejar, executar e auditar campanhas de comunicação, com visibilidade de ponta a ponta."
        />
      </Reveal>

      <div className="mt-12 grid gap-4 lg:grid-cols-3">
        <Reveal className="lg:col-span-2">
          <article className="h-full rounded-2xl border border-white/10 bg-gradient-to-br from-graphite to-ink p-6 shadow-elegant sm:p-8">
            <Gauge className="size-6 text-brand" aria-hidden="true" />
            <h3 className="mt-4 text-xl font-semibold text-white">Capacidade de grande volume</h3>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/60">
              O processamento é distribuído em lotes, com controle de ritmo e
              retomada automática. Campanhas com centenas de milhares de contatos
              são divididas e acompanhadas sem travar a operação.
            </p>
          </article>
        </Reveal>

        {[
          {
            icon: Activity,
            title: "Acompanhamento das campanhas",
            text: "Status por contato, progresso e fila de processamento sempre visíveis.",
          },
          {
            icon: Timer,
            title: "Atualização operacional",
            text: "Indicadores atualizados durante a execução, sem exportações manuais.",
          },
          {
            icon: UserCog,
            title: "Gestão de usuários",
            text: "Vários logins na mesma empresa, com perfis e permissões distintos.",
          },
          {
            icon: History,
            title: "Histórico centralizado",
            text: "Movimentações, agendamentos e alterações registrados por campanha.",
          },
          {
            icon: LineChart,
            title: "Relatórios de desempenho",
            text: "Envios, entregas, leituras, cliques e falhas consolidados por campanha.",
          },
        ].map((c, i) => (
          <Reveal key={c.title} delay={i * 60}>
            <article className="h-full rounded-2xl border border-white/10 bg-graphite p-6 transition-colors hover:border-brand/30">
              <c.icon className="size-5 text-brand" aria-hidden="true" />
              <h3 className="mt-4 text-base font-semibold text-white">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/60">{c.text}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ── 5. Como funciona ────────────────────────────────────────── */

const STEPS = [
  { icon: Upload, title: "Envie sua base de contatos", text: "Importe planilha ou CSV e mapeie as colunas antes de confirmar." },
  { icon: Wand2, title: "Configure sua campanha", text: "Escolha template, número de origem e as variáveis da mensagem." },
  { icon: TestTube2, title: "Teste e agende", text: "Envie para números de teste e defina data e hora de início." },
  { icon: Activity, title: "Acompanhe o processamento", text: "Veja progresso, enviados, entregues, pendentes e falhas." },
  { icon: FileBarChart, title: "Consulte o relatório final", text: "Indicadores consolidados, histórico e exportação dos dados." },
];

export function HowItWorks() {
  return (
    <section id="como-funciona" className="scroll-mt-20 border-y border-white/10 bg-graphite/40">
      <div className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="Como funciona"
            title="Da base de contatos ao relatório final"
            description="Cinco etapas objetivas, do preparo da base até a leitura dos resultados."
          />
        </Reveal>

        <ol className="mt-14 grid gap-6 lg:grid-cols-5">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.title} delay={i * 70} className="relative">
              <div className="h-full rounded-2xl border border-white/10 bg-ink p-6">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand/15 text-sm font-bold text-brand">
                    {i + 1}
                  </span>
                  <s.icon className="size-5 text-white/40" aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-white">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/60">{s.text}</p>
              </div>
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute -right-3 top-1/2 hidden -translate-y-1/2 text-white/20 lg:block"
                >
                  <ArrowRight className="size-5" />
                </span>
              )}
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ── 6. Recursos ─────────────────────────────────────────────── */

const FEATURES = [
  { icon: Upload, title: "Importação de contatos", text: "Planilhas .xlsx e .csv com mapeamento de colunas e validação prévia.", featured: true },
  { icon: Contact, title: "Normalização automática", text: "Padronização de números brasileiros, com DDI, DDD e nono dígito." },
  { icon: Filter, title: "Remoção de duplicados", text: "Contatos repetidos são identificados e descartados na importação." },
  { icon: TestTube2, title: "Números de teste", text: "Valide a mensagem em números próprios antes de liberar o disparo." },
  { icon: CalendarClock, title: "Agendamento de campanhas", text: "Defina data e hora de início com antecedência mínima segura.", featured: true },
  { icon: Activity, title: "Acompanhamento de status", text: "Enviado, entregue, lido, falha e pendente por contato." },
  { icon: BarChart3, title: "Métricas de envio", text: "Volumes e percentuais consolidados durante a execução." },
  { icon: FileBarChart, title: "Relatórios detalhados", text: "Resultados por campanha, com gráficos, funil e exportação.", featured: true },
  { icon: CreditCard, title: "Gestão de créditos", text: "Saldo por empresa, consumo por campanha e histórico de lançamentos." },
  { icon: Users, title: "Múltiplos usuários", text: "Vários logins acessando o mesmo painel da empresa." },
  { icon: KeyRound, title: "Perfis e permissões", text: "Cada usuário com o nível de acesso adequado à sua função." },
  { icon: History, title: "Histórico operacional", text: "Registro das ações e mudanças de status ao longo da campanha." },
];

export function Features() {
  return (
    <section id="recursos" className="mx-auto w-full max-w-7xl scroll-mt-20 px-4 py-24 sm:px-6 lg:px-8">
      <Reveal>
        <SectionHeading
          eyebrow="Recursos"
          title="Tudo o que a operação precisa em um painel"
          description="Recursos construídos a partir da rotina real de quem opera campanhas em grande volume."
        />
      </Reveal>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <Reveal key={f.title} delay={(i % 3) * 60}>
            <article
              className={cn(
                "group h-full rounded-2xl border p-6 transition-all duration-300 hover:-translate-y-1",
                f.featured
                  ? "border-brand/30 bg-gradient-to-br from-brand/10 to-graphite"
                  : "border-white/10 bg-graphite hover:border-white/20",
              )}
            >
              <span
                className={cn(
                  "grid size-10 place-items-center rounded-xl transition-colors",
                  f.featured ? "bg-brand/20 text-brand" : "bg-white/5 text-white/60 group-hover:text-brand",
                )}
              >
                <f.icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-base font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/60">{f.text}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ── 7. Demonstrações ────────────────────────────────────────── */

const SHOWCASE = [
  {
    eyebrow: "Gestão de campanhas",
    title: "Todas as campanhas em uma lista só",
    text: "Acompanhe campanhas recentes com status padronizado, quantidade de contatos, progresso e agendamento — sem depender de planilhas paralelas.",
    bullets: ["Campanhas recentes", "Status padronizado", "Quantidade e progresso", "Agendamento visível"],
    mock: <CampaignsMock />,
  },
  {
    eyebrow: "Acompanhamento em tempo real",
    title: "Veja o disparo acontecendo",
    text: "Durante o processamento, enviados, entregues, falhas e pendentes são atualizados junto com a barra de progresso da campanha.",
    bullets: ["Enviados e entregues", "Falhas e pendentes", "Barra de progresso", "Atualização contínua"],
    mock: <RealtimeMock />,
  },
  {
    eyebrow: "Relatórios",
    title: "Resultados prontos para apresentar",
    text: "Indicadores consolidados, gráfico de desempenho, funil de entrega e histórico da campanha em uma página só.",
    bullets: ["Indicadores consolidados", "Gráfico de desempenho", "Funil de entrega", "Histórico da campanha"],
    mock: <ReportsMock />,
  },
  {
    eyebrow: "Gestão de equipe",
    title: "Vários usuários, um só painel",
    text: "Cadastre a equipe da empresa com logins individuais, defina perfis de acesso e acompanhe quem está ativo.",
    bullets: ["Usuários da empresa", "Perfis de acesso", "Status do usuário", "Permissões por função"],
    mock: <TeamMock />,
  },
];

export function Showcase() {
  return (
    <section aria-label="Demonstração da plataforma" className="border-y border-white/10 bg-graphite/40">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-24 px-4 py-24 sm:px-6 lg:px-8">
        {SHOWCASE.map((s, i) => (
          <div
            key={s.title}
            className={cn(
              "grid items-center gap-10 lg:grid-cols-2",
              i % 2 === 1 && "lg:[&>*:first-child]:order-2",
            )}
          >
            <Reveal>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">{s.eyebrow}</p>
              <h3 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">{s.title}</h3>
              <p className="mt-4 text-base leading-relaxed text-white/60">{s.text}</p>
              <ul className="mt-6 grid gap-2 sm:grid-cols-2">
                {s.bullets.map((b) => (
                  <li key={b} className="flex items-center gap-2 text-sm text-white/70">
                    <Check className="size-4 shrink-0 text-brand" aria-hidden="true" />
                    {b}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={80}>{s.mock}</Reveal>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── 8. Comparativo ──────────────────────────────────────────── */

export function Comparison() {
  const before = [
    "Informações espalhadas",
    "Atualizações manuais",
    "Pouca visibilidade",
    "Dificuldade de acompanhar demandas",
    "Histórico desorganizado",
  ];
  const after = [
    "Operação centralizada",
    "Status padronizados",
    "Informações em tempo real",
    "Relatórios organizados",
    "Usuários e permissões",
    "Histórico completo",
  ];
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <Reveal>
        <SectionHeading
          eyebrow="Comparativo"
          title="Antes e depois da centralização"
          description="A diferença entre coordenar a operação por mensagens e planilhas ou dentro de uma plataforma."
        />
      </Reveal>

      <div className="mt-12 grid gap-4 lg:grid-cols-2">
        <Reveal>
          <div className="h-full rounded-2xl border border-white/10 bg-graphite p-6 sm:p-8">
            <h3 className="text-lg font-semibold text-white/80">Operação descentralizada</h3>
            <ul className="mt-6 space-y-3">
              {before.map((b) => (
                <li key={b} className="flex items-start gap-3 text-sm text-white/55">
                  <Minus className="mt-0.5 size-4 shrink-0 text-white/30" aria-hidden="true" />
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
        <Reveal delay={80}>
          <div className="h-full rounded-2xl border border-brand/30 bg-gradient-to-br from-brand/10 to-graphite p-6 shadow-elegant sm:p-8">
            <h3 className="text-lg font-semibold text-white">Com a Next Disparos</h3>
            <ul className="mt-6 space-y-3">
              {after.map((b) => (
                <li key={b} className="flex items-start gap-3 text-sm text-white/80">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ── 9. Para quem é ──────────────────────────────────────────── */

const AUDIENCE = [
  { icon: Building2, title: "Agências", text: "Gerenciam campanhas de vários clientes com histórico separado por conta." },
  { icon: ClipboardList, title: "Operações comerciais", text: "Coordenam comunicações recorrentes com acompanhamento por etapa." },
  { icon: Database, title: "Grandes volumes", text: "Empresas que precisam processar bases extensas em janelas definidas." },
  { icon: Store, title: "Revendedores", text: "Organizam demandas, créditos e entregas em um painel único." },
  { icon: Users, title: "Equipes com múltiplos usuários", text: "Vários logins na mesma empresa, cada um com seu perfil de acesso." },
  { icon: FileBarChart, title: "Quem precisa de relatórios", text: "Operações que dependem de indicadores organizados para prestar contas." },
];

export function Audience() {
  return (
    <section className="border-y border-white/10 bg-graphite/40">
      <div className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="Para quem é"
            title="Feita para operações que precisam de controle"
            description="Perfis que se beneficiam de centralizar campanhas, usuários e relatórios."
          />
        </Reveal>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AUDIENCE.map((a, i) => (
            <Reveal key={a.title} delay={(i % 3) * 60}>
              <article className="h-full rounded-2xl border border-white/10 bg-ink p-6 transition-colors hover:border-brand/30">
                <a.icon className="size-5 text-brand" aria-hidden="true" />
                <h3 className="mt-4 text-base font-semibold text-white">{a.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/60">{a.text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── 10. Segurança e controle ────────────────────────────────── */

const SECURITY = [
  { icon: Lock, title: "Acesso autenticado", text: "Cada usuário entra com login e senha próprios." },
  { icon: Building2, title: "Separação por empresa", text: "Os dados de cada conta ficam restritos ao seu painel." },
  { icon: KeyRound, title: "Perfis e permissões", text: "O nível de acesso define o que cada pessoa pode fazer." },
  { icon: History, title: "Histórico de movimentações", text: "Alterações e lançamentos ficam registrados." },
  { icon: UserCog, title: "Gestão de usuários", text: "Inclusão, edição e desativação de acessos pela empresa." },
  { icon: ShieldCheck, title: "Controle administrativo", text: "Aprovações e acompanhamento das demandas pela administração." },
  { icon: Database, title: "Dados centralizados", text: "Campanhas, contatos e relatórios em um único lugar." },
];

export function Security() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <Reveal>
        <SectionHeading
          eyebrow="Segurança e controle"
          title="Acesso controlado, operação rastreável"
          align="left"
          description="Recursos de controle disponíveis hoje na plataforma — sem promessas que o sistema não cumpre."
        />
      </Reveal>
      <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
        {SECURITY.map((s) => (
          <article key={s.title} className="bg-ink p-6">
            <s.icon className="size-5 text-white/50" aria-hidden="true" />
            <h3 className="mt-4 text-base font-semibold text-white">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/55">{s.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ── 11. FAQ ─────────────────────────────────────────────────── */

const FAQ = [
  {
    q: "Como funciona a criação de uma campanha?",
    a: "Você importa a base de contatos, escolhe o template e o número de origem, revisa a mensagem e envia a campanha para processamento.",
  },
  {
    q: "Posso agendar um disparo?",
    a: "Sim. Ao configurar a campanha você define data e hora de início, com uma antecedência mínima para preparo e validação.",
  },
  {
    q: "É possível testar antes de enviar?",
    a: "Sim. É possível enviar a mensagem para números de teste e conferir o conteúdo antes de liberar o disparo para toda a base.",
  },
  {
    q: "Como funciona o saldo de créditos?",
    a: "Cada conta possui um saldo de créditos que é consumido conforme as mensagens são processadas. O saldo e o histórico ficam visíveis no painel.",
  },
  {
    q: "Posso adicionar outros usuários?",
    a: "Sim. A mesma empresa pode ter vários usuários, cada um com login próprio e perfil de acesso definido.",
  },
  {
    q: "Quando o relatório fica disponível?",
    a: "Os indicadores são atualizados durante o processamento e o relatório completo fica disponível ao final da campanha.",
  },
  {
    q: "Como acompanho o status da campanha?",
    a: "Na página da campanha você vê progresso, enviados, entregues, pendentes e falhas, além do histórico de atividades.",
  },
  {
    q: "Como entro em contato com o suporte?",
    a: "Pelo WhatsApp de atendimento disponível no site e no rodapé desta página.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 border-y border-white/10 bg-graphite/40">
      <div className="mx-auto w-full max-w-3xl px-4 py-24 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading eyebrow="Perguntas frequentes" title="Dúvidas comuns" />
        </Reveal>
        <Reveal delay={80} className="mt-10 block">
          <Accordion type="single" collapsible className="w-full">
            {FAQ.map((f, i) => (
              <AccordionItem key={f.q} value={`item-${i}`} className="border-white/10">
                <AccordionTrigger className="text-left text-base text-white hover:text-brand">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-white/60">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}

/* ── 12. CTA final ───────────────────────────────────────────── */

export function FinalCta() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 size-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/10 blur-3xl"
      />
      <div className="relative mx-auto w-full max-w-3xl px-4 py-28 text-center sm:px-6 lg:px-8">
        <Reveal>
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Pronto para centralizar sua operação?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/65">
            Gerencie campanhas, acompanhe resultados e tenha mais controle sobre
            cada etapa.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={SITE_CONTACT.whatsappUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-ink shadow-elegant transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:w-auto"
            >
              <MessageCircle className="size-4" aria-hidden="true" />
              Falar com especialista
            </a>
            <a
              href={SITE_CONTACT.panelUrl}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:w-auto"
            >
              <Play className="size-4" aria-hidden="true" />
              Acessar plataforma
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export const _unusedIcons = { Send, Repeat, ListChecks };
