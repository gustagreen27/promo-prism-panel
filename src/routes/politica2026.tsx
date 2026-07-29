import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

const WA_NUMBER = "5511958883223"; // ajuste se necessário
const WA_MSG = encodeURIComponent(
  "Olá! Sou de uma campanha política e quero saber mais sobre o serviço da Disparos FR.",
);
const WA_LINK = `https://wa.me/${WA_NUMBER}?text=${WA_MSG}`;
const CTA_LABEL = "Falar com a equipe";

export const Route = createFileRoute("/politica2026")({
  head: () => ({
    meta: [
      // Página despublicada: mantida apenas para acesso direto por link.
      // Não deve ser indexada nem compartilhada em redes sociais.
      { title: "Página não publicada — Disparos FR" },
      { name: "robots", content: "noindex, nofollow, noarchive, nosnippet" },
      { name: "googlebot", content: "noindex, nofollow" },
      {
        name: "description",
        content: "Conteúdo interno não publicado.",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap",
      },
    ],
  }),
  component: PoliticaPage,
});

/* ---------- UI helpers ---------- */

function Tick({ read = false }: { read?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 11"
      className="inline-block h-3 w-4 align-middle"
      fill="none"
      aria-hidden
    >
      <path
        d="M11.071.653a.457.457 0 0 0-.304-.146.44.44 0 0 0-.317.146L3.325 7.618 1.485 5.795a.44.44 0 0 0-.317-.146.44.44 0 0 0-.304.146l-.706.699a.446.446 0 0 0 0 .63l2.858 2.844a.44.44 0 0 0 .317.146.457.457 0 0 0 .304-.146L11.777 1.98a.44.44 0 0 0 0-.63l-.706-.697Z"
        fill={read ? "#53bdeb" : "#8696a0"}
      />
      <path
        d="M15.415.653a.457.457 0 0 0-.304-.146.44.44 0 0 0-.317.146L7.669 7.618 6.928 6.878a.44.44 0 0 0-.63 0l-.708.699a.446.446 0 0 0 0 .63l1.717 1.71a.44.44 0 0 0 .317.146.457.457 0 0 0 .304-.146L16.121 1.98a.44.44 0 0 0 0-.63l-.706-.697Z"
        fill={read ? "#53bdeb" : "#8696a0"}
      />
    </svg>
  );
}

