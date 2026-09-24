import { createFileRoute, Link } from "@tanstack/react-router";

const CANONICAL = "https://nextdisparo.com/politica-de-privacidade";
const TITLE = "Política de Privacidade — Agencia Next LTDA";
const DESCRIPTION =
  "Política de privacidade da Agencia Next LTDA (Next Disparos): quais dados coletamos no site, no aplicativo e na integração com o WhatsApp, como os usamos e como solicitar acesso, correção ou exclusão.";

export const Route = createFileRoute("/politica-de-privacidade")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: CANONICAL },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
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
          Esta Política de Privacidade é mantida por <strong>Agencia Next LTDA</strong>, titular da marca <strong>Next Disparos</strong>, para explicar de forma clara como tratamos os dados de quem usa nossos serviços — incluindo visitantes do site, clientes e usuários do aplicativo (painel), pessoas contatadas em campanhas e participantes de conversas via WhatsApp.
        </p>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">1. Quem somos e a quem esta política se aplica</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            <strong>Agencia Next LTDA</strong>, nome fantasia <strong>Agencia Next</strong>, CNPJ <strong>68.985.151/0001-80</strong>, com sede na Rua José Torquato, 0, Quadra 07, Lote 22, Residencial Bela Vista, Anápolis/GO, CEP 75126-310, é a empresa responsável pelo tratamento dos dados descritos nesta política.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Esta política abrange:
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>o <strong>site institucional</strong> da Next Disparos;</li>
            <li>o <strong>aplicativo (painel)</strong> usado por nossos clientes para criar e acompanhar demandas, contatos, disparos e relatórios;</li>
            <li>a <strong>integração com o WhatsApp</strong>, que opera por meio da API oficial da Meta (WhatsApp Business Platform) para envio de mensagens e atendimento;</li>
            <li>as <strong>campanhas, formulários e páginas</strong> criadas por nossos clientes na plataforma.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">2. Que dados coletamos</h2>
          <p className="text-sm text-muted-foreground">
            Coletamos apenas as informações necessárias para operar e prestar nossos serviços:
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li><strong>Dados de contato:</strong> nome, e-mail, telefone/WhatsApp e demais informações que você insere voluntariamente em formulários ou no cadastro.</li>
            <li><strong>Dados de conta no painel:</strong> nome, e-mail, telefone, CNPJ (opcional) e permissões de acesso dos usuários que o cliente cadastra no aplicativo.</li>
            <li><strong>Dados de campanhas:</strong> cliques, visualizações, dispositivo e origem do tráfego, usados para gerar os relatórios de desempenho do painel.</li>
            <li><strong>Dados de WhatsApp:</strong> número de telefone, mensagens trocadas, status de envio, entrega e leitura, quando você ou os contatos dos nossos clientes interagem pela nossa integração com a plataforma oficial da Meta.</li>
            <li><strong>Dados de descadastro:</strong> números que solicitaram não receber mensagens são registrados em lista de exclusão, para que não sejam contatados novamente.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">3. Como usamos as informações</h2>
          <p className="text-sm text-muted-foreground">Usamos os dados para:</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Operar o site, o painel e as funcionalidades de demandas, contatos, disparos e relatórios;</li>
            <li>Enviar e receber mensagens via WhatsApp pela integração oficial com a Meta, incluindo respostas automáticas e atendimento;</li>
            <li>Gerar relatórios de desempenho das campanhas para os clientes da plataforma;</li>
            <li>Honrar pedidos de descadastro e manter a lista de exclusão;</li>
            <li>Garantir a segurança da plataforma, prevenir usos indevidos e cumprir obrigações legais.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">4. Armazenamento e segurança</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Os dados são armazenados de forma segura e mantidos apenas pelo tempo necessário para as finalidades descritas nesta política e para o cumprimento de obrigações legais aplicáveis. Adotamos medidas técnicas e organizacionais para protegê-los contra acesso não autorizado, perda ou vazamento, incluindo criptografia em trânsito e controle de acesso por usuário e permissão. Nenhum sistema é totalmente imune; por isso, mantemos as práticas de segurança em revisão constante.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">5. Compartilhamento de dados</h2>
          <p className="text-sm text-muted-foreground">Não vendemos seus dados. Podemos compartilhar informações apenas com:</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li><strong>Meta (WhatsApp Business Platform):</strong> necessária para enviar e receber as mensagens da integração com o WhatsApp;</li>
            <li><strong>Provedores de infraestrutura:</strong> empresas que hospedam a plataforma e o banco de dados, contratadas para manter o serviço funcionando;</li>
            <li><strong>Autoridades:</strong> quando exigido por lei, ordem judicial ou requisição de autoridade competente.</li>
          </ul>
          <p className="text-sm leading-relaxed text-muted-foreground">
            O conteúdo das conversas e as listas de contatos de cada cliente ficam isolados por conta e não são compartilhados entre clientes nem revendidos.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">6. Cookies e tecnologias similares</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Utilizamos cookies e identificadores técnicos para manter sua sessão ativa no painel e oferecer uma experiência segura. Você pode desativar cookies nas configurações do navegador, mas algumas funcionalidades podem deixar de funcionar corretamente.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">7. Seus direitos: acesso, correção e exclusão</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Você pode solicitar, a qualquer tempo, o <strong>acesso</strong> aos seus dados, a <strong>correção</strong> de informações incompletas ou incorretas e a <strong>exclusão</strong> dos dados tratados pela Agencia Next LTDA. Para isso, envie um e-mail para{" "}
            <a href="mailto:contato@aagencianext.com" className="text-primary underline underline-offset-2">
              contato@aagencianext.com
            </a>{" "}
            com o assunto <strong>"Solicitação de dados"</strong>, informando seu nome e o número de telefone ou e-mail utilizado no contato, para que possamos localizar seus dados. Responderemos dentro do prazo previsto na legislação aplicável.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Nas conversas de WhatsApp, você também pode pedir para não receber mensagens respondendo com um pedido de descadastro; o número é então incluído na lista de exclusão e não recebe novos envios.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">8. Alterações nesta política</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Esta política pode ser atualizada periodicamente para refletir mudanças nos serviços ou na legislação. A data da última atualização está no topo da página, e recomendamos revisar este documento com regularidade.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">9. Contato</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            <strong>Agencia Next LTDA</strong><br />
            CNPJ 68.985.151/0001-80<br />
            Rua José Torquato, 0, Quadra 07, Lote 22, Residencial Bela Vista, Anápolis/GO, CEP 75126-310<br />
            E-mail:{" "}
            <a href="mailto:contato@aagencianext.com" className="text-primary underline underline-offset-2">
              contato@aagencianext.com
            </a>
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
