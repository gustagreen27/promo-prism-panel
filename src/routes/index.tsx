import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Menu,
  X,
  MessageCircle,
  ShieldCheck,
  BarChart3,
  MapPin,
  Headphones,
  Zap,
  Users,
  Send,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  Plus,
  Sparkles,
  LineChart,
  Target,
  Palette,
  Clock,
  Activity,
  ArrowRight,
} from "lucide-react";

// ============ CONFIG ============
const WHATSAPP_NUMBER = "5511999999999"; // editar aqui
const BRAND = { primary: "#22c55e" };

// ============ META PIXEL EVENTS ============
type PixelEvent =
  | "PageView"
  | "ClickPrimaryCTA"
  | "StartSimulation"
  | "SelectVolume"
  | "StartForm"
  | "CompleteForm"
  | "ClickWhatsApp";

function trackPixel(event: PixelEvent, data?: Record<string, unknown>) {
  // Preparado para Meta Pixel: window.fbq && window.fbq('trackCustom', event, data)
  if (typeof window !== "undefined") {
    // eslint-disable-next-line no-console
    console.debug("[pixel]", event, data ?? {});
    const w = window as unknown as { fbq?: (...args: unknown[]) => void };
    if (typeof w.fbq === "function") {
      w.fbq("trackCustom", event, data ?? {});
    }
  }
}

// ============ HELPERS ============
const VOLUMES = [
  { key: "10k", label: "10 mil contatos", count: 10000, price: 0.27 },
  { key: "50k", label: "50 mil contatos", count: 50000, price: 0.22 },
  { key: "100k", label: "100 mil contatos", count: 100000, price: 0.19 },
  { key: "250k", label: "250 mil contatos", count: 250000, price: 0.16 },
  { key: "250k+", label: "Mais de 250 mil contatos", count: 300000, price: 0.13 },
] as const;

type VolumeKey = (typeof VOLUMES)[number]["key"];

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
  "Apenas estou pesquisando",
];