function CTAButton({
  children = CTA_LABEL,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={WA_LINK}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-[#00a884] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(0,168,132,0.6)] transition hover:bg-[#019874] active:scale-[0.98] sm:text-base ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
        <path d="M20.52 3.48A11.94 11.94 0 0 0 12 0C5.37 0 0 5.37 0 12a11.9 11.9 0 0 0 1.64 6L0 24l6.2-1.62A11.94 11.94 0 0 0 12 24c6.63 0 12-5.37 12-12 0-3.2-1.25-6.21-3.48-8.52ZM12 21.82a9.8 9.8 0 0 1-5-1.37l-.36-.21-3.68.96.98-3.59-.23-.37A9.82 9.82 0 1 1 21.82 12 9.83 9.83 0 0 1 12 21.82Zm5.4-7.35c-.3-.15-1.75-.87-2.02-.97-.27-.1-.47-.15-.66.15-.2.3-.76.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.76-1.64-2.06-.17-.3-.02-.47.13-.62.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.66-1.6-.9-2.19-.24-.58-.48-.5-.66-.51h-.56c-.2 0-.5.07-.77.37-.27.3-1.02 1-1.02 2.43 0 1.43 1.05 2.82 1.2 3.02.15.2 2.07 3.17 5.02 4.44.7.3 1.24.48 1.67.62.7.22 1.34.19 1.85.11.56-.08 1.75-.71 2-1.4.25-.68.25-1.27.17-1.4-.07-.13-.27-.2-.57-.35Z" />
      </svg>
      {children}
    </a>
  );
}

/* ---------- Chat bubbles ---------- */

function Sent({
  children,
  time = "09:42",
  read = true,
}: {
  children: React.ReactNode;
  time?: string;
  read?: boolean;
}) {
  return (
    <div className="flex justify-end">
      <div className="relative max-w-[85%] rounded-lg rounded-tr-sm bg-[#005c4b] px-3 py-2 text-[15px] leading-snug text-[#e9edef] shadow-sm">
        <div className="whitespace-pre-wrap">{children}</div>
        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[#8dbfb0]">
          <span>{time}</span>
          <Tick read={read} />
        </div>
      </div>
    </div>
  );
}

function Received({
  children,
  time = "09:42",
  name,
}: {
  children: React.ReactNode;
  time?: string;
  name?: string;
}) {
  return (
    <div className="flex justify-start">
      <div className="relative max-w-[85%] rounded-lg rounded-tl-sm bg-[#202c33] px-3 py-2 text-[15px] leading-snug text-[#e9edef] shadow-sm">
        {name ? (
          <div className="mb-0.5 text-[12px] font-semibold text-[#53bdeb]">
            {name}
          </div>
        ) : null}
        <div className="whitespace-pre-wrap">{children}</div>
        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[#8696a0]">
          <span>{time}</span>
        </div>
      </div>
    </div>
  );
}

function ChatFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#0b141a] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
      {/* header */}
      <div className="flex items-center gap-3 bg-[#202c33] px-3 py-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#00a884] text-sm font-bold text-white">
          {title.charAt(0)}
        </div>
        <div className="flex-1 leading-tight">
          <div className="text-sm font-semibold text-[#e9edef]">{title}</div>
          <div className="text-[11px] text-[#8696a0]">{subtitle}</div>
        </div>
        <div className="flex gap-3 text-[#aebac1]">
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
            <path d="M20 15.5a8.38 8.38 0 0 1-2.9 6.4l-1.5-1.5a6.5 6.5 0 0 0 0-9.8L17.1 9a8.38 8.38 0 0 1 2.9 6.5ZM4 8.5A8.38 8.38 0 0 1 6.9 2l1.5 1.5a6.5 6.5 0 0 0 0 9.8L6.9 15A8.38 8.38 0 0 1 4 8.5Z" />
          </svg>
        </div>
      </div>
      {/* body */}
      <div
        className="space-y-2 px-3 py-4"
        style={{
          backgroundColor: "#0b141a",
          backgroundImage:
            "radial-gradient(circle at 20% 10%, rgba(0,168,132,0.05), transparent 50%), radial-gradient(circle at 80% 90%, rgba(83,189,235,0.04), transparent 55%)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ---------- Painel mockup ---------- */

function PainelMock() {
  return (
    <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-[#111b21] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
      <div className="flex items-center justify-between border-b border-white/10 bg-[#0b141a] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#00a884]" />
          <span className="text-[13px] font-semibold text-[#e9edef]">
            Campanha "Reta final — Zona Sul"
          </span>
        </div>
        <span className="font-mono-data text-[11px] uppercase tracking-wider text-[#53bdeb]">
          AO VIVO
        </span>
      </div>

      <div className="grid grid-cols-2 gap-px bg-white/5 sm:grid-cols-4">
        {[
          { l: "Contatos", v: "18.420", c: "#e9edef" },
          { l: "Enviados", v: "12.774", c: "#00a884" },
          { l: "Entregues", v: "12.109", c: "#53bdeb" },
          { l: "Falhas", v: "312", c: "#ff9b9b" },
        ].map((k) => (
          <div key={k.l} className="bg-[#111b21] px-4 py-3">
            <div className="text-[11px] uppercase tracking-wider text-[#8696a0]">
              {k.l}
            </div>
            <div
              className="font-mono-data mt-1 text-xl font-semibold tabular-nums"
              style={{ color: k.c }}
            >
              {k.v}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3 px-4 py-4">
        <div>
          <div className="flex items-center justify-between text-[11px] text-[#8696a0]">
            <span>Progresso</span>
            <span className="font-mono-data text-[#e9edef]">69.3%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#00a884] to-[#53bdeb]"
              style={{ width: "69.3%" }}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          {[
            { l: "SP · Capital", v: "6.812" },
            { l: "SP · Interior", v: "3.204" },
            { l: "DDD 11", v: "2.758" },
          ].map((s) => (
            <div
              key={s.l}
              className="rounded-md border border-white/10 bg-[#0b141a] px-2.5 py-2"
            >
              <div className="text-[#8696a0]">{s.l}</div>
              <div className="font-mono-data mt-0.5 text-sm font-semibold text-[#e9edef] tabular-nums">
                {s.v}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Section wrapper ---------- */

function Section({
  eyebrow,
  title,
  intro,
  children,
  id,
}: {
  eyebrow?: string;
  title: string;
  intro?: React.ReactNode;
  children?: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="border-t border-white/5 px-5 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl">
        <div className="max-w-2xl">
          {eyebrow ? (
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#00a884]/30 bg-[#00a884]/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-[#00a884]">
              {eyebrow}
            </div>
          ) : null}
          <h2 className="font-display text-3xl font-bold leading-tight text-[#e9edef] sm:text-4xl">
            {title}
          </h2>
          {intro ? (
            <p className="mt-4 text-[15px] leading-relaxed text-[#aebac1] sm:text-base">
              {intro}
            </p>
          ) : null}
        </div>
        {children ? <div className="mt-10">{children}</div> : null}
      </div>
    </section>
  );
}

/* ---------- FAQ ---------- */

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "Preciso ter uma base de contatos ou apoiadores?",
    a: "Sim. Trabalhamos com a base própria da campanha — militância, apoiadores cadastrados, eleitores que autorizaram contato. Não vendemos e não usamos listas de terceiros sem consentimento.",
  },
  {
    q: "Posso segmentar por cidade, região ou DDD?",
    a: "Sim. A segmentação pode ser feita por município, região, zona eleitoral, DDD ou qualquer outro campo presente na sua base — desde que o dado esteja estruturado.",
  },
  {
    q: "A Disparos FR fornece contatos ou só executa envios da minha base?",
    a: "Para campanhas políticas, executamos envios exclusivamente a partir da base fornecida pela própria campanha. Não comercializamos listas de eleitores.",
  },
  {
    q: "Preciso usar meu número pessoal?",
    a: "Não. A operação é feita por números dedicados, oficiais, conectados à API do WhatsApp Business e associados ao seu comitê ou candidato.",
  },
  {
    q: "Isso está de acordo com as regras eleitorais de comunicação em massa?",
    a: "Operamos dentro da legislação vigente e das resoluções do TSE sobre propaganda eleitoral, incluindo consentimento do destinatário, identificação clara do responsável e mecanismos de descadastro.",
  },
  {
    q: "Como funciona o consentimento dos eleitores?",
    a: "A campanha é responsável por garantir que os contatos autorizaram receber comunicação. Orientamos sobre como coletar, registrar e comprovar consentimento antes de iniciar os envios.",
  },
  {
    q: "Posso aprovar a mensagem antes do envio?",
    a: "Sempre. Nenhuma mensagem sai sem aprovação por escrito do responsável pela campanha. Textos, imagens, links e botões passam por validação técnica e editorial.",
  },
  {
    q: "Consigo acompanhar os resultados durante a campanha?",
    a: "Sim. Você recebe acesso a um painel em tempo real com contatos processados, enviados, entregues, falhas e progresso — separados por segmento quando aplicável.",
  },
  {
    q: "Qual é o volume mínimo de contatos?",
    a: "Atendemos campanhas a partir de um volume mínimo que garante operação estruturada. Fale com a equipe para avaliar o seu caso — cada campanha tem contexto próprio.",
  },
  {
    q: "Quanto tempo leva para iniciar uma campanha?",
    a: "O prazo depende da preparação da base, aprovação das mensagens e conexão do número oficial. Em geral, uma campanha bem organizada entra em execução em poucos dias úteis.",
  },
];

function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-[#111b21]">
      {FAQ_ITEMS.map((item, i) => {
        const isOpen = open === i;
        return (
          <button
            key={i}
            type="button"
            onClick={() => setOpen(isOpen ? null : i)}
            className="block w-full px-5 py-4 text-left transition hover:bg-white/[0.02]"
          >
            <div className="flex items-start justify-between gap-4">
              <span className="text-[15px] font-medium text-[#e9edef]">
                {item.q}
              </span>
              <span
                className={`mt-1 text-[#00a884] transition-transform ${
                  isOpen ? "rotate-45" : ""
                }`}
                aria-hidden
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                  <path d="M11 5h2v14h-2z" />
                  <path d="M5 11h14v2H5z" />
                </svg>
              </span>
            </div>
            {isOpen ? (
              <p className="mt-3 text-[14px] leading-relaxed text-[#aebac1]">
                {item.a}
              </p>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Page ---------- */

function PoliticaPage() {
  // typing animation for hero chat
  const [typedIdx, setTypedIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTypedIdx((v) => (v + 1) % 4), 3000);
    return () => clearInterval(t);
  }, []);

  const heroMessages = useMemo(
    () => [
      { kind: "sent", text: "Iniciando envio da campanha 'Zona Sul — reta final'", time: "09:41" },
      { kind: "recv", text: "18.420 contatos carregados · segmentado por DDD 11", time: "09:41" },
      { kind: "sent", text: "Aprovar mensagem e criativo?", time: "09:42" },
      { kind: "recv", text: "Aprovado. Podem executar.", time: "09:42" },
    ],
    [],
  );

  return (
    <div
      className="min-h-screen bg-[#0b141a] text-[#e9edef]"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <style>{`
        .font-display { font-family: 'Sora', 'Inter', sans-serif; letter-spacing: -0.02em; }
        .font-mono-data { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        @keyframes floatUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .float-in > * { animation: floatUp .5s ease-out both; }
        .float-in > *:nth-child(2) { animation-delay: .15s; }
        .float-in > *:nth-child(3) { animation-delay: .3s; }
        .float-in > *:nth-child(4) { animation-delay: .45s; }
      `}</style>

      {/* Minimal top bar — no nav links, only brand + CTA */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#0b141a]/85 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#00a884] text-sm font-bold text-white">
              D
            </div>
            <span className="font-display text-sm font-semibold tracking-tight">
              Disparos FR
            </span>
          </div>
          <a
            href={WA_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden rounded-full bg-[#00a884] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#019874] sm:inline-flex"
          >
            {CTA_LABEL}
          </a>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden px-5 pb-24 pt-16 sm:pt-24">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(60% 40% at 80% 10%, rgba(0,168,132,0.14), transparent 60%), radial-gradient(50% 40% at 10% 30%, rgba(83,189,235,0.09), transparent 60%)",
          }}
          aria-hidden
        />
        <div className="relative mx-auto grid max-w-5xl gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] uppercase tracking-wider text-[#aebac1]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#00a884]" />
              API Oficial · WhatsApp Business Platform
            </div>
            <h1 className="font-display mt-5 text-4xl font-bold leading-[1.05] text-white sm:text-5xl lg:text-[56px]">
              Sua campanha alcança eleitores pela{" "}
              <span className="bg-gradient-to-r from-[#00a884] to-[#53bdeb] bg-clip-text text-transparent">
                API Oficial
              </span>{" "}
              do WhatsApp.
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-[#aebac1] sm:text-base">
              Atendemos candidatos, comitês e coordenações a partir de um
              volume relevante de contatos, com segmentação por cidade,
              região ou DDD. Operação estruturada, mensagens aprovadas antes
              do envio e acompanhamento em tempo real.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <CTAButton />
              <span className="text-[13px] text-[#8696a0]">
                Sem contratos padronizados — cada campanha tem uma proposta própria.
              </span>
            </div>
          </div>

          <div className="float-in">
            <ChatFrame title="Comitê — Coordenação" subtitle="online agora">
              {heroMessages.slice(0, typedIdx + 1).map((m, i) =>
                m.kind === "sent" ? (
                  <Sent key={i} time={m.time} read>
                    {m.text}
                  </Sent>
                ) : (
                  <Received key={i} time={m.time} name="Disparos FR">
                    {m.text}
                  </Received>
                ),
              )}
            </ChatFrame>
          </div>
        </div>
      </section>

      {/* 2. Por que WhatsApp */}
      <Section
        eyebrow="Por que WhatsApp"
        title="O canal mais direto e pessoal para falar com eleitores."
        intro="Diferente de e-mail, SMS ou redes sociais, a mensagem no WhatsApp chega em um ambiente que o eleitor usa todos os dias — com identidade do remetente, botões, mídia e resposta direta."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              t: "Conversa, não broadcast",
              d: "O eleitor pode responder, tirar dúvidas e se engajar diretamente com a campanha.",
            },
            {
              t: "Identidade oficial",
              d: "Envios pela API do WhatsApp Business, com número dedicado e nome verificado do comitê.",
            },
            {
              t: "Espaço para dados reais",
              d: "Sem estatísticas fabricadas: acompanhe seu próprio desempenho pelo painel.",
            },
          ].map((c) => (
            <div
              key={c.t}
              className="rounded-2xl border border-white/10 bg-[#111b21] p-5"
            >
              <div className="font-display text-lg font-semibold text-white">
                {c.t}
              </div>
              <div className="mt-1.5 text-[14px] leading-relaxed text-[#aebac1]">
                {c.d}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* 3. Como funciona */}
      <Section
        eyebrow="Como funciona"
        title="5 passos, no ritmo de uma conversa."
        intro="Cada etapa é validada com a coordenação da campanha antes de avançar."
      >
        <div className="mx-auto max-w-md">
          <ChatFrame title="Operação Disparos FR" subtitle="thread da campanha">
            <Received name="Coordenação" time="08:00">
              1. Você define objetivo, público e volume da campanha.
            </Received>
            <Received name="Coordenação" time="08:02">
              2. Envia sua base de apoiadores ou define a segmentação desejada.
            </Received>
            <Sent time="08:05">
              3. Você aprova a mensagem e o criativo antes do envio.
            </Sent>
            <Received name="Disparos FR" time="08:07">
              4. Executamos os envios pela nossa estrutura oficial.
            </Received>
            <Sent time="08:08">
              5. Você acompanha resultados em tempo real pelo painel.
            </Sent>
          </ChatFrame>
        </div>
      </Section>

      {/* 4. Segmentação */}
      <Section
        eyebrow="Segmentação"
        title="Fale com quem interessa — na cidade, região ou DDD certos."
        intro="A base é sempre da campanha. Nós ajudamos a organizar, higienizar e segmentar para que cada mensagem chegue ao público correto."
      >
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-[#111b21] p-6">
            <div className="font-display text-lg font-semibold text-white">
              Filtros disponíveis
            </div>
            <ul className="mt-4 space-y-2.5 text-[14px] text-[#aebac1]">
              {[
                "Cidade e região",
                "DDD e faixa de números",
                "Zona / seção eleitoral (quando disponível na base)",
                "Tags de apoio, voluntariado ou doação",
                "Histórico de resposta em campanhas anteriores",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-[#00a884]" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-[#00a884]/20 bg-gradient-to-b from-[#00a884]/[0.08] to-transparent p-6">
            <div className="font-display text-lg font-semibold text-white">
              Regra de origem da base
            </div>
            <p className="mt-4 text-[14px] leading-relaxed text-[#aebac1]">
              Trabalhamos apenas com bases próprias da campanha ou de
              apoiadores que deram consentimento explícito para receber
              comunicação.{" "}
              <span className="text-white">
                Não usamos listas compradas de terceiros sem consentimento.
              </span>{" "}
              Essa regra protege a campanha, o número oficial e o eleitor.
            </p>
          </div>
        </div>
      </Section>

      {/* 5. Personalização */}
      <Section
        eyebrow="Personalização"
        title="Cada mensagem carrega a identidade do seu candidato."
        intro="Nome, foto, propostas, agenda e links — tudo é revisado e aprovado antes de sair para a base."
      >
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <div>
            <ul className="space-y-3 text-[15px] text-[#aebac1]">
              {[
                ["Nome e foto do candidato", "Presença clara no cabeçalho da mensagem."],
                ["Propostas e agenda", "Ligações diretas para o programa de governo e eventos."],
                ["Formulário de voluntariado", "Recrutamento contínuo direto pelo WhatsApp."],
                ["Doação e apoio financeiro", "Link para plataforma oficial de arrecadação."],
                ["Site oficial da campanha", "Direcionamento para conteúdo aprofundado."],
              ].map(([t, d]) => (
                <li
                  key={t}
                  className="rounded-xl border border-white/10 bg-[#111b21] p-4"
                >
                  <div className="text-[14px] font-semibold text-white">{t}</div>
                  <div className="mt-0.5 text-[13px] text-[#aebac1]">{d}</div>
                </li>
              ))}
            </ul>
          </div>
          <ChatFrame title="[Nome do Candidato]" subtitle="Comitê Oficial">
            <Received time="10:12" name="[Nome do Candidato]">
              {`Olá, [primeiro nome]! Sou o [Candidato].
Preparei um resumo das propostas para [sua cidade].`}
            </Received>
            <Received time="10:12" name="[Nome do Candidato]">
              📎 Programa de governo — resumo em 1 minuto
            </Received>
            <Received time="10:13" name="[Nome do Candidato]">
              Se quiser se voluntariar ou apoiar, é por aqui 👇
            </Received>
            <Sent time="10:14">Quero ajudar!</Sent>
          </ChatFrame>
        </div>
      </Section>

      {/* 6. Painel */}
      <Section
        eyebrow="Painel em tempo real"
        title="Operação transparente, número por número."
        intro="Acompanhe contatos processados, enviados, entregues e falhas conforme acontecem. Sem promessas vagas — dados reais da sua campanha."
      >
        <PainelMock />
      </Section>

      {/* 7. Transparência */}
      <Section
        eyebrow="Transparência e conformidade"
        title="Consentimento, LGPD e normas do TSE."
        intro="Comunicação política em escala só faz sentido se for feita com respeito ao eleitor e às regras. Esse é um pilar da nossa operação, não uma nota de rodapé."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              t: "LGPD",
              d: "Tratamento de dados dentro da Lei Geral de Proteção de Dados: finalidade clara, base legal adequada e mecanismo de descadastro em toda comunicação.",
            },
            {
              t: "Normas do TSE",
              d: "Atenção às resoluções do Tribunal Superior Eleitoral sobre propaganda eleitoral e comunicação em massa via aplicativos de mensagens.",
            },
            {
              t: "Consentimento",
              d: "Cada envio é baseado em contatos que autorizaram receber comunicação da campanha. Sem listas compradas, sem contatos aleatórios.",
            },
          ].map((c) => (
            <div
              key={c.t}
              className="rounded-2xl border border-white/10 bg-[#111b21] p-5"
            >
              <div className="font-display text-base font-semibold text-white">
                {c.t}
              </div>
              <div className="mt-2 text-[13.5px] leading-relaxed text-[#aebac1]">
                {c.d}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* 8. FAQ */}
      <Section
        eyebrow="Perguntas frequentes"
        title="Dúvidas comuns de quem está estruturando uma campanha."
      >
        <FAQ />
      </Section>

      {/* 9. CTA final */}
      <section className="border-t border-white/5 px-5 py-24 sm:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#00a884]/30 bg-[#00a884]/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-[#00a884]">
            Pronto para começar
          </div>
          <h2 className="font-display mt-4 text-3xl font-bold leading-tight text-white sm:text-5xl">
            Vamos estruturar sua próxima campanha.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-[#aebac1] sm:text-base">
            Conte para nossa equipe o objetivo, o volume da base e o prazo.
            Retornamos com uma proposta específica para o seu contexto — sem
            planos padronizados.
          </p>
          <div className="mt-8 flex justify-center">
            <CTAButton>{CTA_LABEL}</CTAButton>
          </div>
          <p className="mt-4 text-[12px] text-[#8696a0]">
            Ao clicar, você é direcionado para uma conversa no WhatsApp com a
            equipe da Disparos FR.
          </p>
        </div>
      </section>

      <footer className="border-t border-white/5 px-5 py-8 pb-28 sm:pb-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 text-[12px] text-[#8696a0] sm:flex-row">
          <div>© {new Date().getFullYear()} Disparos FR · WhatsApp Business Solution Provider</div>
          <div>Comunicação com respeito à LGPD e às normas do TSE.</div>
        </div>
      </footer>

      {/* Mobile sticky CTA */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#0b141a]/95 px-4 py-3 backdrop-blur sm:hidden">
        <a
          href={WA_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-full bg-[#00a884] px-6 py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_30px_-10px_rgba(0,168,132,0.7)] active:scale-[0.98]"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
            <path d="M20.52 3.48A11.94 11.94 0 0 0 12 0C5.37 0 0 5.37 0 12a11.9 11.9 0 0 0 1.64 6L0 24l6.2-1.62A11.94 11.94 0 0 0 12 24c6.63 0 12-5.37 12-12 0-3.2-1.25-6.21-3.48-8.52Z" />
          </svg>
          {CTA_LABEL}
        </a>
      </div>
    </div>
  );
}
