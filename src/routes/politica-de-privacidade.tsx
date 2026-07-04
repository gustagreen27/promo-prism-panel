import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/politica-de-privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — Método Vida Cursos" },
      { name: "description", content: "Política de privacidade do Método Vida Cursos. Saiba quais dados coletamos, como os usamos e como solicitar a exclusão dos seus dados." },
      { property: "og:title", content: "Política de Privacidade — Método Vida Cursos" },
      { property: "og:description", content: "Política de privacidade do Método Vida Cursos." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://metodovidacursos.com.br/politica-de-privacidade" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "canonical", href: "https://metodovidacursos.com.br/politica-de-privacidade" },
    ],
  }),
  component: PrivacyPolicyPage,
});

function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Política de Privacidade
          </h1>
          <p className="text-sm text-muted-foreground">
            Última atualização: {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
          </p>
        </div>

        <p className="text-sm text-muted-foreground">
          Esta página é mantida por <strong>Método Vida Cursos</strong> para explicar de forma clara como tratamos os dados de quem usa nossos serviços, incluindo visitantes de campanhas, alunos e usuários do painel administrativo.
        </p>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">1. Quem somos</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Método Vida Cursos é uma plataforma de gestão de campanhas de marketing, formulários, acompanhamento de leads e comunicação via WhatsApp. Esta política se aplica a todos os sites, landing pages e serviços relacionados ao domínio <strong>metodovidacursos.com.br</strong>.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">2. Que dados coletamos</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Coletamos apenas as informações necessárias para operar e melhorar nossos serviços:
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li><strong>Dados de contato:</strong> nome, e-mail, telefone e informações que você insere voluntariamente em formulários.</li>
            <li><strong>Dados de campanhas:</strong> cliques, visualizações, IP aproximado, dispositivo e origem do tráfego, usados para relatórios de desempenho.</li>
            <li><strong>Dados de uso do painel:</strong> informações da conta, permissões de acesso e logs de atividade para segurança.</li>
            <li><strong>Dados de WhatsApp:</strong> número de telefone, mensagens trocadas e status de entrega, quando você ou seus leads interagem via nossa integração oficial com a Meta.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">3. Como usamos as informações</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Usamos os dados para:
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Entregar e operar campanhas, formulários e páginas de captura;</li>
            <li>Enviar comunicações sobre produtos, cursos e eventos solicitados;</li>
            <li>Processar mensagens via WhatsApp e manter o histórico de atendimento;</li>
            <li>Gerar relatórios de desempenho e otimizar nossos anúncios;</li>
            <li>Garantir a segurança, prevenir fraudes e cumprir obrigações legais.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">4. Compartilhamento de dados</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Não vendemos seus dados. Podemos compartilhar informações apenas com:
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li><strong>Provedores de serviço:</strong> hospedagem, infraestrutura, envio de e-mail e processamento de pagamentos.</li>
            <li><strong>Integrações oficiais:</strong> Meta (WhatsApp Cloud API), Google (se você fizer login com Google) e outros conectores escolhidos explicitamente.</li>
            <li><strong>Autoridades:</strong> quando exigido por lei ou ordem judicial.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">5. Cookies e tecnologias similares</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Utilizamos cookies e identificadores técnicos para manter sua sessão, medir o desempenho de campanhas e oferecer uma experiência segura. Você pode desativar cookies nas configurações do navegador, mas algumas funcionalidades podem deixar de funcionar corretamente.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">6. Como solicitar a exclusão dos seus dados</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Você pode solicitar acesso, correção ou exclusão dos seus dados a qualquer tempo. Envie um e-mail para{" "}
            <a href="mailto:administracao@digitalfr.com.br" className="text-primary underline underline-offset-2">
              administracao@digitalfr.com.br
            </a>{" "}
            com o assunto "Solicitação de dados". Responderemos dentro do prazo legal aplicável.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">7. Segurança</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Adotamos medidas técnicas e organizacionais para proteger os dados contra acesso não autorizado, perda ou vazamento. Isso inclui criptografia em trânsito, controle de acesso baseado em papéis e monitoramento contínuo. Nenhum sistema é 100% seguro; por isso, mantemos práticas de segurança em revisão constante.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">8. Alterações nesta política</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Esta política pode ser atualizada periodicamente para refletir mudanças nos serviços ou na legislação. A data da última atualização está no topo da página. Recomendamos revisar este documento com regularidade.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">9. Contato</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Dúvidas sobre esta política podem ser enviadas para{" "}
            <a href="mailto:administracao@digitalfr.com.br" className="text-primary underline underline-offset-2">
              administracao@digitalfr.com.br
            </a>.
          </p>
        </section>

        <div className="pt-4">
          <Link
            to="/"
            className="inline-flex items-center text-sm text-primary underline underline-offset-2"
          >
            Voltar para o início
          </Link>
        </div>
      </div>
    </div>
  );
}
// regen 1783196007
