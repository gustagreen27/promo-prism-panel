import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, Check, X, MessageCircle } from "lucide-react";
import logoAsset from "@/assets/disparos-fr-logo-new.png.asset.json";

const TITLE = "Conformidade e Uso Responsável — Disparos FR";
const DESC =
  "Como a Disparos FR opera dentro da Política de Mensagens do WhatsApp Business: consentimento, descadastro, modelos aprovados, janela de 24 horas e setores não atendidos.";

export const Route = createFileRoute("/conformidade")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ConformidadePage,
});

const container = "mx-auto w-full max-w-5xl px-5 sm:px-6";

const PRINCIPIOS: { t: string; d: string }[] = [
  {
    t: "Contato apenas com consentimento",
    d: "Só enviamos mensagens para pessoas que forneceram o próprio número e autorizaram receber comunicações da empresa contratante. O cliente é responsável por declarar e comprovar a origem e o método de coleta da base.",
  },
  {
    t: "Descadastro respeitado em qualquer canal",
    d: "Pedidos de bloqueio ou descadastro — dentro ou fora do WhatsApp — são registrados na lista de exclusão e aplicados automaticamente nos envios seguintes, inclusive em campanhas já agendadas.",
  },
  {
    t: "Somente modelos aprovados pela Meta",
    d: "Conversas iniciadas pela empresa usam exclusivamente modelos de mensagem submetidos e aprovados pela Meta, dentro da categoria para a qual foram criados.",
  },
  {
    t: "Janela de atendimento de 24 horas",
    d: "Respostas livres, sem modelo, só ocorrem dentro das 24 horas após a última mensagem do usuário. Fora dessa janela, o sistema volta a exigir modelo aprovado.",
  },
  {
    t: "Automação com saída para atendimento humano",
    d: "Quando há automação na janela de 24 horas, oferecemos caminho claro e direto de escalonamento: transferência para atendente humano na própria conversa, além de telefone e e-mail de suporte.",
  },
  {
    t: "Identificação clara do remetente",
    d: "Cada número opera com perfil comercial preenchido, nome de exibição verificado e dados de contato do responsável. Não permitimos operar em nome de terceiros sem autorização.",
  },
  {
    t: "Dados usados apenas para a conversa",
    d: "Os dados obtidos pela plataforma sobre uma pessoa contatada são usados apenas para viabilizar a troca de mensagens com ela. Não solicitamos número de cartão, conta bancária, documento ou outro dado sensível pelo WhatsApp.",
  },
  {
    t: "Sem compartilhamento entre clientes",
    d: "Conteúdo de conversas e listas de contato ficam isolados por workspace. Nada é repassado entre clientes nem revendido.",
  },
];

const NAO_ATENDEMOS: string[] = [
  "Políticos, partidos, candidatos e campanhas eleitorais",
  "Serviços de estratégia ou campanha política e fornecedores exclusivos de governo",
  "Polícia, forças armadas, agências de segurança nacional e inteligência",
  "Jogos de azar e apostas online sem autorização prévia específica da Meta",
  "Armas de fogo, munições e materiais perigosos",
  "Bebidas alcoólicas, tabaco e medicamentos (venda livre ou controlados)",
  "Produtos médicos, de saúde e telemedicina",
  "Moedas reais, virtuais ou falsificadas, incluindo cripto, ICOs e opções binárias",
  "Produtos e serviços adultos, serviços de encontros",
  "Marketing multinível, empréstimos entre pessoas, adiantamento salarial, cobrança de dívidas e fianças",
  "Espécies ameaçadas, animais vivos e partes ou fluidos corporais",
  "Qualquer modelo enganoso, fraudulento ou explorador",
];

const RESPONSABILIDADES: { quem: string; itens: string[] }[] = [
  {
    quem: "Responsabilidade da Meta / WhatsApp",
    itens: [
      "Infraestrutura da Plataforma do WhatsApp Business e entrega das mensagens",
      "Análise, aprovação, pausa ou recusa de modelos de mensagem",
      "Definição de limites de envio, nota de qualidade e medidas sobre a conta",
    ],
  },
  {
    quem: "Responsabilidade da Disparos FR",
    itens: [
      "Operar apenas pela API Oficial, com números e contas devidamente cadastradas",
      "Aplicar lista de descadastro, controle de ritmo de envio e monitoramento de qualidade",
      "Bloquear campanhas em setores proibidos e conteúdo fora das políticas",
      "Disponibilizar painel, registros de envio e suporte para o cliente",
    ],
  },
  {
    quem: "Responsabilidade do cliente contratante",
    itens: [
      "Ter base própria com consentimento válido e comprovável dos destinatários",
      "Manter política de privacidade publicada e cumprir a LGPD e demais leis aplicáveis",
      "Responder aos contatos recebidos e honrar pedidos de descadastro",
      "Garantir que o conteúdo enviado corresponda à finalidade autorizada",
    ],
  },
];

