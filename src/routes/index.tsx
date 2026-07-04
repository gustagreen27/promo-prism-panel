import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ShieldCheck,
  BarChart3,
  FileCheck2,
  Zap,
  MessageSquare,
  Users,
  Database,
  CheckCircle2,
  Plus,
} from "lucide-react";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Disparos FR — Campanhas oficiais no WhatsApp Business" },
      {
        name: "description",
        content:
          "Plataforma B2B para campanhas oficiais no WhatsApp Business Platform: templates aprovados, filas inteligentes, relatórios em tempo real e conformidade total com a Meta.",
      },
      { property: "og:title", content: "Disparos FR — WhatsApp Business Platform" },
      {
        property: "og:description",
        content:
          "Comunicação oficial. Escala sem limites. A plataforma definitiva para disparos no WhatsApp Business.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="w-full bg-white text-[#1d1d1f] selection:bg-emerald-100 font-sans antialiased overflow-x-hidden">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold tracking-tight">
            Disparos <span className="text-emerald-600">FR</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
            <a href="#recursos" className="hover:text-[#1d1d1f] transition-colors">Recursos</a>
            <a href="#como-funciona" className="hover:text-[#1d1d1f] transition-colors">Como funciona</a>
            <a href="#planos" className="hover:text-[#1d1d1f] transition-colors">Planos</a>
            <a href="#faq" className="hover:text-[#1d1d1f] transition-colors">FAQ</a>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/login" className="text-sm font-medium hover:text-emerald-600 transition-colors">
              Entrar
            </Link>
            <Link
              to="/cadastro"
              className="bg-[#1d1d1f] text-white px-5 py-2 rounded-full text-sm font-medium hover:bg-black transition-all hover:scale-105 active:scale-95 shadow-lg"
            >
              Começar agora
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="min-h-screen flex flex-col items-center justify-center text-center px-6 pt-32 pb-20">
        <div className="inline-flex items-center gap-2 bg-gray-100 px-4 py-2 rounded-full mb-8">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-xs font-semibold tracking-wide uppercase">API Oficial da Meta</span>
        </div>
        <h1 className="text-5xl sm:text-6xl md:text-8xl font-bold tracking-tighter leading-[1.05] mb-8 max-w-4xl">
          Comunicação oficial.<br />Escala sem limites.
        </h1>
        <p className="text-lg md:text-2xl text-[#86868b] max-w-2xl mb-12 font-medium leading-relaxed">
          A plataforma B2B definitiva para campanhas no WhatsApp Business Platform. Segurança,
          conformidade e performance em um só lugar.
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <Link
            to="/cadastro"
            className="px-8 py-4 bg-[#1d1d1f] text-white rounded-2xl text-lg font-semibold hover:bg-black transition-all shadow-xl hover:-translate-y-1 active:translate-y-0"
          >
            Criar conta gratuita
          </Link>
          <a
            href="#como-funciona"
            className="px-8 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-lg font-semibold hover:bg-gray-100 transition-all"
          >
            Ver demonstração
          </a>
        </div>

        {/* Product Mockup */}
        <div className="mt-20 w-full max-w-5xl aspect-video bg-gradient-to-br from-gray-50 to-gray-200 rounded-3xl border border-gray-200 shadow-2xl relative overflow-hidden group">
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="w-full h-full bg-white rounded-xl shadow-lg transform group-hover:scale-[1.02] transition-transform duration-700 p-6 md:p-8 text-left">
              <div className="flex gap-2 mb-6">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-emerald-400" />
              </div>
              <div className="space-y-4">
                <div className="h-3 w-1/3 bg-gray-100 rounded" />
                <div className="h-6 w-2/3 bg-gray-100 rounded" />
                <div className="grid grid-cols-3 gap-4 mt-8">
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                    <div className="text-2xl font-bold">98%</div>
                    <div className="text-[10px] uppercase tracking-widest text-[#86868b] mt-1">Entrega</div>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                    <div className="text-2xl font-bold">2.4k</div>
                    <div className="text-[10px] uppercase tracking-widest text-[#86868b] mt-1">Msg/min</div>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-[#1d1d1f] text-white p-4">
                    <div className="text-2xl font-bold">0</div>
                    <div className="text-[10px] uppercase tracking-widest text-white/60 mt-1">Bloqueios</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Value Proof */}
      <section className="py-32 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-16 md:gap-24 items-center">
            <div>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
                Certificação Meta API
              </h2>
              <p className="text-lg text-[#86868b] mb-8 leading-relaxed">
                Diga adeus aos bloqueios. Trabalhamos exclusivamente com a API oficial do WhatsApp
                Business Platform, garantindo que suas mensagens cheguem com segurança e autoridade.
              </p>
              <ul className="space-y-4">
                {[
                  "Templates aprovados pela Meta",
                  "Mensagens em massa sem risco de banimento",
                  "Opt-in e opt-out obrigatórios",
                  "Tokens protegidos no servidor",
                ].map((t) => (
                  <li key={t} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    </div>
                    <span className="font-medium">{t}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-8 bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col justify-center items-center text-center">
                <div className="text-4xl font-bold mb-2">99.9%</div>
                <div className="text-xs uppercase tracking-widest text-[#86868b] font-bold">Taxa de Entrega</div>
              </div>
              <div className="p-8 bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col justify-center items-center text-center mt-8">
                <div className="text-4xl font-bold mb-2">&lt; 2s</div>
                <div className="text-xs uppercase tracking-widest text-[#86868b] font-bold">Latência Média</div>
              </div>
              <div className="p-8 bg-[#1d1d1f] text-white rounded-3xl shadow-sm border border-gray-100 flex flex-col justify-center items-center text-center">
                <div className="text-4xl font-bold mb-2">10M+</div>
                <div className="text-xs uppercase tracking-widest text-white/60 font-bold">Disparos / mês</div>
              </div>
              <div className="p-8 bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col justify-center items-center text-center mt-8">
                <div className="text-4xl font-bold mb-2">24/7</div>
                <div className="text-xs uppercase tracking-widest text-[#86868b] font-bold">Suporte</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="py-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">Comece em minutos</h2>
            <p className="text-lg text-[#86868b] font-medium">Do cadastro ao primeiro disparo, um caminho simples.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { n: "01", t: "Crie sua conta", d: "Cadastro em menos de 60 segundos, sem cartão." },
              { n: "02", t: "Conecte seu WhatsApp", d: "Embedded Signup ou configuração assistida pela nossa equipe." },
              { n: "03", t: "Dispare com confiança", d: "Templates aprovados, contatos importados e relatórios em tempo real." },
            ].map((s) => (
              <div key={s.n} className="p-8 rounded-3xl bg-gray-50 border border-gray-100">
                <div className="text-sm font-bold text-emerald-600 mb-4 tracking-widest">{s.n}</div>
                <div className="text-2xl font-bold mb-3">{s.t}</div>
                <p className="text-[#86868b] font-medium leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Bento */}
      <section id="recursos" className="py-32 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 text-center mb-20">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">Recursos feitos para escalar</h2>
          <p className="text-lg text-[#86868b] font-medium">Tudo o que sua operação de WhatsApp precisa em um só lugar.</p>
        </div>
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-white rounded-3xl p-12 overflow-hidden relative border border-gray-100">
            <Zap className="w-8 h-8 text-emerald-600 mb-6" />
            <h3 className="text-3xl font-bold mb-4">Automação inteligente</h3>
            <p className="text-[#86868b] max-w-sm font-medium">
              Fluxos de disparos agendados, filas inteligentes e respostas automáticas conectadas ao seu CRM.
            </p>
            <div className="absolute -bottom-20 -right-10 w-72 h-72 bg-emerald-200/40 blur-3xl rounded-full" />
          </div>
          <div className="bg-[#1d1d1f] text-white rounded-3xl p-12 relative overflow-hidden">
            <ShieldCheck className="w-8 h-8 text-emerald-400 mb-6" />
            <h3 className="text-3xl font-bold mb-4">Segurança</h3>
            <p className="text-gray-400 font-medium">Isolamento por workspace (RLS), tokens no backend e conformidade com LGPD.</p>
          </div>
          <div className="bg-white rounded-3xl p-12 border border-gray-100">
            <BarChart3 className="w-8 h-8 text-[#1d1d1f] mb-4" />
            <h3 className="text-2xl font-bold mb-2">Dashboard</h3>
            <p className="text-[#86868b] font-medium">Métricas de entrega, leitura e conversão em tempo real.</p>
          </div>
          <div className="bg-white rounded-3xl p-12 border border-gray-100">
            <MessageSquare className="w-8 h-8 text-[#1d1d1f] mb-4" />
            <h3 className="text-2xl font-bold mb-2">Inbox</h3>
            <p className="text-[#86868b] font-medium">Responda conversas direto do painel com atribuição por operador.</p>
          </div>
          <div className="bg-white rounded-3xl p-12 border border-gray-100">
            <Users className="w-8 h-8 text-[#1d1d1f] mb-4" />
            <h3 className="text-2xl font-bold mb-2">Contatos & Listas</h3>
            <p className="text-[#86868b] font-medium">Importe CSV, aplique tags, controle opt-in e evite duplicidades.</p>
          </div>
          <div className="md:col-span-2 bg-white rounded-3xl p-12 border border-gray-100 relative overflow-hidden">
            <FileCheck2 className="w-8 h-8 text-emerald-600 mb-6" />
            <h3 className="text-3xl font-bold mb-4">Templates aprovados pela Meta</h3>
            <p className="text-[#86868b] max-w-md font-medium">
              Crie, envie para aprovação e reutilize templates HSM com variáveis dinâmicas — tudo direto do painel.
            </p>
          </div>
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="py-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">Planos que crescem com você</h2>
            <p className="text-lg text-[#86868b] font-medium">Estrutura pronta para escalar. Valores anunciados em breve.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              { name: "Starter", desc: "Para começar operações oficiais.", feats: ["1 número", "5k mensagens/mês", "1 usuário"] },
              { name: "Growth", desc: "Para times em crescimento.", feats: ["2 números", "25k mensagens/mês", "5 usuários"], featured: true },
              { name: "Scale", desc: "Para operações em escala.", feats: ["5 números", "100k mensagens/mês", "20 usuários"] },
              { name: "Enterprise", desc: "Sob medida.", feats: ["Números ilimitados", "Volume sob consulta", "SLA dedicado"] },
            ].map((p) => (
              <div
                key={p.name}
                className={
                  p.featured
                    ? "rounded-3xl p-8 bg-[#1d1d1f] text-white shadow-xl"
                    : "rounded-3xl p-8 bg-gray-50 border border-gray-100"
                }
              >
                <h3 className="text-xl font-bold mb-2">{p.name}</h3>
                <p className={p.featured ? "text-gray-400 text-sm mb-6" : "text-[#86868b] text-sm mb-6"}>
                  {p.desc}
                </p>
                <div className={p.featured ? "text-2xl font-bold mb-6 text-white/80" : "text-2xl font-bold mb-6 text-[#86868b]"}>
                  Em breve
                </div>
                <ul className="space-y-3 mb-8">
                  {p.feats.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm font-medium">
                      <CheckCircle2 className={p.featured ? "w-4 h-4 text-emerald-400" : "w-4 h-4 text-emerald-600"} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/cadastro"
                  className={
                    p.featured
                      ? "block text-center w-full py-3 rounded-2xl bg-white text-[#1d1d1f] font-semibold hover:bg-gray-100 transition-colors"
                      : "block text-center w-full py-3 rounded-2xl bg-[#1d1d1f] text-white font-semibold hover:bg-black transition-colors"
                  }
                >
                  Começar
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Segurança */}
      <section className="py-32 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">Segurança sem atalhos</h2>
            <p className="text-lg text-[#86868b] leading-relaxed">
              Operação 100% dentro das regras da Meta. Nunca burlamos limites, respeitamos opt-in,
              oferecemos opt-out obrigatório e mantemos logs completos de auditoria.
            </p>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { i: ShieldCheck, t: "API oficial da Meta" },
              { i: FileCheck2, t: "Templates HSM" },
              { i: Database, t: "Isolamento por workspace" },
              { i: CheckCircle2, t: "Opt-in / opt-out" },
              { i: Users, t: "Permissões granulares" },
              { i: BarChart3, t: "Logs de auditoria" },
            ].map((f) => (
              <li key={f.t} className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-gray-100">
                <f.i className="w-5 h-5 text-emerald-600" />
                <span className="font-medium text-sm">{f.t}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-32 border-t border-gray-100">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-16 text-center">Perguntas frequentes</h2>
          <div className="space-y-2">
            {[
              ["Preciso ter WhatsApp Business?", "Sim, sua empresa precisa de uma conta WhatsApp Business Account (WABA) na Meta. Ajudamos você a configurar."],
              ["Posso usar meu próprio número?", "Sim. Você pode conectar um número existente via Embedded Signup ou solicitar configuração assistida."],
              ["O sistema usa API oficial?", "100%. Usamos exclusivamente a WhatsApp Business Platform (Cloud API) da Meta."],
              ["Como funciona a aprovação de templates?", "Você cria o template no painel, envia para aprovação da Meta e recebe o status em tempo real."],
              ["Há limites de disparos diários?", "Os limites seguem a política oficial da Meta baseada na qualidade do seu número."],
              ["Existe opt-out?", "Sim, opt-out é obrigatório e respeitado automaticamente pelo sistema."],
            ].map(([q, a]) => (
              <details key={q} className="group border-b border-gray-100 py-2">
                <summary className="flex items-center justify-between w-full text-left py-6 cursor-pointer list-none">
                  <span className="text-lg font-semibold pr-4">{q}</span>
                  <Plus className="w-5 h-5 shrink-0 transition-transform group-open:rotate-45" />
                </summary>
                <p className="pb-6 text-[#86868b] leading-relaxed">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="bg-[#1d1d1f] rounded-[3rem] md:rounded-[4rem] py-20 md:py-24 px-8 md:px-12 text-center text-white relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none" />
            <div className="relative z-10">
              <h2 className="text-4xl md:text-6xl font-bold tracking-tighter mb-8">
                Pronto para escalar?
              </h2>
              <p className="text-lg md:text-xl text-gray-400 mb-12 max-w-xl mx-auto">
                Junte-se às empresas que já usam a Disparos FR para transformar sua comunicação no WhatsApp.
              </p>
              <div className="flex flex-col md:flex-row items-center justify-center gap-6">
                <Link
                  to="/cadastro"
                  className="px-10 py-5 bg-white text-black rounded-2xl text-lg font-bold hover:bg-gray-100 transition-all hover:scale-105 active:scale-95"
                >
                  Criar minha conta
                </Link>
                <span className="text-gray-500 font-medium">Planos e valores em breve</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-10 text-center text-sm text-[#86868b]">
        <div className="max-w-7xl mx-auto px-6">
          <p>© {new Date().getFullYear()} Disparos FR. Todos os direitos reservados.</p>
          <div className="mt-2 flex justify-center gap-6">
            <Link to="/politica-de-privacidade" className="hover:text-[#1d1d1f]">Política de privacidade</Link>
            <Link to="/login" className="hover:text-[#1d1d1f]">Entrar</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
