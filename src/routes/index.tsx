import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Menu,
  X,
  MessageCircle,
  ShieldCheck,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  Check,
  Plus,
  Minus,
  Circle,
  ZoomIn,
  Play,
  ImageIcon,
  Users,
  Send,
  CheckCircle2,
  XCircle,
  MousePointerClick,
  Globe2,
  MapPin,
  Headphones,
} from "lucide-react";

import logoAsset from "@/assets/disparos-fr-logo-new.png.asset.json";

// ============ CONFIG ============
const WHATSAPP_NUMBER = "5562933003970"; // editar aqui

// ============ REAL SCREENSHOTS ============
import painelLoteriaJb from "@/assets/painel-loteriajb.png.asset.json";
import painelLoteriaJbMobile from "@/assets/painel-loteriajb-mobile.png.asset.json";
import editorMensagem from "@/assets/editor-mensagem-painel.png.asset.json";
// Substitua os valores abaixo pelas URLs das capturas reais do painel Disparos FR.
// Enquanto vazios, a interface mostra placeholders identificados.
const SCREENSHOTS = {
  heroPanel: painelLoteriaJb.url, // Painel principal — dobra do hero (grande destaque)
  heroPanelMobile: painelLoteriaJbMobile.url,
  msgConfig: editorMensagem.url, // Aba 1 — Mensagem configurada (editor da campanha)
  msgReceived: "", // Aba 2 — Mensagem recebida (print do WhatsApp do contato)
  campaignRunning: "", // Aba 3 — Campanha em execução (progresso ao vivo)
  finalReport: painelLoteriaJb.url, // Relatório final ao encerrar a campanha
  finalReportMobile: painelLoteriaJbMobile.url,
  caseStudy: painelLoteriaJb.url, // Estudo de caso — captura do painel do caso real
  caseStudyMobile: painelLoteriaJbMobile.url,
};

// Vídeo/gravação de tela opcional. Deixe src vazio para ocultar o player.
const CAMPAIGN_VIDEO: { src: string; poster: string; caption: string } = {
  src: "", // ex: "/videos/campanha-execucao.mp4"
  poster: "", // ex: "/covers/campanha-execucao.jpg"
  caption: "Gravação real de uma campanha em execução no painel Disparos FR.",
};

// Indicadores editáveis do relatório final. Substitua pelos números reais quando disponíveis.
const FINAL_REPORT_METRICS: { k: string; v: string }[] = [
  { k: "Contatos processados", v: "300.000" },
  { k: "Mensagens enviadas", v: "285.417" },
  { k: "Mensagens entregues", v: "274.119" },
  { k: "Falhas", v: "14.583" },
  { k: "Cliques totais", v: "19.688" },
];


// Estudo de caso real — preencha com dados comprováveis.
const CASE_STUDY = {
  segment: "Segmento do cliente",
  title: "Título do caso real",
  context:
    "Descreva brevemente o contexto: objetivo da campanha, base utilizada e período de execução.",
  metrics: [
    { k: "Contatos", v: "—" },
    { k: "Entregues", v: "—" },
    { k: "Taxa de entrega", v: "—" },
  ],
};


// ============ META PIXEL ============
type PixelEvent =
  | "PageView"
  | "ClickPrimaryCTA"
  | "StartSimulation"
  | "SelectVolume"
  | "StartForm"
  | "CompleteForm"
  | "ClickWhatsApp";

function trackPixel(event: PixelEvent, data?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  // eslint-disable-next-line no-console
  console.debug("[pixel]", event, data ?? {});
  const w = window as unknown as { fbq?: (...args: unknown[]) => void };
  if (typeof w.fbq === "function") w.fbq("trackCustom", event, data ?? {});
}

// ============ PRICING ============
// Faixas comerciais reais — o preço de R$0,13 é exclusivo para 250k+ contatos.
const TIERS = [
  { min: 2_000, max: 9_999, price: 0.32, label: "2 mil a 10 mil" },
  { min: 10_000, max: 49_999, price: 0.27, label: "10 mil a 50 mil" },
  { min: 50_000, max: 99_999, price: 0.22, label: "50 mil a 100 mil" },
  { min: 100_000, max: 249_999, price: 0.19, label: "100 mil a 250 mil" },
  { min: 250_000, max: Infinity, price: 0.13, label: "Acima de 250 mil" },
] as const;

const PRESETS = [2_000, 10_000, 50_000, 100_000, 250_000, 500_000];

function priceFor(volume: number) {
  const tier = TIERS.find((t) => volume >= t.min && volume <= t.max) ?? TIERS[0];
  return { price: tier.price, tier };
}

const SEGMENTS = [
  "Financeiro",
  "Varejo",
  "Serviços",
  "Infoprodutos",
  "Eventos",
  "Telecomunicações",
  "Outro",
];

const START_OPTIONS = [
  "O mais rápido possível",
  "Nesta semana",
  "Nos próximos 15 dias",
  "Apenas pesquisando",
];



function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function formatInt(v: number) {
  return v.toLocaleString("pt-BR");
}

function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10)
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openWhatsApp(message?: string) {
  trackPixel("ClickWhatsApp");
  const url = `https://wa.me/${WHATSAPP_NUMBER}${
    message ? `?text=${encodeURIComponent(message)}` : ""
  }`;
  window.open(url, "_blank", "noopener,noreferrer");
}

// ============ ROUTE ============
export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      {
        title:
          "Disparos FR — Campanhas de WhatsApp pela API Oficial para bases 2k+",
      },
      {
        name: "description",
        content:
          "Estrutura, segmentação e acompanhamento em tempo real para empresas que precisam alcançar milhares de clientes pelo WhatsApp Oficial.",
      },
      {
        property: "og:title",
        content: "Disparos FR — WhatsApp em escala pela API Oficial",
      },
      {
        property: "og:description",
        content:
          "Simule o volume, veja o valor por envio e receba a proposta pelo WhatsApp.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

// ============ PAGE ============
function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    trackPixel("PageView");
  }, []);

  return (
    <div className="min-h-screen bg-[#0b0c0e] text-neutral-100 font-sans antialiased selection:bg-emerald-500/20 selection:text-white">
      <Header menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
      <main>
        <Hero />
        <Metrics />
        <HowItWorks />
        <CampaignInAction />
        <SimulatorSection />
        <FinalReport />
        <CaseStudy />
        <Compare />
        <FAQ />
        <FinalCTA />
      </main>

      <Footer />
      <MobileStickyCTA />
    </div>
  );
}

// ============ SHARED PRIMITIVES ============
const container = "mx-auto w-full max-w-6xl px-5 sm:px-6";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-400">
      <span className="h-px w-6 bg-neutral-700" />
      {children}
    </div>
  );
}

function SectionHead({
  eyebrow,
  title,
  lead,
  align = "left",
}: {
  eyebrow: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  align?: "left" | "center";
}) {
  return (
    <div
      className={
        align === "center"
          ? "mx-auto max-w-2xl text-center"
          : "max-w-2xl"
      }
    >
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-4 text-3xl sm:text-4xl font-semibold tracking-tight text-white leading-[1.1]">
        {title}
      </h2>
      {lead && (
        <p className="mt-4 text-[15px] leading-relaxed text-neutral-400">
          {lead}
        </p>
      )}
    </div>
  );
}