function ConformidadePage() {
  return (
    <div className="min-h-screen bg-[#0a0b0d] text-neutral-200 antialiased">
      <header className="border-b border-white/5">
        <div className={`${container} flex items-center justify-between py-5`}>
          <Link to="/">
            <img src={logoAsset.url} alt="Disparos FR" className="h-8 w-auto" />
          </Link>
          <Link
            to="/"
            className="text-[13px] text-neutral-400 hover:text-white transition-colors"
          >
            Voltar ao site
          </Link>
        </div>
      </header>

      <main>
        <section className="border-b border-white/5 py-14 sm:py-20">
          <div className={container}>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              Uso responsável
            </div>
            <h1 className="mt-5 text-3xl sm:text-4xl font-semibold tracking-tight text-white">
              Conformidade com a Política de Mensagens do WhatsApp Business
            </h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-neutral-400">
              Esta página é mantida pela Disparos FR para responder às dúvidas
              mais comuns sobre como operamos campanhas na API Oficial do
              WhatsApp. Ela descreve nossas práticas atuais e as regras que
              aplicamos aos clientes — não é uma certificação, auditoria
              independente ou declaração emitida pela Meta.
            </p>
          </div>
        </section>

        <Section
          title="Princípios que aplicamos em toda campanha"
          intro="Regras operacionais válidas para qualquer cliente da plataforma, sem exceção."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {PRINCIPIOS.map((p) => (
              <div
                key={p.t}
                className="rounded-2xl border border-white/5 bg-white/[0.02] p-5"
              >
                <div className="flex items-start gap-3">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <div>
                    <div className="text-[14px] font-medium text-white">
                      {p.t}
                    </div>
                    <p className="mt-2 text-[13px] leading-relaxed text-neutral-400">
                      {p.d}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Setores que não atendemos"
          intro="Recusamos cadastro e interrompemos campanhas nestes segmentos, independentemente de licença, registro ou autorização local que a empresa possua."
        >
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {NAO_ATENDEMOS.map((n) => (
              <li
                key={n}
                className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-[13px] leading-relaxed text-neutral-300"
              >
                <X className="mt-0.5 h-4 w-4 shrink-0 text-red-500/80" />
                {n}
              </li>
            ))}
          </ul>
          <p className="mt-5 text-[13px] leading-relaxed text-neutral-500">
            Setores regulamentados que a Meta permite em países específicos
            (como apostas online, álcool e medicamentos de venda livre) só
            seriam considerados mediante autorização prévia e formal da Meta
            para a empresa contratante. Sem essa autorização em mãos, não
            operamos esses envios.
          </p>
        </Section>

        <Section
          title="Como funciona o consentimento e o descadastro"
          intro="O consentimento é obtido pelo cliente, na origem do contato, e mantido comprovável."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                n: "01",
                t: "Coleta com autorização",
                d: "O destinatário informa o próprio número e autoriza receber mensagens da empresa, com clareza sobre o tipo de conteúdo que vai receber.",
              },
              {
                n: "02",
                t: "Envio identificado",
                d: "A mensagem chega com nome e perfil comercial da empresa, por modelo aprovado, sem esconder quem está falando.",
              },
              {
                n: "03",
                t: "Saída simples",
                d: "Qualquer pedido de saída — botão, resposta, bloqueio ou contato direto — entra na lista de exclusão e interrompe novos envios.",
              },
            ].map((s) => (
              <div
                key={s.n}
                className="rounded-2xl border border-white/5 bg-white/[0.02] p-5"
              >
                <div className="text-[11px] font-medium tracking-widest text-emerald-500">
                  {s.n}
                </div>
                <div className="mt-3 text-[14px] font-medium text-white">
                  {s.t}
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-neutral-400">
                  {s.d}
                </p>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Divisão de responsabilidades"
          intro="Operar dentro das políticas depende de três partes. Cada uma responde pelo seu lado."
        >
          <div className="grid gap-4 md:grid-cols-3">
            {RESPONSABILIDADES.map((r) => (
              <div
                key={r.quem}
                className="rounded-2xl border border-white/5 bg-white/[0.02] p-5"
              >
                <div className="text-[14px] font-medium text-white">
                  {r.quem}
                </div>
                <ul className="mt-4 space-y-2.5">
                  {r.itens.map((i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2.5 text-[13px] leading-relaxed text-neutral-400"
                    >
                      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-emerald-500" />
                      {i}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Denúncias, dúvidas e pedidos de descadastro"
          intro="Se você recebeu uma mensagem enviada pela nossa plataforma e quer parar de recebê-la, ou quer relatar um uso indevido, fale com a gente."
        >
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
            <ul className="space-y-3 text-[14px] text-neutral-300">
              <li>
                E-mail:{" "}
                <a
                  href="mailto:contato@disparosfr.com"
                  className="text-emerald-400 hover:text-emerald-300"
                >
                  contato@disparosfr.com
                </a>
              </li>
              <li className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-emerald-500" />
                WhatsApp comercial informado no rodapé do site
              </li>
              <li>
                Privacidade e tratamento de dados:{" "}
                <Link
                  to="/politica-de-privacidade"
                  className="text-emerald-400 hover:text-emerald-300"
                >
                  Política de Privacidade
                </Link>
              </li>
            </ul>
            <p className="mt-5 text-[12px] leading-relaxed text-neutral-500">
              Pedidos de descadastro são aplicados na base do cliente
              responsável pelo envio e passam a valer para as campanhas
              seguintes. Denúncias de uso indevido podem resultar em suspensão
              imediata da conta do cliente na plataforma.
            </p>
          </div>
        </Section>
      </main>

      <footer className="border-t border-white/5 py-8">
        <div
          className={`${container} flex flex-col gap-2 text-[12px] text-neutral-500 sm:flex-row sm:items-center sm:justify-between`}
        >
          <span>
            © {new Date().getFullYear()} Disparos FR. Conteúdo mantido pela
            Disparos FR e sujeito a atualização.
          </span>
          <Link to="/" className="hover:text-neutral-300">
            disparosfr.com
          </Link>
        </div>
      </footer>
    </div>
  );
}

function Section({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-white/5 py-12 sm:py-16">
      <div className={container}>
        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-white">
          {title}
        </h2>
        {intro ? (
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-neutral-400">
            {intro}
          </p>
        ) : null}
        <div className="mt-7">{children}</div>
      </div>
    </section>
  );
}