const BASE_OPTIONS = ["Sim", "Parcialmente", "Ainda preciso verificar"];

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function formatNumber(v: number) {
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
          "Disparos FR — Campanhas de WhatsApp pela API Oficial a partir de R$ 0,13",
      },
      {
        name: "description",
        content:
          "Campanhas de WhatsApp em escala pela API Oficial: relatórios em tempo real, segmentação por DDD e suporte especializado para bases acima de 10 mil contatos.",
      },
      {
        property: "og:title",
        content: "Disparos FR — WhatsApp em escala pela API Oficial",
      },
      {
        property: "og:description",
        content:
          "Simule sua campanha, veja o valor por envio e fale com um especialista.",
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
    <div className="min-h-screen bg-[#08090b] text-white font-sans antialiased selection:bg-emerald-500/30">
      <Header menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
      <Hero />
      <Credibility />
      <HowItWorks />
      <Simulator />
      <Differentiators />
      <DashboardDemo />
      <Results />
      <ForWho />
      <FAQ />
      <FinalCTA />
      <Footer />
      <FloatingWhatsApp />
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
  const links = [
    { label: "Como funciona", id: "como-funciona" },
    { label: "Diferenciais", id: "diferenciais" },
    { label: "Resultados", id: "resultados" },
    { label: "Dúvidas", id: "faq" },
  ];
  return (
    <header className="fixed top-0 inset-x-0 z-50 bg-[#08090b]/80 backdrop-blur-xl border-b border-white/5">
      <div className="max-w-7xl mx-auto px-5 h-16 flex items-center justify-between">
        <a href="#top" className="flex items-center gap-1 font-black tracking-tight text-lg">
          <span className="text-white">DISPAROS</span>
          <span className="text-emerald-500">FR</span>
        </a>
        <nav className="hidden md:flex items-center gap-8 text-sm text-gray-300">
          {links.map((l) => (
            <button
              key={l.id}
              onClick={() => scrollToId(l.id)}
              className="hover:text-white transition-colors"
            >
              {l.label}
            </button>
          ))}
          <button
            onClick={() => {
              trackPixel("ClickPrimaryCTA", { source: "header" });
              scrollToId("simulador");
            }}
            className="bg-emerald-500 text-black px-4 py-2 rounded-full text-sm font-semibold hover:bg-emerald-400 transition-all"
          >
            Simular campanha
          </button>
        </nav>
        <button
          className="md:hidden p-2 -mr-2 text-white"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Menu"
        >
          {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>
      {menuOpen && (
        <div className="md:hidden border-t border-white/5 bg-[#08090b] px-5 py-4 flex flex-col gap-4">
          {links.map((l) => (
            <button
              key={l.id}
              onClick={() => {
                setMenuOpen(false);
                setTimeout(() => scrollToId(l.id), 50);
              }}
              className="text-left text-gray-300 hover:text-white"
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
            className="bg-emerald-500 text-black px-4 py-3 rounded-full text-sm font-semibold"
          >
            Simular campanha
          </button>
        </div>
      )}
    </header>
  );
}

// ============ HERO ============
function Hero() {
  return (
    <section id="top" className="relative pt-28 md:pt-36 pb-20 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-20 left-1/4 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[140px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-emerald-500/5 rounded-full blur-[120px]" />
      </div>
      <div className="max-w-7xl mx-auto px-5 grid lg:grid-cols-2 gap-14 items-center relative">
        <div>
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full mb-6">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-xs font-semibold tracking-wide uppercase text-gray-300">
              API Oficial WhatsApp Business
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight leading-[1.05] mb-6">
            Disparos no WhatsApp pela API Oficial{" "}
            <span className="text-emerald-500">a partir de R$ 0,13</span>
          </h1>
          <p className="text-lg text-gray-300 leading-relaxed mb-3 max-w-xl">
            Alcance milhares de clientes com campanhas segmentadas, relatórios
            em tempo real e suporte completo na configuração.
          </p>
          <p className="text-sm text-gray-500 mb-8 max-w-xl">
            Solução indicada para empresas com bases acima de 10 mil contatos.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <button
              onClick={() => {
                trackPixel("ClickPrimaryCTA", { source: "hero" });
                scrollToId("simulador");
              }}
              className="px-6 py-4 bg-emerald-500 text-black rounded-2xl font-bold hover:bg-emerald-400 transition-all shadow-[0_10px_30px_-10px_rgba(34,197,94,0.6)] hover:-translate-y-0.5 flex items-center justify-center gap-2"
            >
              Calcular minha campanha <ArrowRight className="w-5 h-5" />
            </button>
            <button
              onClick={() =>
                openWhatsApp(
                  "Olá! Gostaria de falar com um especialista da Disparos FR."
                )
              }
              className="px-6 py-4 bg-white/5 border border-white/10 text-white rounded-2xl font-semibold hover:bg-white/10 transition-all flex items-center justify-center gap-2"
            >
              <MessageCircle className="w-5 h-5 text-emerald-500" />
              Falar com um especialista
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              "API Oficial",
              "Relatórios em tempo real",
              "Segmentação por DDD",
              "Suporte especializado",
            ].map((t) => (
              <span
                key={t}
                className="text-xs font-medium px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-gray-300"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
        <HeroMockup />
      </div>
    </section>
  );
}

function HeroMockup() {
  const [progress, setProgress] = useState(20);
  useEffect(() => {
    const id = setInterval(() => {
      setProgress((p) => (p >= 87 ? 87 : p + 1));
    }, 40);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="relative">
      <div className="absolute -inset-6 bg-gradient-to-tr from-emerald-500/20 to-transparent rounded-[2rem] blur-2xl" />
      <div className="relative bg-[#0f1114] border border-white/10 rounded-3xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 grid place-items-center">
              <Activity className="w-4 h-4 text-emerald-500" />
            </div>
            <div>
              <div className="text-sm font-semibold">Campanha #4821</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-widest">
                Base premium
              </div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Campanha em execução
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <MockStat label="Contatos" value="100.000" />
          <MockStat label="Enviados" value="87.432" accent />
          <MockStat label="Entregues" value="83.109" />
          <MockStat label="Falhas" value="4.323" muted />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400 font-medium">Progresso</span>
            <span className="text-sm font-bold text-emerald-400">
              {progress}%
            </span>
          </div>
          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="mt-5 pt-5 border-t border-white/5 flex items-center justify-between text-xs">
          <span className="text-gray-500">Última atualização agora</span>
          <span className="text-gray-400 font-medium">78,9 msg/min</span>
        </div>
      </div>
    </div>
  );
}

function MockStat({
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
    <div
      className={`rounded-2xl p-4 border ${
        accent
          ? "bg-emerald-500/10 border-emerald-500/20"
          : "bg-white/[0.02] border-white/5"
      }`}
    >
      <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
        {label}
      </div>
      <div
        className={`text-xl font-bold ${
          muted ? "text-gray-400" : accent ? "text-emerald-400" : "text-white"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

// ============ CREDIBILITY ============
function Credibility() {
  const items = [
    { n: "250 mil+", t: "Mensagens processadas" },
    { n: "10k a 250k", t: "Campanhas por operação" },
    { n: "Tempo real", t: "Acompanhamento da campanha" },
    { n: "Sempre", t: "Atendimento durante a campanha" },
  ];
  return (
    <section className="py-14 border-y border-white/5 bg-white/[0.015]">
      <div className="max-w-7xl mx-auto px-5 grid grid-cols-2 md:grid-cols-4 gap-8">
        {items.map((i) => (
          <div key={i.t} className="text-center md:text-left">
            <div className="text-2xl md:text-3xl font-black tracking-tight text-white">
              {i.n}
            </div>
            <div className="text-xs md:text-sm text-gray-400 mt-1">{i.t}</div>
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
      t: "Envie sua base",
      d: "Recebemos os contatos e analisamos a estrutura da sua campanha.",
    },
    {
      t: "Configuramos a campanha",
      d: "Preparamos número, identidade, mensagem, template e segmentação.",
    },
    {
      t: "Iniciamos os envios",
      d: "A campanha é executada utilizando a estrutura oficial do WhatsApp Business.",
    },
    {
      t: "Acompanhe os resultados",
      d: "Visualize enviados, entregues, falhas e o progresso da campanha em tempo real.",
    },
  ];
  return (
    <section id="como-funciona" className="py-24 md:py-32">
      <div className="max-w-7xl mx-auto px-5">
        <SectionTitle
          eyebrow="Como funciona"
          title="Sua campanha pronta em poucos passos"
        />
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4 mt-14">
          {steps.map((s, i) => (
            <div
              key={s.t}
              className="relative rounded-3xl bg-[#0f1114] border border-white/10 p-6 hover:border-emerald-500/30 transition-all group"
            >
              <div className="text-emerald-500 font-black text-sm mb-4 tracking-widest">
                0{i + 1}
              </div>
              <div className="text-lg font-bold mb-2">{s.t}</div>
              <p className="text-sm text-gray-400 leading-relaxed">{s.d}</p>
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============ SIMULATOR + FORM ============
type FormData = {
  volume: VolumeKey;
  segment: string;
  name: string;
  company: string;
  whatsapp: string;
  email: string;
  start: string;
  optin: string;
};

const STORAGE_KEY = "disparosfr:form";

function Simulator() {
  const [volume, setVolume] = useState<VolumeKey>("100k");
  const [showForm, setShowForm] = useState(false);

  const current = VOLUMES.find((v) => v.key === volume)!;
  const total = current.count * current.price;

  useEffect(() => {
    trackPixel("SelectVolume", { volume });
  }, [volume]);

  return (
    <section id="simulador" className="py-24 md:py-32 bg-white/[0.015] border-y border-white/5">
      <div className="max-w-6xl mx-auto px-5">
        <SectionTitle
          eyebrow="Simulador"
          title="Calcule sua campanha"
          subtitle="Selecione o tamanho da sua base para visualizar a condição estimada."
        />

        <div className="mt-12 grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-3">
            {VOLUMES.map((v) => {
              const active = v.key === volume;
              return (
                <button
                  key={v.key}
                  onClick={() => {
                    setVolume(v.key);
                    if (!showForm) trackPixel("StartSimulation");
                  }}
                  className={`w-full text-left rounded-2xl border p-5 flex items-center justify-between transition-all ${
                    active
                      ? "bg-emerald-500/10 border-emerald-500/50"
                      : "bg-[#0f1114] border-white/10 hover:border-white/20"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        active
                          ? "border-emerald-500 bg-emerald-500"
                          : "border-white/20"
                      }`}
                    >
                      {active && (
                        <div className="w-2 h-2 rounded-full bg-black" />
                      )}
                    </div>
                    <div>
                      <div className="font-semibold">{v.label}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {formatBRL(v.price)} por envio
                      </div>
                    </div>
                  </div>
                  <ChevronRight
                    className={`w-5 h-5 ${
                      active ? "text-emerald-500" : "text-gray-600"
                    }`}
                  />
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-2">
            <div className="sticky top-24 rounded-3xl bg-[#0f1114] border border-white/10 p-6">
              <div className="text-xs font-semibold text-emerald-500 uppercase tracking-widest mb-2">
                Resumo estimado
              </div>
              <div className="text-sm text-gray-400 mb-4">{current.label}</div>
              <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-5 mb-5">
                <div className="text-xs text-gray-400 mb-1">
                  Valor por envio
                </div>
                <div className="text-2xl font-black text-emerald-400 mb-4">
                  {formatBRL(current.price)}
                </div>
                <div className="text-xs text-gray-400 mb-1">Valor total estimado</div>
                <div className="text-3xl font-black text-white">
                  {formatBRL(total)}
                </div>
              </div>
              <ul className="space-y-2 text-sm text-gray-300 mb-5">
                {[
                  "Segmentação por DDD",
                  "Personalização da mensagem",
                  "Relatório em tempo real",
                  "Suporte durante a campanha",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-gray-500 leading-relaxed mb-5">
                Valor estimado. A proposta final pode variar conforme o tipo de
                campanha, estrutura necessária, template e qualidade da base.
              </p>
              <button
                onClick={() => {
                  trackPixel("StartForm");
                  setShowForm(true);
                  setTimeout(() => scrollToId("formulario"), 60);
                }}
                className="w-full py-4 bg-emerald-500 text-black rounded-2xl font-bold hover:bg-emerald-400 transition-all shadow-[0_10px_30px_-10px_rgba(34,197,94,0.6)]"
              >
                Continuar minha simulação
              </button>
            </div>
          </div>
        </div>

        {showForm && (
          <div id="formulario" className="mt-16">
            <QualifyForm initialVolume={volume} total={total} />
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
}: {
  initialVolume: VolumeKey;
  total: number;
}) {
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const [data, setData] = useState<FormData>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) return { ...JSON.parse(stored), volume: initialVolume };
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

  const totalSteps = 5;
  const currentVol = VOLUMES.find((v) => v.key === data.volume)!;
  const estimated = currentVol.count * currentVol.price;

  function update<K extends keyof FormData>(k: K, v: FormData[K]) {
    setData((d) => ({ ...d, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  }

  function validateStep(): boolean {
    const e: Partial<Record<keyof FormData, string>> = {};
    if (step === 2 && !data.segment) e.segment = "Selecione um segmento";
    if (step === 3) {
      if (!data.name.trim()) e.name = "Informe seu nome";
      if (!data.company.trim()) e.company = "Informe a empresa";
      const digits = data.whatsapp.replace(/\D/g, "");
      if (digits.length < 10) e.whatsapp = "WhatsApp inválido";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email))
        e.email = "E-mail inválido";
    }
    if (step === 4) {
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
      const msg = `Olá! Acabei de fazer uma simulação no site da Disparos FR.

Nome: ${data.name}
Empresa: ${data.company}
Segmento: ${data.segment}
Volume aproximado: ${currentVol.label}
Valor estimado: ${formatBRL(estimated)}
Previsão de início: ${data.start}

Gostaria de receber uma análise da minha campanha.`;
      openWhatsApp(msg);
    }, 1600);
  }

  if (done) {
    return (
      <div className="max-w-2xl mx-auto rounded-3xl bg-[#0f1114] border border-emerald-500/30 p-10 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 grid place-items-center mx-auto mb-6">
          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
        </div>
        <h3 className="text-2xl font-black mb-3">Simulação concluída!</h3>
        <p className="text-gray-400 mb-6">
          Agora vamos direcionar você para falar com um especialista da Disparos FR.
        </p>
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          Abrindo WhatsApp...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto rounded-3xl bg-[#0f1114] border border-white/10 p-6 md:p-8">
      <div className="flex items-center justify-between mb-2 text-xs text-gray-400">
        <span>
          Etapa {step} de {totalSteps}
        </span>
        <span>{Math.round((step / totalSteps) * 100)}%</span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden mb-8">
        <div
          className="h-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${(step / totalSteps) * 100}%` }}
        />
      </div>

      {step === 1 && (
        <StepShell title="Qual é o seu volume de contatos?">
          <div className="space-y-2">
            {VOLUMES.map((v) => (
              <label
                key={v.key}
                className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${
                  data.volume === v.key
                    ? "bg-emerald-500/10 border-emerald-500/50"
                    : "bg-white/[0.02] border-white/10 hover:border-white/20"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    className="accent-emerald-500"
                    checked={data.volume === v.key}
                    onChange={() => update("volume", v.key)}
                  />
                  <span className="font-medium">{v.label}</span>
                </div>
                <span className="text-sm text-gray-400">
                  {formatBRL(v.price)}
                </span>
              </label>
            ))}
          </div>
        </StepShell>
      )}

      {step === 2 && (
        <StepShell title="Qual é o segmento da sua empresa?">
          <div className="grid grid-cols-2 gap-2">
            {SEGMENTS.map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => update("segment", s)}
                className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                  data.segment === s
                    ? "bg-emerald-500/10 border-emerald-500/50 text-white"
                    : "bg-white/[0.02] border-white/10 text-gray-300 hover:border-white/20"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          {errors.segment && <ErrorMsg text={errors.segment} />}
        </StepShell>
      )}

      {step === 3 && (
        <StepShell title="Seus dados de contato">
          <div className="space-y-3">
            <Field
              label="Nome"
              value={data.name}
              onChange={(v) => update("name", v)}
              error={errors.name}
            />
            <Field
              label="Nome da empresa"
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
        </StepShell>
      )}

      {step === 4 && (
        <StepShell title="Sobre a sua campanha">
          <div>
            <div className="text-sm font-semibold mb-2">
              Quando pretende iniciar a campanha?
            </div>
            <div className="grid gap-2">
              {START_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => update("start", s)}
                  className={`text-left p-3 rounded-xl border text-sm transition-all ${
                    data.start === s
                      ? "bg-emerald-500/10 border-emerald-500/50"
                      : "bg-white/[0.02] border-white/10 hover:border-white/20"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            {errors.start && <ErrorMsg text={errors.start} />}
          </div>
          <div className="mt-6">
            <div className="text-sm font-semibold mb-2">
              Sua base é composta por clientes ou contatos que aceitaram receber
              comunicações?
            </div>
            <div className="grid gap-2">
              {BASE_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => update("optin", s)}
                  className={`text-left p-3 rounded-xl border text-sm transition-all ${
                    data.optin === s
                      ? "bg-emerald-500/10 border-emerald-500/50"
                      : "bg-white/[0.02] border-white/10 hover:border-white/20"
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

      {step === 5 && (
        <StepShell title="Confirme os dados da simulação">
          <div className="rounded-2xl bg-white/[0.02] border border-white/10 p-5 space-y-2 text-sm">
            <Row k="Nome" v={data.name} />
            <Row k="Empresa" v={data.company} />
            <Row k="Segmento" v={data.segment} />
            <Row k="Quantidade" v={currentVol.label} />
            <Row k="Valor estimado" v={formatBRL(estimated)} accent />
            <Row k="Prazo de início" v={data.start} />
          </div>
        </StepShell>
      )}

      <div className="flex items-center justify-between mt-8">
        <button
          onClick={() => setStep(Math.max(1, step - 1))}
          disabled={step === 1}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" /> Voltar
        </button>
        {step < totalSteps ? (
          <button
            onClick={next}
            className="px-6 py-3 bg-emerald-500 text-black rounded-xl font-bold hover:bg-emerald-400 transition-all flex items-center gap-2"
          >
            Continuar <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={submit}
            className="px-6 py-3 bg-emerald-500 text-black rounded-xl font-bold hover:bg-emerald-400 transition-all flex items-center gap-2"
          >
            <MessageCircle className="w-4 h-4" /> Receber proposta pelo WhatsApp
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
      <h3 className="text-xl md:text-2xl font-bold mb-5">{title}</h3>
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
      <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
        {label}
      </label>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-xl bg-white/[0.02] border ${
          error ? "border-red-500/60" : "border-white/10"
        } px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:border-emerald-500/60 transition-colors`}
      />
      {error && <ErrorMsg text={error} />}
    </div>
  );
}

function ErrorMsg({ text }: { text: string }) {
  return <div className="text-xs text-red-400 mt-1.5">{text}</div>;
}

function Row({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-400">{k}</span>
      <span
        className={`font-semibold text-right ${
          accent ? "text-emerald-400" : "text-white"
        }`}
      >
        {v || "—"}
      </span>
    </div>
  );
}

// ============ DIFFERENTIATORS ============
function Differentiators() {
  const items = [
    {
      i: ShieldCheck,
      t: "API Oficial",
      d: "Campanhas executadas utilizando a estrutura oficial do WhatsApp Business.",
    },
    {
      i: MapPin,
      t: "Segmentação por DDD",
      d: "Possibilidade de organizar campanhas por regiões e grupos específicos.",
    },
    {
      i: Sparkles,
      t: "Mensagens personalizadas",
      d: "Personalização com nome, telefone e outras informações disponíveis na base.",
    },
    {
      i: BarChart3,
      t: "Relatório em tempo real",
      d: "Acompanhe enviados, entregues, falhas e progresso da campanha.",
    },
    {
      i: Palette,
      t: "Identidade comercial",
      d: "Configuração de nome, foto e apresentação comercial do número.",
    },
    {
      i: Headphones,
      t: "Suporte especializado",
      d: "Acompanhamento antes, durante e após o início dos envios.",
    },
  ];
  return (
    <section id="diferenciais" className="py-24 md:py-32">
      <div className="max-w-7xl mx-auto px-5">
        <SectionTitle
          eyebrow="Diferenciais"
          title="Estrutura profissional para campanhas de grande volume"
        />
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 mt-14">
          {items.map((it) => (
            <div
              key={it.t}
              className="rounded-3xl bg-[#0f1114] border border-white/10 p-6 hover:border-emerald-500/30 hover:-translate-y-1 transition-all"
            >
              <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 grid place-items-center mb-5">
                <it.i className="w-5 h-5 text-emerald-500" />
              </div>
              <div className="text-lg font-bold mb-2">{it.t}</div>
              <p className="text-sm text-gray-400 leading-relaxed">{it.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============ DASHBOARD DEMO ============
function DashboardDemo() {
  const bars = [22, 38, 46, 55, 62, 71, 78, 84, 82, 88, 91, 87];
  return (
    <section className="py-24 md:py-32 bg-white/[0.015] border-y border-white/5">
      <div className="max-w-7xl mx-auto px-5">
        <SectionTitle
          eyebrow="Painel"
          title="Acompanhe cada etapa da sua campanha"
        />
        <div className="mt-14 rounded-3xl bg-[#0f1114] border border-white/10 p-6 md:p-8">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
            <StatCard label="Contatos" value="180.000" />
            <StatCard label="Enviadas" value="164.221" />
            <StatCard label="Entregues" value="158.902" accent />
            <StatCard label="Falhas" value="5.319" muted />
            <StatCard label="Taxa entrega" value="96,8%" />
            <StatCard label="Progresso" value="91%" accent />
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 rounded-2xl bg-white/[0.02] border border-white/5 p-5">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <div className="text-sm font-semibold">
                    Evolução dos envios
                  </div>
                  <div className="text-xs text-gray-500">Últimas 12 horas</div>
                </div>
                <LineChart className="w-5 h-5 text-emerald-500" />
              </div>
              <div className="flex items-end gap-2 h-40">
                {bars.map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-gradient-to-t from-emerald-500/60 to-emerald-400 rounded-t-md"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>
            <div className="rounded-2xl bg-white/[0.02] border border-white/5 p-5">
              <div className="text-sm font-semibold mb-4">Campanhas</div>
              <div className="space-y-3">
                {[
                  { n: "Base premium 12/26", s: "Em execução", c: "emerald" },
                  { n: "Reativação SP", s: "Concluída", c: "gray" },
                  { n: "Ofertas Sudeste", s: "Parcial", c: "yellow" },
                ].map((c) => (
                  <div
                    key={c.n}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-gray-300">{c.n}</span>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                        c.c === "emerald"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : c.c === "yellow"
                            ? "bg-yellow-500/15 text-yellow-400"
                            : "bg-white/10 text-gray-400"
                      }`}
                    >
                      {c.s}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatCard({
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
    <div
      className={`rounded-2xl p-4 border ${
        accent
          ? "bg-emerald-500/10 border-emerald-500/20"
          : "bg-white/[0.02] border-white/5"
      }`}
    >
      <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
        {label}
      </div>
      <div
        className={`text-lg md:text-xl font-bold ${
          muted ? "text-gray-400" : accent ? "text-emerald-400" : "text-white"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

// ============ RESULTS ============
function Results() {
  const cases = [
    {
      seg: "Serviços financeiros",
      items: [
        "18.000 contatos processados",
        "16.560 mensagens entregues",
        "92% de taxa de entrega",
      ],
    },
    {
      seg: "Varejo",
      items: [
        "50.000 contatos processados",
        "Campanha segmentada por região",
        "Relatório completo em tempo real",
      ],
    },
  ];
  return (
    <section id="resultados" className="py-24 md:py-32">
      <div className="max-w-7xl mx-auto px-5">
        <SectionTitle
          eyebrow="Resultados"
          title="Resultados que você consegue acompanhar"
        />
        <div className="grid md:grid-cols-2 gap-5 mt-14">
          {cases.map((c) => (
            <div
              key={c.seg}
              className="rounded-3xl bg-[#0f1114] border border-white/10 p-8"
            >
              <div className="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-4">
                {c.seg}
              </div>
              <ul className="space-y-3">
                {c.items.map((i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-emerald-500/15 grid place-items-center shrink-0 mt-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                    <span className="text-gray-200">{i}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-6 text-center max-w-2xl mx-auto">
          Os resultados podem variar conforme a qualidade da base, o conteúdo
          utilizado e as condições da campanha.
        </p>
      </div>
    </section>
  );
}

// ============ FOR WHO ============
function ForWho() {
  const list = [
    { i: Users, t: "Empresas com bases próprias de clientes" },
    { i: Target, t: "Operações com mais de 10 mil contatos" },
    { i: Zap, t: "Campanhas promocionais" },
    { i: Send, t: "Comunicados e atualizações" },
    { i: Sparkles, t: "Lançamentos e ofertas" },
    { i: Clock, t: "Recuperação e reativação de clientes" },
    { i: MapPin, t: "Campanhas segmentadas por região" },
  ];
  return (
    <section className="py-24 md:py-32 bg-white/[0.015] border-y border-white/5">
      <div className="max-w-7xl mx-auto px-5 grid lg:grid-cols-2 gap-12 items-start">
        <div>
          <SectionTitle
            eyebrow="Para quem é"
            title="Para empresas que precisam alcançar sua base em escala"
            align="left"
          />
          <ul className="mt-10 grid sm:grid-cols-2 gap-3">
            {list.map((l) => (
              <li
                key={l.t}
                className="flex items-center gap-3 p-4 rounded-2xl bg-[#0f1114] border border-white/10"
              >
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 grid place-items-center shrink-0">
                  <l.i className="w-4 h-4 text-emerald-500" />
                </div>
                <span className="text-sm font-medium">{l.t}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-3xl bg-gradient-to-br from-yellow-500/10 to-transparent border border-yellow-500/20 p-8 lg:mt-24">
          <div className="flex items-center gap-3 mb-3">
            <AlertTriangle className="w-6 h-6 text-yellow-500" />
            <div className="text-lg font-bold">Importante</div>
          </div>
          <p className="text-gray-300 leading-relaxed">
            A base deve ser própria e composta por pessoas que esperam ou
            autorizaram receber comunicações da empresa.
          </p>
        </div>
      </div>
    </section>
  );
}

// ============ FAQ ============
function FAQ() {
  const items = [
    [
      "A campanha utiliza a API Oficial do WhatsApp?",
      "Sim. A operação utiliza uma estrutura compatível com o WhatsApp Business, respeitando as condições necessárias para cada campanha.",
    ],
    [
      "Posso enviar para qualquer lista de contatos?",
      "Não. A base deve ser própria e composta por pessoas que possuem relação com a empresa ou autorizaram receber comunicações.",
    ],
    [
      "Vocês ajudam com a mensagem da campanha?",
      "Sim. A equipe auxilia na estruturação e adaptação da mensagem e do template.",
    ],
    [
      "Consigo acompanhar os envios?",
      "Sim. O cliente recebe informações de enviados, entregues, falhas e progresso da campanha.",
    ],
    [
      "Qual é o volume mínimo?",
      "A solução é indicada principalmente para campanhas acima de 10 mil contatos.",
    ],
    [
      "O preço de R$ 0,13 vale para qualquer campanha?",
      "O valor de R$ 0,13 é destinado a campanhas acima de 250 mil contatos. Volumes menores possuem condições diferentes.",
    ],
    [
      "Quanto tempo demora para iniciar?",
      "O prazo depende da análise da campanha, da base, do template e da estrutura necessária.",
    ],
  ];
  return (
    <section id="faq" className="py-24 md:py-32">
      <div className="max-w-3xl mx-auto px-5">
        <SectionTitle eyebrow="Dúvidas" title="Perguntas frequentes" />
        <div className="mt-12 space-y-2">
          {items.map(([q, a]) => (
            <details
              key={q}
              className="group border border-white/10 rounded-2xl bg-[#0f1114] px-5 open:border-emerald-500/30"
            >
              <summary className="flex items-center justify-between py-5 cursor-pointer list-none">
                <span className="text-base font-semibold pr-4">{q}</span>
                <Plus className="w-5 h-5 shrink-0 text-emerald-500 transition-transform group-open:rotate-45" />
              </summary>
              <p className="pb-5 pt-0 text-gray-400 leading-relaxed text-sm">
                {a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============ FINAL CTA ============
function FinalCTA() {
  return (
    <section className="py-24 md:py-32">
      <div className="max-w-7xl mx-auto px-5">
        <div className="relative rounded-[2.5rem] bg-gradient-to-br from-emerald-500/15 via-[#0f1114] to-[#0f1114] border border-emerald-500/20 p-10 md:p-16 text-center overflow-hidden">
          <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none" />
          <div className="relative">
            <h2 className="text-3xl md:text-5xl font-black tracking-tight mb-5">
              Pronto para alcançar sua base de clientes?
            </h2>
            <p className="text-gray-300 text-lg mb-10 max-w-xl mx-auto">
              Faça uma simulação gratuita e receba uma análise da sua campanha.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => {
                  trackPixel("ClickPrimaryCTA", { source: "final" });
                  scrollToId("simulador");
                }}
                className="px-8 py-4 bg-emerald-500 text-black rounded-2xl font-bold hover:bg-emerald-400 transition-all shadow-[0_10px_30px_-10px_rgba(34,197,94,0.6)]"
              >
                Simular minha campanha
              </button>
              <button
                onClick={() =>
                  openWhatsApp(
                    "Olá! Vim do site da Disparos FR e gostaria de mais informações."
                  )
                }
                className="px-8 py-4 bg-white/5 border border-white/10 rounded-2xl font-semibold hover:bg-white/10 transition-all flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-5 h-5 text-emerald-500" />
                Chamar no WhatsApp
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
    <footer className="border-t border-white/5 py-14 bg-[#08090b]">
      <div className="max-w-7xl mx-auto px-5">
        <div className="grid md:grid-cols-4 gap-10 mb-10">
          <div className="md:col-span-2">
            <div className="font-black text-lg tracking-tight mb-3">
              <span className="text-white">DISPAROS</span>
              <span className="text-emerald-500">FR</span>
            </div>
            <p className="text-sm text-gray-400 max-w-sm leading-relaxed">
              Campanhas de WhatsApp pela API Oficial com relatórios em tempo
              real e suporte especializado para operações em escala.
            </p>
          </div>
          <div>
            <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">
              Navegação
            </div>
            <ul className="space-y-2 text-sm text-gray-400">
              <li>
                <button
                  onClick={() => scrollToId("como-funciona")}
                  className="hover:text-white"
                >
                  Como funciona
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToId("diferenciais")}
                  className="hover:text-white"
                >
                  Diferenciais
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToId("resultados")}
                  className="hover:text-white"
                >
                  Resultados
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToId("faq")}
                  className="hover:text-white"
                >
                  Dúvidas
                </button>
              </li>
            </ul>
          </div>
          <div>
            <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">
              Institucional
            </div>
            <ul className="space-y-2 text-sm text-gray-400">
              <li>
                <a
                  href="/politica-de-privacidade"
                  className="hover:text-white"
                >
                  Política de Privacidade
                </a>
              </li>
              <li>
                <a
                  href="/politica-de-privacidade"
                  className="hover:text-white"
                >
                  Termos de Uso
                </a>
              </li>
              <li>
                <button
                  onClick={() => openWhatsApp()}
                  className="hover:text-white"
                >
                  Canal de atendimento
                </button>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/5 pt-6 flex flex-col md:flex-row md:justify-between gap-4 text-xs text-gray-500">
          <p>© {new Date().getFullYear()} Disparos FR. Todos os direitos reservados.</p>
          <p className="max-w-2xl md:text-right">
            A Disparos FR não realiza campanhas para bases adquiridas sem
            autorização ou para conteúdos que violem as políticas do WhatsApp
            Business.
          </p>
        </div>
      </div>
    </footer>
  );
}

// ============ FLOATING WHATSAPP ============
function FloatingWhatsApp() {
  return (
    <button
      onClick={() => openWhatsApp("Olá! Vim do site da Disparos FR.")}
      className="fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-emerald-500 text-black shadow-[0_10px_30px_-5px_rgba(34,197,94,0.6)] grid place-items-center hover:scale-110 active:scale-95 transition-transform"
      aria-label="Falar no WhatsApp"
    >
      <MessageCircle className="w-6 h-6" />
    </button>
  );
}

// ============ SHARED ============
function SectionTitle({
  eyebrow,
  title,
  subtitle,
  align = "center",
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: "center" | "left";
}) {
  return (
    <div className={align === "center" ? "text-center max-w-3xl mx-auto" : ""}>
      {eyebrow && (
        <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-400">
            {eyebrow}
          </span>
        </div>
      )}
      <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-tight">
        {title}
      </h2>
      {subtitle && (
        <p className="text-gray-400 mt-4 text-base md:text-lg">{subtitle}</p>
      )}
    </div>
  );
}

// unused export to silence tree-shake noise
export const __brand = BRAND;
export const __formatN = formatNumber;
