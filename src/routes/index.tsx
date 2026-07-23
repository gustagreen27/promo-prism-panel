import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
} from "lucide-react";
import logoAsset from "@/assets/disparos-fr-logo-new.png.asset.json";

// ============ CONFIG ============
const WHATSAPP_NUMBER = "5511999999999"; // editar aqui

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
  { min: 10_000, max: 49_999, price: 0.27, label: "10 mil a 50 mil" },
  { min: 50_000, max: 99_999, price: 0.22, label: "50 mil a 100 mil" },
  { min: 100_000, max: 249_999, price: 0.19, label: "100 mil a 250 mil" },
  { min: 250_000, max: Infinity, price: 0.13, label: "Acima de 250 mil" },
] as const;

const PRESETS = [10_000, 25_000, 50_000, 100_000, 250_000, 500_000];

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

const BASE_OPTIONS = ["Sim", "Parcialmente", "Ainda preciso verificar"];

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
          "Disparos FR — Campanhas de WhatsApp pela API Oficial para bases 10k+",
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
        <SimulatorSection />
        <PanelSection />
        <UseCases />
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
              scrollToId("simulador");
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
              setTimeout(() => scrollToId("simulador"), 50);
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
function Hero() {
  return (
    <section id="top" className="relative pt-28 sm:pt-32 pb-16 sm:pb-24">
      {/* single subtle atmosphere — sem glow verde exagerado */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[420px] pointer-events-none"
        style={{
          background:
            "radial-gradient(60% 60% at 70% 0%, rgba(255,255,255,0.04), transparent 70%)",
        }}
      />
      <div className={`${container} relative grid lg:grid-cols-12 gap-10 lg:gap-14 items-start`}>
        <div className="lg:col-span-6 lg:pt-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-neutral-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Para empresas com bases acima de 10 mil contatos
          </div>
          <h1 className="mt-5 text-[34px] sm:text-5xl lg:text-[56px] font-semibold tracking-tight leading-[1.05] text-white">
            Alcance sua base de clientes pelo{" "}
            <span className="whitespace-nowrap">WhatsApp Oficial</span>
          </h1>
          <p className="mt-4 text-lg text-neutral-300">
            Campanhas{" "}
            <span className="font-semibold text-emerald-400">
              a partir de R$ 0,13 por envio
            </span>
            <span className="block text-[13px] text-neutral-500 mt-1">
              Condição disponível para volumes acima de 250 mil contatos.
            </span>
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-neutral-300 max-w-lg">
            Você envia a base. Nossa equipe configura a campanha. E você
            acompanha enviados, entregues e falhas em tempo real.
          </p>

          <div className="mt-7 flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => {
                trackPixel("ClickPrimaryCTA", { source: "hero" });
                scrollToId("simulador");
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

          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-neutral-400">
            <li className="inline-flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-emerald-500" />
              Simulação gratuita
            </li>
            <li className="inline-flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-emerald-500" />
              Sem compromisso
            </li>
            <li className="inline-flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-emerald-500" />
              Atendimento humano
            </li>
          </ul>
        </div>

        <div className="lg:col-span-6">
          <DashboardMock compact />
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
    { n: "10k – 500k+", t: "Contatos por campanha" },
    { n: "API Oficial", t: "WhatsApp Business Platform" },
    { n: "Tempo real", t: "Acompanhamento de envios" },
    { n: "Atendimento", t: "Especialista dedicado" },
  ];
  return (
    <section className="border-y border-white/5 bg-white/[0.015]">
      <div className={`${container} grid grid-cols-2 md:grid-cols-4 py-8`}>
        {items.map((i, idx) => (
          <div
            key={i.t}
            className={`px-2 ${idx > 0 ? "md:border-l md:border-white/5" : ""}`}
          >
            <div className="text-[19px] sm:text-[22px] font-semibold text-white tracking-tight">
              {i.n}
            </div>
            <div className="mt-1 text-[12px] text-neutral-500">{i.t}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ============ HOW IT WORKS ============
function HowItWorks() {
  const steps = [
    {
      n: "01",
      t: "Você envia a base",
      d: "Recebemos os contatos, o objetivo da campanha e a mensagem que você quer transmitir.",
    },
    {
      n: "02",
      t: "A equipe configura",
      d: "Preparamos número, template, identidade comercial e segmentação por DDD.",
    },
    {
      n: "03",
      t: "A campanha executa",
      d: "Os envios rodam pela API Oficial com controle de velocidade e retentativa.",
    },
    {
      n: "04",
      t: "Você acompanha",
      d: "Enviados, entregues, falhas e progresso atualizados no painel em tempo real.",
    },
  ];
  return (
    <section id="como-funciona" className="py-20 sm:py-28">
      <div className={container}>
        <div className="grid lg:grid-cols-12 gap-10">
          <div className="lg:col-span-5">
            <SectionHead
              eyebrow="Como funciona"
              title={
                <>
                  Uma operação
                  <br />
                  em quatro passos.
                </>
              }
              lead="Você envia a base. A equipe configura a campanha. E você acompanha a execução."
            />
          </div>
          <ol className="lg:col-span-7 divide-y divide-white/5 border-y border-white/5">
            {steps.map((s) => (
              <li
                key={s.n}
                className="grid grid-cols-[64px_1fr] gap-4 py-6 items-start"
              >
                <div className="text-[13px] font-mono text-neutral-500 pt-1">
                  {s.n}
                </div>
                <div>
                  <div className="text-[17px] font-medium text-white">
                    {s.t}
                  </div>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-neutral-400">
                    {s.d}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

// ============ SIMULATOR ============
type FormData = {
  volume: number;
  segment: string;
  name: string;
  company: string;
  whatsapp: string;
  email: string;
  start: string;
  optin: string;
};

const STORAGE_KEY = "disparosfr:form";

function SimulatorSection() {
  const [volume, setVolume] = useState<number>(100_000);
  const [showForm, setShowForm] = useState(false);
  const [started, setStarted] = useState(false);
  const { price, tier } = useMemo(() => priceFor(volume), [volume]);
  const total = volume * price;

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
      className="relative border-y border-white/5 bg-[#0d0e11] py-20 sm:py-28"
    >
      <div className={container}>
        <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          <div className="lg:col-span-5">
            <SectionHead
              eyebrow="Simulador"
              title={
                <>
                  Calcule sua campanha em segundos.
                </>
              }
              lead="Escolha o volume da base e veja a faixa comercial aplicada. Depois você recebe a proposta detalhada pelo WhatsApp."
            />
            <ul className="mt-8 space-y-3 text-[14px] text-neutral-300">
              <li className="flex gap-3">
                <Check className="mt-0.5 h-4 w-4 text-emerald-500 shrink-0" />
                Valor por envio varia conforme o volume selecionado.
              </li>
              <li className="flex gap-3">
                <Check className="mt-0.5 h-4 w-4 text-emerald-500 shrink-0" />
                Preço de R$ 0,13 aplicável para bases acima de 250 mil.
              </li>
              <li className="flex gap-3">
                <Check className="mt-0.5 h-4 w-4 text-emerald-500 shrink-0" />
                Proposta final considera template, segmentação e estrutura.
              </li>
            </ul>
          </div>

          <div className="lg:col-span-7">
            <div className="grid md:grid-cols-5 gap-4">
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
                        onPickPreset(Math.max(10_000, volume - 10_000))
                      }
                      className="h-9 w-9 grid place-items-center rounded-md border border-white/8 bg-white/[0.02] text-neutral-300 hover:bg-white/[0.06]"
                      aria-label="Diminuir"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() =>
                        onPickPreset(Math.min(1_000_000, volume + 10_000))
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
                  min={10_000}
                  max={1_000_000}
                  step={5_000}
                  value={volume}
                  onChange={(e) => onPickPreset(Number(e.target.value))}
                  className="mt-5 w-full accent-emerald-500"
                  aria-label="Volume de contatos"
                />
                <div className="mt-1 flex justify-between text-[11px] text-neutral-500">
                  <span>10k</span>
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

                <div className="mt-5 rounded-xl border border-white/6 bg-white/[0.02] p-4 text-[12px] text-neutral-400 leading-relaxed">
                  Sua base deve ser própria e composta por contatos que
                  esperam ou autorizaram receber comunicações.
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
                  <div className="text-[26px] font-semibold text-emerald-400 tabular-nums leading-none mt-1">
                    {formatBRL(price)}
                  </div>
                </div>
                <div className="mt-5 pt-5 border-t border-white/5">
                  <div className="text-[12px] text-neutral-500">
                    Total estimado
                  </div>
                  <div className="text-[24px] font-semibold text-white tabular-nums leading-none mt-1">
                    {formatBRL(total)}
                  </div>
                </div>
                <button
                  onClick={() => {
                    trackPixel("StartForm");
                    setShowForm(true);
                    setTimeout(() => scrollToId("formulario"), 60);
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
                <QualifyForm initialVolume={volume} total={total} />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ============ FORM ============
function QualifyForm({
  initialVolume,
  total: _total,
}: {
  initialVolume: number;
  total: number;
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
      email: "",
      start: "",
      optin: "",
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
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email))
        e.email = "E-mail inválido";
    }
    if (step === 3) {
      if (!data.start) e.start = "Selecione uma opção";
      if (!data.optin) e.optin = "Selecione uma opção";
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
      const msg = `Olá! Fiz uma simulação no site da Disparos FR.

Nome: ${data.name}
Empresa: ${data.company}
Segmento: ${data.segment}
Volume: ${formatInt(data.volume)} contatos (${tier.label})
Valor estimado: ${formatBRL(estimated)}
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
                label="E-mail"
                value={data.email}
                onChange={(v) => update("email", v)}
                placeholder="voce@empresa.com"
                type="email"
                error={errors.email}
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
            <div className="mt-5">
              <div className="text-[13px] font-medium text-neutral-300 mb-2">
                Sua base autorizou receber comunicações da empresa?
              </div>
              <div className="grid sm:grid-cols-3 gap-2">
                {BASE_OPTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => update("optin", s)}
                    className={`min-h-12 rounded-lg border px-3 py-3 text-[14px] transition-colors text-left ${
                      data.optin === s
                        ? "bg-emerald-500/10 border-emerald-500/50 text-white"
                        : "bg-white/[0.02] border-white/8 text-neutral-300 hover:bg-white/[0.05]"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              {errors.optin && <ErrorMsg text={errors.optin} />}
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
            <MessageCircle className="h-4 w-4" /> Receber proposta no WhatsApp
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
function PanelSection() {
  return (
    <section id="painel" className="py-20 sm:py-28">
      <div className={container}>
        <div className="grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-5 order-2 lg:order-1">
            <DashboardMock />
          </div>
          <div className="lg:col-span-7 order-1 lg:order-2 lg:pl-6">
            <SectionHead
              eyebrow="Painel"
              title={
                <>
                  Saiba quantas mensagens foram enviadas, entregues ou
                  apresentaram falha.
                </>
              }
              lead="Cada campanha tem seu próprio painel com progresso, velocidade e detalhamento por número."
            />
            <dl className="mt-8 grid sm:grid-cols-2 gap-x-8 gap-y-6 max-w-lg">
              <PanelPoint
                k="Progresso ao vivo"
                v="Contatos, enviados, entregues e falhas atualizados durante a execução."
              />
              <PanelPoint
                k="Velocidade e ETA"
                v="Msg/min em tempo real e estimativa de término da campanha."
              />
              <PanelPoint
                k="Retentativa automática"
                v="Falhas transitórias entram em nova tentativa sem intervenção manual."
              />
              <PanelPoint
                k="Filtro por período"
                v="Comparação por dia, semana ou mês entre campanhas."
              />
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}

function PanelPoint({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[14px] font-medium text-white">{k}</dt>
      <dd className="mt-1 text-[13px] text-neutral-400 leading-relaxed">{v}</dd>
    </div>
  );
}

// ============ USE CASES (editorial rows) ============
function UseCases() {
  const rows = [
    {
      seg: "Serviços financeiros",
      title: "Reativação de base inativa",
      metrics: [
        { k: "Contatos", v: "18.240" },
        { k: "Entregues", v: "16.560" },
        { k: "Entrega", v: "90,8%" },
      ],
      note: "Campanha segmentada por DDD com template aprovado.",
    },
    {
      seg: "Varejo",
      title: "Comunicado de oferta regional",
      metrics: [
        { k: "Contatos", v: "52.100" },
        { k: "Entregues", v: "48.973" },
        { k: "Entrega", v: "94,0%" },
      ],
      note: "Envio dividido em janelas por região.",
    },
    {
      seg: "Infoprodutos",
      title: "Lançamento com aviso prévio",
      metrics: [
        { k: "Contatos", v: "132.480" },
        { k: "Entregues", v: "125.106" },
        { k: "Entrega", v: "94,4%" },
      ],
      note: "Duas ondas para checar deliverability antes do volume total.",
    },
  ];
  return (
    <section
      id="casos"
      className="border-y border-white/5 bg-white/[0.015] py-20 sm:py-28"
    >
      <div className={container}>
        <SectionHead
          eyebrow="Operações"
          title="Volumes reais operados por segmento"
          lead="Exemplos de execuções anonimizadas. Resultados variam conforme base, mensagem e configuração."
        />
        <div className="mt-12 divide-y divide-white/5 border-y border-white/5">
          {rows.map((r) => (
            <article
              key={r.title}
              className="grid grid-cols-1 md:grid-cols-12 gap-6 py-8 items-start"
            >
              <div className="md:col-span-4">
                <div className="text-[11px] uppercase tracking-widest text-neutral-500">
                  {r.seg}
                </div>
                <h3 className="mt-1 text-[19px] font-medium text-white">
                  {r.title}
                </h3>
                <p className="mt-2 text-[13px] text-neutral-400">{r.note}</p>
              </div>
              <div className="md:col-span-8 grid grid-cols-3 gap-3">
                {r.metrics.map((m) => (
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
            </article>
          ))}
        </div>
        <p className="mt-6 text-[12px] text-neutral-500 inline-flex items-center gap-2">
          <Circle className="h-2 w-2 fill-neutral-600 text-neutral-600" />
          Dados de operações anonimizadas. Demonstração da plataforma.
        </p>
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
      "Trabalhamos com operações a partir de 10 mil contatos. Volumes menores podem ser avaliados sob consulta.",
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
    <section className="py-20 sm:py-28">
      <div className={container}>
        <div className="rounded-2xl border border-white/8 bg-[#111317] p-8 sm:p-12">
          <div className="grid lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-8">
              <h2 className="text-2xl sm:text-[32px] font-semibold text-white tracking-tight leading-tight max-w-xl">
                Pronto para alcançar sua base pelo WhatsApp Oficial?
              </h2>
              <p className="mt-3 text-[15px] text-neutral-400 max-w-lg">
                Simule o volume e receba a proposta em minutos, direto no
                WhatsApp comercial.
              </p>
            </div>
            <div className="lg:col-span-4 flex flex-col sm:flex-row lg:flex-col gap-3 lg:items-stretch">
              <button
                onClick={() => {
                  trackPixel("ClickPrimaryCTA", { source: "final" });
                  scrollToId("simulador");
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3.5 text-[15px] font-medium text-neutral-950 hover:bg-emerald-400 transition-colors"
              >
                Calcular minha campanha
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={() =>
                  openWhatsApp(
                    "Olá! Vim do site da Disparos FR e gostaria de mais informações."
                  )
                }
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-5 py-3.5 text-[15px] font-medium text-neutral-100 hover:bg-white/[0.05] transition-colors"
              >
                <MessageCircle className="h-4 w-4 text-emerald-500" />
                Falar com especialista
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
              Campanhas de WhatsApp pela API Oficial para empresas com base
              autorizada.
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
          scrollToId("simulador");
        }}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3.5 text-[15px] font-medium text-neutral-950"
      >
        Simular campanha
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}