// ============ HEADER ============
function Header({
  menuOpen,
  setMenuOpen,
}: {
  menuOpen: boolean;
  setMenuOpen: (v: boolean) => void;
}) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const links = [
    { label: "Como funciona", id: "como-funciona" },
    { label: "Simulador", id: "simulador" },
    { label: "Painel", id: "painel" },
    { label: "Dúvidas", id: "faq" },
  ];
  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors ${
        scrolled
          ? "bg-[#0b0c0e]/85 backdrop-blur border-b border-white/5"
          : "bg-transparent"
      }`}
    >
      <div className={`${container} flex h-16 items-center justify-between`}>
        <a href="#top" className="flex items-center gap-2" aria-label="Disparos FR">
          <img src={logoAsset.url} alt="Disparos FR" className="h-7 w-auto" />
        </a>
        <nav className="hidden md:flex items-center gap-7 text-sm text-neutral-300">
          {links.map((l) => (
            <button
              key={l.id}
              onClick={() => scrollToId(l.id)}
              className="hover:text-white transition-colors"
            >
              {l.label}
            </button>
          ))}
        </nav>
        <div className="hidden md:flex items-center gap-3">
          <button
            onClick={() =>
              openWhatsApp("Olá! Vim do site da Disparos FR e quero falar com um especialista.")
            }
            className="text-sm text-neutral-300 hover:text-white transition-colors"
          >
            Falar com um especialista
          </button>
          <button
            onClick={() => {
              trackPixel("ClickPrimaryCTA", { source: "header" });
              openWhatsApp(
                "Olá! Quero simular uma campanha de WhatsApp pela Disparos FR."
              );
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400 transition-colors"
          >
            Simular minha campanha
          </button>
        </div>
        <button
          className="md:hidden p-2 -mr-2 text-white"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Menu"
        >
          {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>
      {menuOpen && (
        <div className="md:hidden border-t border-white/5 bg-[#0b0c0e] px-5 py-4 space-y-3">
          {links.map((l) => (
            <button
              key={l.id}
              onClick={() => {
                setMenuOpen(false);
                setTimeout(() => scrollToId(l.id), 50);
              }}
              className="block w-full text-left py-2 text-neutral-300"
            >
              {l.label}
            </button>
          ))}
          <button
            onClick={() => {
              setMenuOpen(false);
              trackPixel("ClickPrimaryCTA", { source: "mobile-menu" });
              openWhatsApp(
                "Olá! Quero simular uma campanha de WhatsApp pela Disparos FR."
              );
            }}
            className="mt-2 block w-full rounded-full bg-emerald-500 px-4 py-3 text-sm font-medium text-neutral-950"
          >
            Simular minha campanha
          </button>
        </div>
      )}
    </header>
  );
}

// ============ HERO ============
// ============ PAINEL REAL CARD ============
type PainelVariant = "live" | "finished";
function PainelRealCard({ variant = "live" }: { variant?: PainelVariant }) {
  const finished = variant === "finished";
  const total = 300000;
  const sent = 285417;
  const delivered = 274119;
  const failed = 14583;
  const clicks = 19688;
  const percent = (sent / total) * 100;

  const metrics = [
    { k: "Contatos", v: formatInt(total), Icon: Users, tone: "text-neutral-300" },
    { k: "Enviados", v: formatInt(sent), Icon: Send, tone: "text-emerald-400" },
    { k: "Entregues", v: formatInt(delivered), Icon: CheckCircle2, tone: "text-emerald-400" },
    { k: "Falhas", v: formatInt(failed), Icon: XCircle, tone: "text-rose-400" },
  ];

  return (
    <div className="relative rounded-[22px] border border-white/[0.08] bg-[#101216] p-5 sm:p-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/25 bg-emerald-500/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Painel real
          </span>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium ${
            finished
              ? "border border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-400"
              : "border border-white/10 bg-white/[0.04] text-neutral-300"
          }`}
        >
          {finished ? (
            <>
              <CheckCircle2 className="h-3 w-3" /> Concluída
            </>
          ) : (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Em execução
            </>
          )}
        </span>
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-3">
        <h3 className="text-[20px] font-semibold text-white tracking-tight">Campanha Julho</h3>
      </div>
      <div className="text-[12px] text-neutral-500">
        {finished ? "Finalizada em 23/07/2026 22:16" : "Atualizado há 22 segundos"}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2.5">
        {metrics.map(({ k, v, Icon, tone }) => (
          <div
            key={k}
            className="rounded-xl border border-white/[0.06] bg-[#0b0d10] p-3.5"
          >
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-neutral-500">
              <Icon className={`h-3 w-3 ${tone}`} />
              {k}
            </div>
            <div className="mt-1.5 text-[20px] font-semibold text-white tabular-nums">
              {v}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between text-[11px] text-neutral-400">
          <span>Progresso</span>
          <span className="tabular-nums text-emerald-400 font-semibold">
            {percent.toFixed(2)}%
          </span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        {[
          { k: "Cliques totais", v: formatInt(clicks), Icon: MousePointerClick },
          { k: "Países", v: "5", Icon: Globe2 },
          { k: "Cidades", v: "20", Icon: MapPin },
        ].map(({ k, v, Icon }) => (
          <div
            key={k}
            className="rounded-lg border border-white/[0.05] bg-[#0b0d10] p-3"
          >
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-neutral-500">
              <Icon className="h-3 w-3" />
              {k}
            </div>
            <div className="mt-1 text-[15px] font-semibold text-white tabular-nums">{v}</div>
          </div>
        ))}
      </div>

      <button
        onClick={() =>
          openWhatsApp("Olá! Quero ver o relatório completo de uma campanha real.")
        }
        className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[13px] font-medium text-neutral-100 hover:bg-white/[0.06] transition-colors"
      >
        Ver relatório completo
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function Hero() {
  return (

    <section id="top" className="relative pt-28 sm:pt-32 pb-16 sm:pb-24">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[420px] pointer-events-none"
        style={{
          background:
            "radial-gradient(60% 60% at 70% 0%, rgba(255,255,255,0.04), transparent 70%)",
        }}
      />
      <div className={`${container} relative grid lg:grid-cols-12 gap-10 lg:gap-14 items-start`}>
        <div className="lg:col-span-5 lg:pt-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-neutral-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Para bases a partir de 2 mil contatos
          </div>
          <h1 className="mt-5 text-[34px] sm:text-5xl lg:text-[56px] font-semibold tracking-tight leading-[1.05] text-white">
            Envie campanhas para sua base pelo{" "}
            <span className="whitespace-nowrap">WhatsApp Oficial</span>
          </h1>
          <p className="mt-4 text-lg">
            <span className="font-semibold text-emerald-400">
              A partir de R$ 0,13 por envio
            </span>
          </p>
          <p className="mt-1 text-[13px] text-neutral-500">
            Para volumes acima de 250 mil contatos.
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-neutral-300 max-w-lg">
            Você envia a base. Nós configuramos a campanha e você acompanha tudo em tempo real.
          </p>

          <div className="mt-7 flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => {
                trackPixel("ClickPrimaryCTA", { source: "hero" });
                openWhatsApp(
                  "Olá! Quero simular uma campanha de WhatsApp pela Disparos FR."
                );
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3.5 text-[15px] font-medium text-neutral-950 hover:bg-emerald-400 transition-colors"
            >
              Simular minha campanha
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => scrollToId("como-funciona")}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-6 py-3.5 text-[15px] font-medium text-neutral-100 hover:bg-white/[0.05] transition-colors"
            >
              Ver como funciona
            </button>
          </div>

          <ul className="mt-8 grid grid-cols-3 gap-3 max-w-md">
            {[
              { Icon: ShieldCheck, label: "Simulação gratuita" },
              { Icon: CheckCircle2, label: "Sem compromisso" },
              { Icon: Headphones, label: "Atendimento humano" },
            ].map(({ Icon, label }) => (
              <li key={label} className="flex flex-col items-start gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-400">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-[12px] leading-tight text-neutral-300">{label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:col-span-7 relative">
          <div
            aria-hidden
            className="absolute -inset-6 -z-10 rounded-[32px] blur-3xl opacity-40"
            style={{
              background:
                "radial-gradient(60% 50% at 70% 30%, rgba(16,185,129,0.35), transparent 70%)",
            }}
          />
          <PainelRealCard variant="live" />
        </div>

      </div>
    </section>
  );
}


// ============ DASHBOARD MOCK (realistic) ============
function DashboardMock({ compact = false }: { compact?: boolean }) {
  // Dados intencionalmente não-redondos.
  const total = 48_732;
  const [sent, setSent] = useState(37_849);
  const delivered = 35_971;
  const failed = 1_878;
  const rate = 95.0;
  const progress = Math.round((sent / total) * 1000) / 10; // 77.7

  useEffect(() => {
    const id = setInterval(() => {
      setSent((s) => (s < 38_400 ? s + 7 : s));
    }, 900);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative">
      <div className="relative overflow-hidden rounded-2xl border border-white/8 bg-[#101216] shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)]">
        {/* window chrome */}
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
          </div>
          <div className="text-[11px] text-neutral-500 font-mono">
            painel.disparosfr.com
          </div>
          <span className="text-[10px] uppercase tracking-widest text-neutral-600">
            Demonstração
          </span>
        </div>

        <div className="p-5 sm:p-6">
          {/* header row */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                Campanha
              </div>
              <div className="mt-1 flex items-center gap-2 text-[15px] font-medium text-white truncate">
                Lançamento Julho
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Em execução
                </span>
              </div>
              <div className="mt-1 text-[12px] text-neutral-500">
                Iniciada 12/07 · 09:14 · Segmentado SP/RJ/MG
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-1 rounded-md border border-white/8 bg-white/[0.02] p-0.5 text-[11px] text-neutral-400">
              <span className="rounded px-2 py-1 bg-white/[0.06] text-white">
                Hoje
              </span>
              <span className="px-2 py-1">7d</span>
              <span className="px-2 py-1">30d</span>
            </div>
          </div>

          {/* KPIs */}
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Kpi label="Contatos" value={formatInt(total)} />
            <Kpi label="Enviados" value={formatInt(sent)} />
            <Kpi label="Entregues" value={formatInt(delivered)} accent />
            <Kpi label="Falhas" value={formatInt(failed)} muted />
          </div>

          {/* progress */}
          <div className="mt-5">
            <div className="flex items-baseline justify-between">
              <div className="text-[12px] text-neutral-400">
                Progresso da campanha
              </div>
              <div className="text-[13px] font-medium text-white">
                {progress.toFixed(1).replace(".", ",")}%
              </div>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-[width] duration-700 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-500">
              <span>Velocidade média · 78,9 msg/min</span>
              <span>Atualizado há 12 segundos</span>
            </div>
          </div>

          {/* mini list */}
          {!compact && (
            <div className="mt-6 rounded-xl border border-white/6 bg-white/[0.015]">
              <div className="px-4 py-2.5 text-[11px] uppercase tracking-widest text-neutral-500 border-b border-white/5">
                Campanhas recentes
              </div>
              <MiniRow
                name="Lançamento Julho"
                meta="48.732 contatos · 95,0% entrega"
                status="Em execução"
                tone="emerald"
              />
              <MiniRow
                name="Reativação SP"
                meta="21.410 contatos · 93,4% entrega"
                status="Concluída"
                tone="muted"
              />
              <MiniRow
                name="Base premium 12/26"
                meta="9.870 contatos · pausada"
                status="Atenção"
                tone="warn"
              />
            </div>
          )}
          {compact && (
            <div className="mt-6 grid grid-cols-3 gap-2 text-[11px] text-neutral-400">
              <MiniStat k="Taxa entrega" v="95,0%" />
              <MiniStat k="Iniciada" v="12/07 09:14" />
              <MiniStat k="Última msg" v="há 12 s" />
            </div>
          )}
        </div>
      </div>
      <p className="mt-3 text-[11px] text-neutral-500 flex items-center gap-1.5">
        <Circle className="h-2 w-2 fill-neutral-600 text-neutral-600" />
        Demonstração da plataforma. Dados ilustrativos.
      </p>
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
  muted,
}: {
  label: string;
  value: string;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/6 bg-white/[0.02] p-3">
      <div className="text-[10px] uppercase tracking-widest text-neutral-500">
        {label}
      </div>
      <div
        className={`mt-1 text-[17px] font-semibold tabular-nums ${
          accent
            ? "text-emerald-400"
            : muted
              ? "text-neutral-400"
              : "text-white"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function MiniStat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md border border-white/6 bg-white/[0.02] px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-neutral-500">
        {k}
      </div>
      <div className="text-white text-[12px] font-medium mt-0.5">{v}</div>
    </div>
  );
}

function MiniRow({
  name,
  meta,
  status,
  tone,
}: {
  name: string;
  meta: string;
  status: string;
  tone: "emerald" | "muted" | "warn";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
      : tone === "warn"
        ? "text-amber-300 bg-amber-500/10 border-amber-500/20"
        : "text-neutral-400 bg-white/5 border-white/10";
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/5 last:border-b-0">
      <div className="min-w-0">
        <div className="text-[13px] text-white truncate">{name}</div>
        <div className="text-[11px] text-neutral-500 truncate">{meta}</div>
      </div>
      <span
        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${toneClass}`}
      >
        {status}
      </span>
    </div>
  );
}

// ============ METRICS strip ============
function Metrics() {
  const items = [
    { n: "2k – 500k+", t: "Contatos por campanha" },
    { n: "API Oficial", t: "WhatsApp Business Platform" },
    { n: "Tempo real", t: "Acompanhamento de envios" },
    { n: "Atendimento", t: "Especialista dedicado" },
  ];
  return (
    <section className="border-y border-white/5 bg-white/[0.015]">
      <div className={`${container} grid grid-cols-2 md:grid-cols-4 divide-y divide-x divide-white/5 md:divide-y-0 -mx-px`}>
        {items.map((i) => (
          <div key={i.t} className="px-5 py-6 sm:px-6 sm:py-7">
            <div className="text-[18px] sm:text-[22px] font-semibold text-white tracking-tight">
              {i.n}
            </div>
            <div className="mt-1.5 text-[12px] text-neutral-500 leading-relaxed">{i.t}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ============ HOW IT WORKS ============
function HowItWorks() {
  const steps: { t: string; d: string; Visual: React.FC }[] = [
    {
      t: "Envie sua base ou escolha seus leads",
      d: "Você pode utilizar sua própria lista de contatos ou solicitar leads segmentados por cidade com nossa equipe.",
      Visual: VizUpload,
    },
    {
      t: "Defina o objetivo e o destino da campanha",
      d: "Você escolhe para onde deseja direcionar o público: seu site, WhatsApp, landing page, página de vendas, checkout ou outro link.",
      Visual: VizTarget,
    },
    {
      t: "Montamos sua campanha",
      d: "Configuramos o número de envio, a identidade comercial, a mensagem, o botão e a segmentação por cidade ou DDD.",
      Visual: VizBuild,
    },
    {
      t: "Você aprova antes de começar",
      d: "Apresentamos o texto, o criativo, o botão e o destino da campanha para sua validação antes do envio para aprovação da Meta.",
      Visual: VizApprove,
    },
    {
      t: "Iniciamos os disparos",
      d: "Após a aprovação, os envios começam pela API Oficial do WhatsApp, com controle de velocidade e novas tentativas automáticas em caso de falha.",
      Visual: VizDispatch,
    },
    {
      t: "Acompanhe os resultados em tempo real",
      d: "Você visualiza no painel os envios, entregas, falhas e cliques, acompanhando o desempenho da campanha em tempo real.",
      Visual: VizMonitor,
    },
  ];

  // Imperative activation via data-active attr — zero re-renders on scroll.
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // With reduced motion, mark all as active once and skip the observer.
    if (reduce) {
      itemRefs.current.forEach((el) => el?.setAttribute("data-active", "true"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          (e.target as HTMLElement).dataset.active = e.isIntersecting ? "true" : "false";
        }
      },
      { threshold: 0.45, rootMargin: "-15% 0px -25% 0px" }
    );
    itemRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <section
      id="como-funciona"
      className="relative bg-[#0b0c0e] text-neutral-100 py-20 sm:py-28 border-y border-white/[0.05]"
    >
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent"
      />
      <div className={container}>
        <div className="max-w-2xl">
          <Eyebrow>Como funciona</Eyebrow>
          <h2 className="mt-4 text-3xl sm:text-4xl font-semibold tracking-tight text-white leading-[1.1]">
            Da base ao resultado, em seis etapas claras.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-neutral-400 max-w-xl">
            Passe o olho pelas animações — quem já entende avança rápido, quem
            tem dúvida vê o processo antes de continuar.
          </p>
        </div>

        <ol className="hiw mt-12 relative max-w-3xl mx-auto">
          <div
            aria-hidden
            className="absolute left-[19px] top-2 bottom-2 w-px bg-gradient-to-b from-emerald-500/40 via-white/10 to-transparent"
          />
          {steps.map((s, i) => {
            const Visual = s.Visual;
            return (
              <li
                key={i}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                data-active="false"
                className="hiw-item group/step relative pl-14 pb-8 last:pb-0"
                style={{ contentVisibility: "auto", containIntrinsicSize: "1px 200px" }}
              >
                <div className="hiw-badge absolute left-0 top-0 grid h-10 w-10 place-items-center rounded-full text-[14px] font-semibold ring-4 ring-[#0b0c0e]">
                  {i + 1}
                </div>
                <div className="hiw-card rounded-xl border bg-white/[0.02] p-5">
                  <div className="grid gap-5 sm:grid-cols-[1fr_180px] sm:items-center">
                    <div>
                      <div className="text-[15px] font-semibold text-white">{s.t}</div>
                      <p className="mt-1.5 text-[13.5px] leading-relaxed text-neutral-400">
                        {s.d}
                      </p>
                    </div>
                    <div className="hiw-viz h-[112px] rounded-lg border border-white/[0.05] bg-[#0f1114] overflow-hidden relative">
                      <Visual />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-12 grid md:grid-cols-2 gap-4 max-w-3xl mx-auto">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
            <div className="text-[11px] uppercase tracking-widest text-neutral-500">
              Base própria
            </div>
            <div className="mt-2 text-[16px] font-semibold text-white">
              Você já tem os contatos
            </div>
            <p className="mt-2 text-[14px] leading-relaxed text-neutral-400">
              Envie sua base própria com contatos que autorizaram receber
              comunicações. Sem custo adicional por lead.
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.05] p-6">
            <div className="text-[11px] uppercase tracking-widest text-emerald-400">
              Fornecemos a base
            </div>
            <div className="mt-2 text-[16px] font-semibold text-white">
              Precisa dos leads? Cuidamos disso.
            </div>
            <p className="mt-2 text-[14px] leading-relaxed text-neutral-300">
              Fornecimento de leads segmentados por{" "}
              <span className="font-semibold text-white">R$ 0,09 por contato</span>{" "}
              adicionais ao valor do disparo. Disponibilidade e segmentação
              sujeitas à análise.
            </p>
          </div>
        </div>
      </div>
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent"
      />
      <HowItWorksStyles />
    </section>
  );
}

// One shared stylesheet: all animations use transform/opacity only (GPU-friendly).
// Play state is toggled via [data-active="true"] so offscreen items don't paint.
function HowItWorksStyles() {
  return (
    <style>{`
.hiw-badge{background:rgba(255,255,255,.06);color:#a3a3a3;transition:transform .5s cubic-bezier(.2,.7,.2,1),background-color .5s,color .5s,box-shadow .5s;will-change:transform}
.hiw-card{border-color:rgba(255,255,255,.06);transition:border-color .4s}
.hiw-card:hover{border-color:rgba(16,185,129,.2)}
.hiw-item[data-active="true"] .hiw-badge{background:#10b981;color:#0a0a0a;transform:scale(1.1);box-shadow:0 10px 24px -6px rgba(16,185,129,.7)}
.hiw-item[data-active="true"] .hiw-card{border-color:rgba(16,185,129,.3)}
.hiw-viz *{backface-visibility:hidden}
/* animations paused offscreen — no compositor work when hidden */
.hiw-item[data-active="false"] .hiw-viz *{animation-play-state:paused!important}

/* Upload */
.viz-drop{position:absolute;inset-inline:0;bottom:0;height:2.5rem;border:1px dashed rgba(16,185,129,.4);border-radius:.375rem;background:rgba(16,185,129,.04)}
.viz-pkt{position:absolute;left:50%;top:0;width:4rem;height:1.5rem;border-radius:.125rem;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);display:flex;align-items:center;gap:.375rem;padding:0 .5rem;opacity:0;will-change:transform,opacity;transform:translate3d(-50%,-10px,0)}
.hiw-item[data-active="true"] .viz-pkt{animation:viz-fall 2.4s ease-in infinite}
.viz-pkt:nth-child(3){animation-delay:.5s}
.viz-pkt:nth-child(4){animation-delay:1s}
@keyframes viz-fall{0%{transform:translate3d(-50%,-10px,0);opacity:0}20%{opacity:1}70%{transform:translate3d(-50%,44px,0);opacity:1}100%{transform:translate3d(-50%,44px,0);opacity:0}}

/* Target */
.viz-tgt-ring{position:absolute;inset:0;border-radius:9999px;border:2px solid rgba(16,185,129,.4);will-change:transform,opacity;transform:scale(1);opacity:.7}
.hiw-item[data-active="true"] .viz-tgt-ring{animation:viz-ping 1.8s ease-out infinite}
@keyframes viz-ping{0%{transform:scale(1);opacity:.7}80%,100%{transform:scale(2.2);opacity:0}}
.viz-tgt-tag{transition:opacity .5s;opacity:.4}
.hiw-item[data-active="true"] .viz-tgt-tag{opacity:1}
.hiw-item[data-active="true"] .viz-tgt-tag:nth-child(2){transition-delay:.12s}
.hiw-item[data-active="true"] .viz-tgt-tag:nth-child(3){transition-delay:.24s}
.hiw-item[data-active="true"] .viz-tgt-tag:nth-child(4){transition-delay:.36s}

/* Build */
.viz-bar{transform:scaleX(0);transform-origin:left center;will-change:transform;transition:transform .9s cubic-bezier(.2,.7,.2,1)}
.hiw-item[data-active="true"] .viz-bar{transform:scaleX(var(--w,1))}
.hiw-item[data-active="true"] .viz-bar:nth-of-type(2){transition-delay:.2s}
.hiw-item[data-active="true"] .viz-bar:nth-of-type(3){transition-delay:.4s}
.viz-btn{opacity:0;transform:translate3d(0,6px,0);transition:opacity .5s,transform .5s}
.hiw-item[data-active="true"] .viz-btn{opacity:1;transform:translate3d(0,0,0);transition-delay:.9s}

/* Approve */
.viz-check path{stroke-dasharray:30;stroke-dashoffset:30;transition:stroke-dashoffset .7s ease-out}
.hiw-item[data-active="true"] .viz-check path{stroke-dashoffset:0;transition-delay:.2s}
.viz-ok{opacity:0;transform:scale(.5);transition:opacity .4s cubic-bezier(.3,1.5,.5,1),transform .4s cubic-bezier(.3,1.5,.5,1)}
.hiw-item[data-active="true"] .viz-ok{opacity:1;transform:scale(1);transition-delay:.9s}

/* Dispatch */
.viz-fly{position:absolute;top:50%;left:42px;height:.375rem;width:1rem;border-radius:9999px;background:#34d399;box-shadow:0 0 8px rgba(16,185,129,.6);opacity:0;will-change:transform,opacity;transform:translate3d(0,-50%,0)}
.hiw-item[data-active="true"] .viz-fly{animation:viz-fly 1.4s linear infinite}
.viz-fly:nth-child(4){animation-delay:.25s}
.viz-fly:nth-child(5){animation-delay:.5s}
.viz-fly:nth-child(6){animation-delay:.75s}
@keyframes viz-fly{0%{transform:translate3d(0,-50%,0);opacity:0}10%{opacity:1}90%{opacity:1}100%{transform:translate3d(90px,-50%,0);opacity:0}}

/* Monitor */
.viz-col{transform:scaleY(0);transform-origin:bottom center;will-change:transform;transition:transform .8s cubic-bezier(.2,.7,.2,1)}
.hiw-item[data-active="true"] .viz-col{transform:scaleY(var(--h,1))}
.hiw-item[data-active="true"] .viz-col:nth-child(2){transition-delay:.08s}
.hiw-item[data-active="true"] .viz-col:nth-child(3){transition-delay:.16s}
.hiw-item[data-active="true"] .viz-col:nth-child(4){transition-delay:.24s}
.hiw-item[data-active="true"] .viz-col:nth-child(5){transition-delay:.32s}
.hiw-item[data-active="true"] .viz-col:nth-child(6){transition-delay:.4s}
.hiw-item[data-active="true"] .viz-col:nth-child(7){transition-delay:.48s}
.viz-live{opacity:0;transition:opacity .5s .6s}
.hiw-item[data-active="true"] .viz-live{opacity:1}

@media (prefers-reduced-motion: reduce){
  .hiw-viz *,.hiw-badge,.hiw-card{animation:none!important;transition:none!important}
}
`}</style>
  );
}

// ============ How-it-works micro-animations (pure CSS, no re-renders) ============
function VizUpload() {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="relative w-[140px] h-[80px]">
        <div className="viz-drop" />
        <div className="viz-pkt"><span className="h-1 w-1 rounded-full bg-emerald-400" /><span className="h-1 flex-1 rounded bg-white/15" /></div>
        <div className="viz-pkt"><span className="h-1 w-1 rounded-full bg-emerald-400" /><span className="h-1 flex-1 rounded bg-white/15" /></div>
        <div className="viz-pkt"><span className="h-1 w-1 rounded-full bg-emerald-400" /><span className="h-1 flex-1 rounded bg-white/15" /></div>
      </div>
    </div>
  );
}

function VizTarget() {
  const links = ["Site", "WhatsApp", "Checkout", "Landing"];
  const pos = ["top-0 left-0", "top-0 right-0", "bottom-0 left-0", "bottom-0 right-0"];
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="relative w-[150px] h-[90px]">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-10 w-10 rounded-full border-2 border-emerald-500 grid place-items-center text-[10px] font-semibold text-emerald-400">
          <span className="viz-tgt-ring" />
          alvo
        </div>
        {links.map((l, i) => (
          <div
            key={l}
            className={cn(
              "viz-tgt-tag absolute text-[10px] px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/10 text-neutral-300",
              pos[i]
            )}
          >
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}

function VizBuild() {
  const widths = [0.8, 0.6, 0.9];
  return (
    <div className="absolute inset-0 p-3 flex flex-col justify-center gap-1.5">
      {widths.map((w, i) => (
        <div key={i} className="h-2 rounded bg-white/[0.05] overflow-hidden">
          <div className="viz-bar h-full bg-emerald-500/70" style={{ ["--w" as string]: w }} />
        </div>
      ))}
      <div className="viz-btn mt-1 self-start h-6 px-2 rounded bg-emerald-500 text-neutral-950 text-[10px] font-semibold grid place-items-center">
        Saiba mais
      </div>
    </div>
  );
}

function VizApprove() {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="relative">
        <div className="h-14 w-14 rounded-full border-2 border-emerald-500/60 grid place-items-center">
          <svg viewBox="0 0 24 24" className="viz-check h-7 w-7 text-emerald-400 fill-none stroke-current" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7" />
          </svg>
        </div>
        <div className="viz-ok absolute -right-2 -top-2 h-5 px-1.5 rounded-full bg-emerald-500 text-[9px] font-semibold text-neutral-950 grid place-items-center">
          OK
        </div>
      </div>
    </div>
  );
}

function VizDispatch() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 h-8 w-8 rounded-md bg-emerald-500/15 border border-emerald-500/40 grid place-items-center">
        <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
      </div>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-1">
        <div className="h-2 w-8 rounded-sm bg-white/[0.06] border border-white/10" />
        <div className="h-2 w-8 rounded-sm bg-white/[0.06] border border-white/10" />
        <div className="h-2 w-8 rounded-sm bg-white/[0.06] border border-white/10" />
      </div>
      <div className="viz-fly" />
      <div className="viz-fly" />
      <div className="viz-fly" />
      <div className="viz-fly" />
    </div>
  );
}

function VizMonitor() {
  const heights = [0.35, 0.55, 0.42, 0.68, 0.58, 0.8, 0.72];
  return (
    <div className="absolute inset-0 p-3">
      <div className="flex items-end justify-between h-full gap-1.5">
        {heights.map((h, i) => (
          <div
            key={i}
            className="viz-col flex-1 rounded-t bg-emerald-400"
            style={{ height: "100%", ["--h" as string]: h }}
          />
        ))}
      </div>
      <div className="viz-live absolute top-2 right-2 flex items-center gap-1 text-[9px] font-medium text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        ao vivo
      </div>
    </div>
  );
}



// ============ SIMULATOR ============
type FormData = {
  volume: number;
  segment: string;
  name: string;
  company: string;
  whatsapp: string;
  start: string;
};

const STORAGE_KEY = "disparosfr:form";

const LEADS_PRICE = 0.09;
type LeadsSource = "own" | "provided";

function SimulatorSection() {
  const [volume, setVolume] = useState<number>(100_000);
  const [leadsSource, setLeadsSource] = useState<LeadsSource>("own");
  const [showForm, setShowForm] = useState(false);
  const [started, setStarted] = useState(false);
  const { price, tier } = useMemo(() => priceFor(volume), [volume]);
  const dispatchTotal = volume * price;
  const leadsTotal = leadsSource === "provided" ? volume * LEADS_PRICE : 0;
  const grandTotal = dispatchTotal + leadsTotal;

  useEffect(() => {
    trackPixel("SelectVolume", { volume });
  }, [volume]);

  function onPickPreset(v: number) {
    setVolume(v);
    if (!started) {
      trackPixel("StartSimulation");
      setStarted(true);
    }
  }

  return (
    <section
      id="simulador"
      className="relative overflow-hidden border-y border-emerald-500/20 bg-[#052e28] py-20 sm:py-28"
    >
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-60"
        style={{
          background:
            "radial-gradient(60% 40% at 20% 0%, rgba(16,185,129,0.18), transparent 60%), radial-gradient(50% 40% at 100% 100%, rgba(6,95,70,0.5), transparent 60%)",
        }}
      />
      <div className={`${container} relative`}>
        <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-end">
          <div className="lg:col-span-7">
            <SectionHead
              eyebrow="Simulador"
              title={<>Calcule sua campanha em segundos.</>}
              lead="Escolha o volume da base, informe se usará contatos próprios ou fornecidos por nós, e receba a proposta detalhada pelo WhatsApp."
            />
          </div>
          <ul className="lg:col-span-5 grid sm:grid-cols-1 gap-2.5 text-[13.5px] text-neutral-300">
            <li className="flex gap-3">
              <Check className="mt-0.5 h-4 w-4 text-emerald-500 shrink-0" />
              Valor por envio varia conforme o volume selecionado.
            </li>
            <li className="flex gap-3">
              <Check className="mt-0.5 h-4 w-4 text-emerald-500 shrink-0" />
              Fornecimento de leads por R$ 0,09 por contato (opcional).
            </li>
            <li className="flex gap-3">
              <Check className="mt-0.5 h-4 w-4 text-emerald-500 shrink-0" />
              Proposta final considera template, segmentação e estrutura.
            </li>
          </ul>
        </div>

        <div className="mt-12 grid md:grid-cols-5 gap-4">
              {/* Controls */}
              <div className="md:col-span-3 rounded-2xl border border-white/8 bg-[#111317] p-5 sm:p-6">
                <div className="text-[11px] uppercase tracking-widest text-neutral-500">
                  Volume da base
                </div>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <div>
                    <div className="text-[28px] sm:text-[32px] font-semibold text-white tabular-nums leading-none">
                      {formatInt(volume)}
                    </div>
                    <div className="text-[12px] text-neutral-500 mt-1">
                      contatos
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() =>
                        onPickPreset(Math.max(2_000, volume - (volume > 10_000 ? 10_000 : 1_000)))
                      }
                      className="h-9 w-9 grid place-items-center rounded-md border border-white/8 bg-white/[0.02] text-neutral-300 hover:bg-white/[0.06]"
                      aria-label="Diminuir"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() =>
                        onPickPreset(Math.min(1_000_000, volume + (volume >= 10_000 ? 10_000 : 1_000)))
                      }
                      className="h-9 w-9 grid place-items-center rounded-md border border-white/8 bg-white/[0.02] text-neutral-300 hover:bg-white/[0.06]"
                      aria-label="Aumentar"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <input
                  type="range"
                  min={2_000}
                  max={1_000_000}
                  step={1_000}
                  value={volume}
                  onChange={(e) => onPickPreset(Number(e.target.value))}
                  className="mt-5 w-full accent-emerald-500"
                  aria-label="Volume de contatos"
                />
                <div className="mt-1 flex justify-between text-[11px] text-neutral-500">
                  <span>2k</span>
                  <span>250k</span>
                  <span>1M</span>
                </div>

                <div className="mt-5">
                  <div className="text-[11px] uppercase tracking-widest text-neutral-500 mb-2">
                    Atalhos
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {PRESETS.map((p) => {
                      const active = p === volume;
                      return (
                        <button
                          key={p}
                          onClick={() => onPickPreset(p)}
                          className={`rounded-md px-2 py-2 text-[13px] font-medium transition-colors border ${
                            active
                              ? "bg-emerald-500 text-neutral-950 border-emerald-500"
                              : "bg-white/[0.02] text-neutral-300 border-white/8 hover:bg-white/[0.06]"
                          }`}
                        >
                          {p >= 1_000_000
                            ? `${p / 1_000_000}M`
                            : `${p / 1_000}k`}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-6">
                  <div className="text-[11px] uppercase tracking-widest text-neutral-500 mb-2">
                    Base de contatos
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {[
                      {
                        id: "own" as LeadsSource,
                        t: "Já tenho minha base",
                        d: "Sem custo adicional",
                      },
                      {
                        id: "provided" as LeadsSource,
                        t: "Preciso adquirir leads",
                        d: "+ R$ 0,09 por contato",
                      },
                    ].map((opt) => {
                      const active = leadsSource === opt.id;
                      return (
                        <button
                          key={opt.id}
                          onClick={() => setLeadsSource(opt.id)}
                          className={`text-left rounded-xl px-4 py-3 border transition-colors ${
                            active
                              ? "border-emerald-500 bg-emerald-500/10"
                              : "border-white/8 bg-white/[0.02] hover:bg-white/[0.06]"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-4 w-4 rounded-full border grid place-items-center ${
                                active
                                  ? "border-emerald-400 bg-emerald-500"
                                  : "border-white/30"
                              }`}
                            >
                              {active && (
                                <span className="h-1.5 w-1.5 rounded-full bg-neutral-950" />
                              )}
                            </span>
                            <span className="text-[13.5px] font-medium text-white">
                              {opt.t}
                            </span>
                          </div>
                          <div className="mt-1 pl-6 text-[11.5px] text-neutral-400">
                            {opt.d}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {leadsSource === "provided" && (
                    <p className="mt-2 text-[11px] leading-relaxed text-emerald-300/80">
                      Disponibilidade e segmentação dos leads sujeitas à
                      análise.
                    </p>
                  )}
                </div>

                <div className="mt-5 rounded-xl border border-white/6 bg-white/[0.02] p-4 text-[12px] text-neutral-400 leading-relaxed">
                  {leadsSource === "own"
                    ? "Sua base deve ser própria e composta por contatos que esperam ou autorizaram receber comunicações."
                    : "Fornecemos leads segmentados conforme seu público-alvo. A entrega da base depende de análise prévia."}
                </div>
              </div>

              {/* Summary */}
              <div className="md:col-span-2 rounded-2xl border border-white/8 bg-[#111317] p-5 sm:p-6 flex flex-col">
                <div className="text-[11px] uppercase tracking-widest text-neutral-500">
                  Resumo estimado
                </div>
                <div className="mt-3">
                  <div className="text-[12px] text-neutral-500">Faixa</div>
                  <div className="text-[14px] text-white">{tier.label}</div>
                </div>
                <div className="mt-4">
                  <div className="text-[12px] text-neutral-500">
                    Valor por envio
                  </div>
                  <div className="text-[22px] font-semibold text-emerald-400 tabular-nums leading-none mt-1">
                    {formatBRL(price)}
                  </div>
                </div>

                <div className="mt-5 pt-5 border-t border-white/5 space-y-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[12px] text-neutral-400">
                      Disparos
                    </span>
                    <span className="text-[14px] text-white tabular-nums">
                      {formatBRL(dispatchTotal)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[12px] text-neutral-400">
                      Leads {leadsSource === "provided" ? "(fornecidos)" : ""}
                    </span>
                    <span
                      className={`text-[14px] tabular-nums ${leadsSource === "provided" ? "text-white" : "text-neutral-500"}`}
                    >
                      {leadsSource === "provided"
                        ? formatBRL(leadsTotal)
                        : "Inclusos"}
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-white/10">
                  <div className="text-[12px] text-neutral-500">
                    Investimento total estimado
                  </div>
                  <div className="text-[26px] font-semibold text-white tabular-nums leading-none mt-1">
                    {formatBRL(grandTotal)}
                  </div>
                </div>

                <button
                  onClick={() => {
                    trackPixel("StartForm");
                    const sourceLabel =
                      leadsSource === "provided"
                        ? "vocês fornecem a base"
                        : "base própria";
                    openWhatsApp(
                      `Olá! Quero simular uma campanha na Disparos FR.\n\n• Volume: ${volume.toLocaleString("pt-BR")} disparos\n• Base: ${sourceLabel}\n• Investimento estimado: ${formatBRL(grandTotal)}\n\nPode me passar os próximos passos?`
                    );
                  }}
                  className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-[14px] font-medium text-neutral-950 hover:bg-emerald-400 transition-colors"
                >
                  Simular minha campanha
                  <ArrowRight className="h-4 w-4" />
                </button>
                <p className="mt-3 text-[11px] leading-relaxed text-neutral-500">
                  Simulação gratuita e sem compromisso. Nenhum pagamento é
                  solicitado agora.
                </p>
              </div>
            </div>

            {showForm && (
              <div id="formulario" className="mt-8">
                <QualifyForm
                  initialVolume={volume}
                  total={grandTotal}
                  leadsSource={leadsSource}
                  dispatchTotal={dispatchTotal}
                  leadsTotal={leadsTotal}
                />
              </div>
          )}
        </div>
    </section>
  );
}


// ============ FORM ============
function QualifyForm({
  initialVolume,
  total: _total,
  leadsSource = "own",
  dispatchTotal,
  leadsTotal,
}: {
  initialVolume: number;
  total: number;
  leadsSource?: LeadsSource;
  dispatchTotal: number;
  leadsTotal: number;
}) {
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const [data, setData] = useState<FormData>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored)
          return { ...JSON.parse(stored), volume: initialVolume } as FormData;
      } catch {}
    }
    return {
      volume: initialVolume,
      segment: "",
      name: "",
      company: "",
      whatsapp: "",
      start: "",
    };
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>(
    {}
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
  }, [data]);

  const totalSteps = 4;
  const { price, tier } = priceFor(data.volume);
  const estimated = data.volume * price;

  function update<K extends keyof FormData>(k: K, v: FormData[K]) {
    setData((d) => ({ ...d, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  }

  function validateStep(): boolean {
    const e: Partial<Record<keyof FormData, string>> = {};
    if (step === 1 && !data.segment) e.segment = "Selecione um segmento";
    if (step === 2) {
      if (!data.name.trim()) e.name = "Informe seu nome";
      if (!data.company.trim()) e.company = "Informe a empresa";
      const digits = data.whatsapp.replace(/\D/g, "");
      if (digits.length < 10) e.whatsapp = "WhatsApp inválido";
    }
    if (step === 3) {
      if (!data.start) e.start = "Selecione uma opção";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function next() {
    if (!validateStep()) return;
    if (step < totalSteps) setStep(step + 1);
  }

  function submit() {
    setDone(true);
    trackPixel("CompleteForm", { volume: data.volume, segment: data.segment });
    setTimeout(() => {
      const leadsLine =
        leadsSource === "provided"
          ? `Base: fornecida pela Disparos FR (${formatBRL(leadsTotal)})`
          : `Base: própria do cliente`;
      const msg = `Olá! Fiz uma simulação no site da Disparos FR.

Nome: ${data.name}
Empresa: ${data.company}
Segmento: ${data.segment}
Volume: ${formatInt(data.volume)} contatos (${tier.label})
${leadsLine}
Disparos: ${formatBRL(dispatchTotal)}
Investimento total estimado: ${formatBRL(dispatchTotal + leadsTotal)}
Previsão de início: ${data.start}

Gostaria de receber a proposta.`;
      openWhatsApp(msg);
    }, 1400);
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-500/25 bg-[#111317] p-8 text-center">
        <div className="mx-auto h-11 w-11 rounded-full bg-emerald-500/15 grid place-items-center">
          <Check className="h-5 w-5 text-emerald-400" />
        </div>
        <h3 className="mt-4 text-[18px] font-semibold text-white">
          Simulação enviada
        </h3>
        <p className="mt-2 text-[14px] text-neutral-400">
          Você será direcionado para um especialista com os dados já
          preenchidos.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 text-[12px] text-neutral-500">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Abrindo WhatsApp…
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/8 bg-[#111317] p-5 sm:p-7">
      <div className="flex items-center justify-between text-[12px] text-neutral-400">
        <span>
          Etapa {step} de {totalSteps}
        </span>
        <span className="text-neutral-500">Leva menos de um minuto</span>
      </div>
      <div className="mt-2 h-1 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${(step / totalSteps) * 100}%` }}
        />
      </div>

      <div className="mt-7">
        {step === 1 && (
          <StepShell title="Qual é o segmento da sua empresa?">
            <div className="grid grid-cols-2 gap-2">
              {SEGMENTS.map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => update("segment", s)}
                  className={`min-h-12 rounded-lg border px-3 py-3 text-[14px] font-medium transition-colors text-left ${
                    data.segment === s
                      ? "bg-emerald-500/10 border-emerald-500/50 text-white"
                      : "bg-white/[0.02] border-white/8 text-neutral-300 hover:bg-white/[0.05]"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            {errors.segment && <ErrorMsg text={errors.segment} />}
          </StepShell>
        )}

        {step === 2 && (
          <StepShell title="Seus dados de contato">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field
                label="Nome"
                value={data.name}
                onChange={(v) => update("name", v)}
                error={errors.name}
              />
              <Field
                label="Empresa"
                value={data.company}
                onChange={(v) => update("company", v)}
                error={errors.company}
              />
              <Field
                label="WhatsApp"
                value={data.whatsapp}
                onChange={(v) => update("whatsapp", maskPhone(v))}
                placeholder="(11) 99999-9999"
                inputMode="tel"
                error={errors.whatsapp}
              />
              <Field
                label="Quantidade de contatos"
                value={formatInt(data.volume)}
                onChange={(v) => {
                  const n = Number(v.replace(/\D/g, ""));
                  if (!Number.isNaN(n)) update("volume", n);
                }}
                inputMode="tel"
              />
            </div>
            <p className="mt-3 text-[12px] text-neutral-500">
              Seus dados serão utilizados somente para preparar sua proposta.
            </p>
          </StepShell>
        )}

        {step === 3 && (
          <StepShell title="Sobre a campanha">
            <div>
              <div className="text-[13px] font-medium text-neutral-300 mb-2">
                Quando pretende iniciar?
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {START_OPTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => update("start", s)}
                    className={`min-h-12 rounded-lg border px-3 py-3 text-[14px] transition-colors text-left ${
                      data.start === s
                        ? "bg-emerald-500/10 border-emerald-500/50 text-white"
                        : "bg-white/[0.02] border-white/8 text-neutral-300 hover:bg-white/[0.05]"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              {errors.start && <ErrorMsg text={errors.start} />}
            </div>
          </StepShell>
        )}

        {step === 4 && (
          <StepShell title="Confirme os dados da simulação">
            <div className="rounded-xl border border-white/8 bg-white/[0.02] divide-y divide-white/5">
              <Row k="Nome" v={data.name} />
              <Row k="Empresa" v={data.company} />
              <Row k="Segmento" v={data.segment} />
              <Row
                k="Volume"
                v={`${formatInt(data.volume)} contatos · ${tier.label}`}
              />
              <Row k="Valor por envio" v={formatBRL(price)} />
              <Row k="Total estimado" v={formatBRL(estimated)} accent />
              <Row k="Início" v={data.start} />
            </div>
            <p className="mt-3 text-[12px] text-neutral-500">
              Valor estimado, sujeito à análise. Você poderá revisar tudo com
              o especialista.
            </p>
          </StepShell>
        )}
      </div>

      <div className="mt-7 flex items-center justify-between">
        <button
          onClick={() => setStep(Math.max(1, step - 1))}
          disabled={step === 1}
          className="inline-flex items-center gap-1 text-[13px] text-neutral-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-4 w-4" /> Voltar
        </button>
        {step < totalSteps ? (
          <button
            onClick={next}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-[14px] font-medium text-neutral-950 hover:bg-emerald-400 transition-colors"
          >
            Continuar <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={submit}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-[14px] font-medium text-neutral-950 hover:bg-emerald-400 transition-colors"
          >
            <MessageCircle className="h-4 w-4" /> Continuar pelo WhatsApp
          </button>
        )}
      </div>
    </div>
  );
}

function StepShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-[18px] font-semibold text-white mb-4">{title}</h3>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: "tel" | "text" | "email";
  error?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium uppercase tracking-widest text-neutral-500 mb-1.5">
        {label}
      </label>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full h-12 rounded-lg bg-white/[0.02] border px-3.5 text-[15px] text-white placeholder:text-neutral-600 focus:outline-none transition-colors ${
          error
            ? "border-red-500/60 focus:border-red-500"
            : "border-white/10 focus:border-emerald-500/60"
        }`}
      />
      {error && <ErrorMsg text={error} />}
    </div>
  );
}

function ErrorMsg({ text }: { text: string }) {
  return <div className="mt-1.5 text-[12px] text-red-400">{text}</div>;
}

function Row({
  k,
  v,
  accent,
}: {
  k: string;
  v: string;
  accent?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 px-4 py-3 text-[14px]">
      <span className="text-neutral-500">{k}</span>
      <span
        className={`text-right font-medium ${
          accent ? "text-emerald-400" : "text-white"
        }`}
      >
        {v || "—"}
      </span>
    </div>
  );
}

// ============ PANEL (dashboard) section ============
// ============ SCREENSHOT PRIMITIVES ============
type AspectStr = "16/10" | "16/9" | "4/3" | "3/2" | "1/1" | "9/16" | "9/10" | "4/5";

function ScreenshotFrame({
  src,
  srcMobile,
  alt,
  label,
  caption,
  aspect = "16/10",
  aspectMobile,
  priority = false,
}: {
  src: string;
  srcMobile?: string;
  alt: string;
  label: string;
  caption?: string;
  aspect?: AspectStr;
  aspectMobile?: AspectStr;
  priority?: boolean;
}) {
  const [zoom, setZoom] = useState(false);
  const hasImage = Boolean(src && src.trim().length > 0);
  const hasMobile = Boolean(srcMobile && srcMobile.trim().length > 0);
  const mobileAspect = aspectMobile ?? aspect;
  const zoomSrc = hasMobile && typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches ? (srcMobile as string) : src;

  const renderFrame = (imageSrc: string, ratio: AspectStr, visibility: string) => (
    <div
      className={`relative w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0f1114] shadow-[0_30px_80px_-40px_rgba(0,0,0,0.7)] ${visibility}`}
      style={{ aspectRatio: ratio.replace("/", " / ") }}
    >
      {hasImage ? (
        <>
          <img
            src={imageSrc}
            alt={alt}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <button
            type="button"
            onClick={() => setZoom(true)}
            className="absolute inset-0 grid place-items-end p-3 opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Ampliar imagem"
          >
            <span className="inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-[12px] font-medium text-white backdrop-blur">
              <ZoomIn className="h-3.5 w-3.5" /> Ampliar
            </span>
          </button>
        </>
      ) : (
        <div className="absolute inset-0 grid place-items-center p-6 text-center">
          <div>
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-neutral-400">
              <ImageIcon className="h-5 w-5" />
            </div>
            <div className="mt-4 text-[13px] font-medium text-neutral-200">
              Espaço reservado para captura real
            </div>
            <div className="mt-1 text-[12px] text-neutral-500">
              Substituir por: <span className="text-neutral-300">{label}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <figure className="group w-full">
      {hasMobile ? (
        <>
          <div className="mx-auto w-full max-w-[300px] sm:hidden">
            {renderFrame(srcMobile as string, mobileAspect, "block")}
          </div>
          {renderFrame(src, aspect, "hidden sm:block")}
        </>
      ) : (
        renderFrame(src, aspect, "block")
      )}
      {caption && (
        <figcaption className="mt-3 text-[12px] text-neutral-500 text-center">
          {caption}
        </figcaption>
      )}
      {zoom && hasImage && (
        <ImageLightbox src={zoomSrc} alt={alt} onClose={() => setZoom(false)} />
      )}
    </figure>
  );
}

function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Visualização ampliada"
      className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm p-4 sm:p-8 grid place-items-center"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
        aria-label="Fechar"
      >
        <X className="h-5 w-5" />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-h-[90vh] max-w-[95vw] rounded-xl shadow-2xl object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function CampaignVideo({
  src,
  poster,
  caption,
}: {
  src: string;
  poster: string;
  caption?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  if (!src) return null;
  return (
    <figure className="w-full">
      <div className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_30px_80px_-40px_rgba(0,0,0,0.7)] aspect-video">
        <video
          ref={videoRef}
          src={src}
          poster={poster || undefined}
          preload="metadata"
          playsInline
          controls={playing}
          muted
          className="absolute inset-0 h-full w-full object-cover"
        />
        {!playing && (
          <button
            type="button"
            onClick={() => {
              setPlaying(true);
              // Autoplay só após interação — respeita mobile.
              requestAnimationFrame(() => videoRef.current?.play().catch(() => {}));
            }}
            className="absolute inset-0 grid place-items-center bg-black/30 hover:bg-black/40 transition-colors"
            aria-label="Reproduzir vídeo"
          >
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-neutral-950 shadow-[0_20px_40px_-10px_rgba(16,185,129,0.6)]">
              <Play className="h-7 w-7 ml-0.5" />
            </span>
          </button>
        )}
      </div>
      {caption && (
        <figcaption className="mt-3 text-[12px] text-neutral-500 text-center">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

// ============ CAMPAIGN IN ACTION (tabs) ============
function CampaignInAction() {
  const tabs = [
    {
      id: "config",
      title: "Mensagem configurada",
      desc: "Veja como o texto, a imagem, a personalização e o botão são preparados antes do envio.",
      src: SCREENSHOTS.msgConfig,
      label: "Editor da mensagem no painel",
      alt: "Editor de mensagem com texto, imagem, personalização e botão configurados",
    },
    {
      id: "received",
      title: "Mensagem recebida",
      desc: "Confira como a comunicação aparece diretamente no WhatsApp do contato.",
      src: SCREENSHOTS.msgReceived,
      label: "Print da mensagem recebida no WhatsApp",
      alt: "Print real da mensagem entregue no WhatsApp do contato",
    },
    {
      id: "running",
      title: "Campanha em execução",
      desc: "Acompanhe enviados, entregues, falhas e progresso enquanto a campanha acontece.",
      src: SCREENSHOTS.campaignRunning,
      label: "Painel com campanha rodando ao vivo",
      alt: "Painel do Disparos FR com enviados, entregues, falhas e progresso em tempo real",
    },
  ];
  const [active, setActive] = useState(tabs[0].id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  return (
    <section id="pratica" className="border-y border-white/5 bg-white/[0.015] py-20 sm:py-28">
      <div className={container}>
        <SectionHead
          eyebrow="Na prática"
          title="Veja uma campanha acontecendo na prática"
          lead="Da configuração da mensagem ao relatório final, sua equipe acompanha toda a execução."
        />
        <div className="mt-10 flex flex-wrap gap-2" role="tablist" aria-label="Etapas da campanha">
          {tabs.map((t) => {
            const isActive = t.id === active;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(t.id)}
                className={`rounded-full px-4 py-2 text-[13px] font-medium transition-colors border ${
                  isActive
                    ? "bg-emerald-500 text-neutral-950 border-emerald-500"
                    : "bg-white/[0.03] text-neutral-300 border-white/10 hover:bg-white/[0.06]"
                }`}
              >
                {t.title}
              </button>
            );
          })}
        </div>
        <div className="mt-8 grid lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-8">
            <ScreenshotFrame
              key={current.id}
              src={current.src}
              alt={current.alt}
              label={current.label}
              aspect={current.id === "received" ? "9/16" : "16/10"}
            />
          </div>
          <div className="lg:col-span-4 lg:pt-2">
            <div className="text-[11px] uppercase tracking-widest text-neutral-500">
              Etapa
            </div>
            <h3 className="mt-2 text-[22px] font-semibold text-white leading-snug">
              {current.title}
            </h3>
            <p className="mt-3 text-[14px] text-neutral-400 leading-relaxed">
              {current.desc}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============ FINAL REPORT ============
function FinalReport() {
  return (
    <section id="relatorio" className="py-20 sm:py-28">
      <div className={container}>
        <div className="grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7 order-2 lg:order-1">
            <div className="max-w-[420px] mx-auto lg:max-w-none">
              <PainelRealCard variant="finished" />
            </div>
          </div>

          <div className="lg:col-span-5 order-1 lg:order-2 lg:pl-4">
            <SectionHead
              eyebrow="Relatório"
              title="No final, você sabe exatamente o que aconteceu"
              lead="Ao encerrar a campanha, você recebe um resumo claro com os números da operação."
            />
            <dl className="mt-8 divide-y divide-white/5 border-y border-white/5">
              {FINAL_REPORT_METRICS.map((m) => (
                <div
                  key={m.k}
                  className="flex items-baseline justify-between gap-4 py-3.5"
                >
                  <dt className="text-[13px] text-neutral-400">{m.k}</dt>
                  <dd className="text-[16px] font-semibold text-white tabular-nums">
                    {m.v}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-[12px] text-neutral-500">
              Valores editáveis — preenchidos com os números reais de cada operação.
            </p>
          </div>
        </div>
        {CAMPAIGN_VIDEO.src && (
          <div className="mt-14 max-w-3xl mx-auto">
            <CampaignVideo
              src={CAMPAIGN_VIDEO.src}
              poster={CAMPAIGN_VIDEO.poster}
              caption={CAMPAIGN_VIDEO.caption}
            />
          </div>
        )}
      </div>
    </section>
  );
}

// ============ CASE STUDY (real) ============
function CaseStudy() {
  return (
    <section
      id="caso"
      className="border-y border-white/5 bg-white/[0.015] py-20 sm:py-28"
    >
      <div className={container}>
        <SectionHead
          eyebrow="Estudo de caso"
          title="Uma operação real, do início ao fim"
          lead="Contexto, execução e resultados comprováveis de uma campanha realizada pela Disparos FR."
        />
        <div className="mt-12 grid lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-7">
            <ScreenshotFrame
              src={SCREENSHOTS.caseStudy}
              srcMobile={SCREENSHOTS.caseStudyMobile}
              alt={`Painel do estudo de caso — ${CASE_STUDY.title}`}
              label="Painel do estudo de caso"
              aspect="16/10"
              aspectMobile="9/10"
            />
          </div>
          <div className="lg:col-span-5 lg:pt-2">
            <div className="text-[11px] uppercase tracking-widest text-neutral-500">
              {CASE_STUDY.segment}
            </div>
            <h3 className="mt-2 text-[22px] font-semibold text-white leading-snug">
              {CASE_STUDY.title}
            </h3>
            <p className="mt-3 text-[14px] text-neutral-400 leading-relaxed">
              {CASE_STUDY.context}
            </p>
            <div className="mt-6 grid grid-cols-3 gap-3">
              {CASE_STUDY.metrics.map((m) => (
                <div
                  key={m.k}
                  className="rounded-lg border border-white/6 bg-[#101216] p-4"
                >
                  <div className="text-[10px] uppercase tracking-widest text-neutral-500">
                    {m.k}
                  </div>
                  <div className="mt-1 text-[18px] font-semibold text-white tabular-nums">
                    {m.v}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-6 text-[12px] text-neutral-500">
              Dados a serem preenchidos com métricas reais e autorizadas do cliente.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}



// ============ COMPARE ============
function Compare() {
  const rows = [
    ["Estrutura", "WhatsApp Business API Oficial", "Contas comuns"],
    ["Volume por dia", "Escalável conforme aprovação", "Limitado"],
    ["Templates aprovados", "Sim", "Não se aplica"],
    ["Relatório em tempo real", "Sim", "Não"],
    ["Risco de banimento", "Reduzido", "Elevado"],
    ["Suporte durante a campanha", "Especialista dedicado", "Você por conta"],
  ];
  return (
    <section className="py-20 sm:py-28">
      <div className={container}>
        <div className="grid lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-4">
            <SectionHead
              eyebrow="Diferença"
              title={
                <>
                  Por que usar
                  <br />
                  a API Oficial.
                </>
              }
              lead="Envios estáveis, com histórico auditável e sem improviso."
            />
            <div className="mt-8 rounded-xl border border-white/8 bg-[#111317] p-4 flex items-start gap-3">
              <ShieldCheck className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
              <p className="text-[13px] text-neutral-400 leading-relaxed">
                Operação alinhada às políticas do WhatsApp Business Platform.
                Sem contas laranja, sem chip caseiro.
              </p>
            </div>
          </div>
          <div className="lg:col-span-8">
            <div className="rounded-2xl border border-white/8 overflow-hidden">
              <div className="grid grid-cols-3 bg-white/[0.03] text-[11px] uppercase tracking-widest text-neutral-500">
                <div className="px-4 py-3">Critério</div>
                <div className="px-4 py-3 text-emerald-400">Disparos FR</div>
                <div className="px-4 py-3">Envio comum</div>
              </div>
              {rows.map(([k, a, b], i) => (
                <div
                  key={k}
                  className={`grid grid-cols-3 text-[13px] ${
                    i > 0 ? "border-t border-white/5" : ""
                  }`}
                >
                  <div className="px-4 py-3.5 text-neutral-300">{k}</div>
                  <div className="px-4 py-3.5 text-white font-medium">{a}</div>
                  <div className="px-4 py-3.5 text-neutral-500">{b}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============ FAQ ============
function FAQ() {
  const items: [string, string][] = [
    [
      "Existe valor mínimo de campanha?",
      "Trabalhamos com operações a partir de 2 mil contatos. Bases menores podem ser avaliadas sob consulta.",
    ],
    [
      "O preço de R$ 0,13 vale para qualquer volume?",
      "Não. Essa condição é aplicada a bases acima de 250 mil contatos. Volumes menores usam faixas comerciais diferentes.",
    ],
    [
      "É realmente API Oficial do WhatsApp?",
      "Sim. Operamos pela WhatsApp Business Platform, com templates aprovados e histórico auditável.",
    ],
    [
      "Consigo acompanhar os envios?",
      "Sim. Você recebe acesso a um painel com enviados, entregues, falhas, velocidade e progresso em tempo real.",
    ],
    [
      "Vocês ajudam com a mensagem?",
      "Sim. A equipe apoia na definição do template, personalização e adequação às políticas do WhatsApp.",
    ],
    [
      "Quanto tempo leva para começar?",
      "Depende da aprovação do template e da preparação da base. Em muitos casos a primeira leva sai em poucos dias úteis.",
    ],
    [
      "Preciso ter base própria?",
      "Sim. A base deve ser própria e composta por contatos que aceitaram receber comunicações da empresa.",
    ],
    [
      "Como recebo a proposta?",
      "Após a simulação, você é direcionado para um especialista pelo WhatsApp com os dados já preenchidos.",
    ],
  ];
  return (
    <section id="faq" className="border-y border-white/5 bg-[#0d0e11] py-20 sm:py-28">
      <div className={container}>
        <div className="grid lg:grid-cols-12 gap-10">
          <div className="lg:col-span-4">
            <SectionHead
              eyebrow="Dúvidas"
              title="Perguntas frequentes"
              lead="Respostas objetivas para as dúvidas mais comuns sobre a operação."
            />
          </div>
          <div className="lg:col-span-8 divide-y divide-white/6 border-y border-white/6">
            {items.map(([q, a]) => (
              <details key={q} className="group py-5">
                <summary className="flex items-start justify-between gap-6 cursor-pointer list-none">
                  <span className="text-[15px] font-medium text-white pr-2">
                    {q}
                  </span>
                  <span className="mt-1 shrink-0 h-6 w-6 rounded-full border border-white/10 grid place-items-center text-neutral-400 transition-transform group-open:rotate-45">
                    <Plus className="h-3.5 w-3.5" />
                  </span>
                </summary>
                <p className="mt-3 text-[14px] text-neutral-400 leading-relaxed pr-10">
                  {a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ============ FINAL CTA ============
function FinalCTA() {
  return (
    <section className="relative overflow-hidden py-20 sm:py-28 bg-[#052e28] border-y border-emerald-500/20">
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(50% 60% at 80% 30%, rgba(16,185,129,0.25), transparent 60%), radial-gradient(40% 60% at 10% 80%, rgba(5,46,40,0.9), transparent 60%)",
        }}
      />
      <div className={`${container} relative`}>
        <div className="rounded-3xl border border-white/10 bg-black/30 backdrop-blur-sm p-8 sm:p-12 shadow-[0_40px_80px_-40px_rgba(0,0,0,0.6)]">
          <div className="grid lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-300 uppercase tracking-widest">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Simulação gratuita
              </div>
              <h2 className="mt-4 text-2xl sm:text-[34px] font-semibold text-white tracking-tight leading-tight max-w-xl">
                Pronto para alcançar sua base pelo{" "}
                <span className="text-emerald-300">WhatsApp Oficial?</span>
              </h2>
              <p className="mt-3 text-[15px] text-emerald-100/70 max-w-lg">
                Simule o volume e receba a proposta em minutos, direto no
                WhatsApp comercial.
              </p>
            </div>
            <div className="lg:col-span-4 flex flex-col sm:flex-row lg:flex-col gap-3 lg:items-stretch">
              <button
                onClick={() => {
                  trackPixel("ClickPrimaryCTA", { source: "final" });
                  openWhatsApp(
                    "Olá! Quero simular uma campanha de WhatsApp pela Disparos FR."
                  );
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-4 text-[15px] font-semibold text-[#052e28] hover:bg-emerald-50 shadow-[0_10px_30px_-10px_rgba(255,255,255,0.4)] transition-all"
              >
                Simular minha campanha
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={() =>
                  openWhatsApp(
                    "Olá! Vim do site da Disparos FR e gostaria de falar com um especialista."
                  )
                }
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-5 py-4 text-[15px] font-medium text-white hover:bg-white/10 transition-colors"
              >
                <MessageCircle className="h-4 w-4 text-emerald-300" />
                Falar com um especialista
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============ FOOTER ============
function Footer() {
  return (
    <footer className="border-t border-white/5 bg-[#0a0b0d] pt-14 pb-10">
      <div className={container}>
        <div className="grid md:grid-cols-12 gap-10">
          <div className="md:col-span-5">
            <img
              src={logoAsset.url}
              alt="Disparos FR"
              className="h-8 w-auto"
            />
            <p className="mt-4 text-[13px] text-neutral-400 leading-relaxed max-w-sm">
              Campanhas realizadas por meio da API Oficial do WhatsApp
              Business, para empresas com base própria e autorizada.
            </p>
          </div>
          <div className="md:col-span-3">
            <div className="text-[11px] font-medium uppercase tracking-widest text-neutral-500">
              Navegação
            </div>
            <ul className="mt-4 space-y-2.5 text-[13px] text-neutral-400">
              <li>
                <button onClick={() => scrollToId("como-funciona")} className="hover:text-white">
                  Como funciona
                </button>
              </li>
              <li>
                <button onClick={() => scrollToId("simulador")} className="hover:text-white">
                  Simulador
                </button>
              </li>
              <li>
                <button onClick={() => scrollToId("painel")} className="hover:text-white">
                  Painel
                </button>
              </li>
              <li>
                <button onClick={() => scrollToId("faq")} className="hover:text-white">
                  Dúvidas
                </button>
              </li>
            </ul>
          </div>
          <div className="md:col-span-4">
            <div className="text-[11px] font-medium uppercase tracking-widest text-neutral-500">
              Contato
            </div>
            <ul className="mt-4 space-y-2.5 text-[13px] text-neutral-400">
              <li>
                <button
                  onClick={() => openWhatsApp()}
                  className="hover:text-white inline-flex items-center gap-2"
                >
                  <MessageCircle className="h-3.5 w-3.5 text-emerald-500" />
                  WhatsApp comercial
                </button>
              </li>
              <li>
                <a href="mailto:contato@disparosfr.com" className="hover:text-white">
                  contato@disparosfr.com
                </a>
              </li>
              <li>
                <a href="/politica-de-privacidade" className="hover:text-white">
                  Política de Privacidade
                </a>
              </li>
              <li>
                <a href="/politica-de-privacidade" className="hover:text-white">
                  Termos de Uso
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-white/5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-[12px] text-neutral-500">
          <div>
            <div>
              © {new Date().getFullYear()} Disparos FR ·{" "}
              <span className="text-neutral-600">Razão Social a definir</span> ·{" "}
              <span className="text-neutral-600">CNPJ 00.000.000/0001-00</span>
            </div>
            <div className="mt-1 text-neutral-600">
              Operação exclusiva para bases próprias e autorizadas.
            </div>
          </div>
          <p className="max-w-sm md:text-right">
            WhatsApp é marca registrada da Meta. Disparos FR não possui vínculo
            institucional com a Meta.
          </p>
        </div>
      </div>
    </footer>
  );
}

// ============ MOBILE STICKY CTA ============
function MobileStickyCTA() {
  const [visible, setVisible] = useState(false);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    function check() {
      const form = document.getElementById("formulario");
      const inForm =
        form && form.getBoundingClientRect().top < window.innerHeight * 0.9;
      setVisible(window.scrollY > 400 && !inForm);
    }
    function onScroll() {
      if (raf.current) return;
      raf.current = window.requestAnimationFrame(() => {
        raf.current = null;
        check();
      });
    }
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!visible) return null;
  return (
    <div className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-white/8 bg-[#0b0c0e]/95 backdrop-blur px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
      <button
        onClick={() => {
          trackPixel("ClickPrimaryCTA", { source: "sticky-mobile" });
          openWhatsApp(
            "Olá! Quero simular uma campanha de WhatsApp pela Disparos FR."
          );
        }}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3.5 text-[15px] font-medium text-neutral-950"
      >
        Simular minha campanha
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}
