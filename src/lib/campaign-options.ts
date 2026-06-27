// Listas compartilhadas usadas nos formulários de campanha (criar/editar).

export const CATEGORIES = [
  "Comunicado",
  "Promoção",
  "Conteúdo",
  "Outro",
];

export const CAMPAIGN_TYPES = [
  "Disparo em massa",
  "Anúncio pago",
  "Email marketing",
  "Orgânico / social",
  "Notificação interna",
  "Parceria / afiliado",
  "Outro",
];

export const LINK_INTENTS = [
  "Inscrição em evento",
  "Confirmação de participação",
  "Aula ao vivo",
  "Conteúdo educacional",
  "Página institucional",
  "Atendimento",
  "Suporte",
  "Comunidade",
  "Cadastro",
  "Oferta",
  "Upsell",
  "Recuperação de lead",
  "Página de aviso",
  "Página de redirecionamento informativo",
];

export const PAGE_CATEGORIES = [
  "Landing page",
  "Checkout",
  "Formulário",
  "Vídeo / live",
  "Artigo / blog",
  "Documento / PDF",
  "Comunidade / grupo",
  "Página de erro / aviso",
  "Outro",
];

export const OPEN_MODES = [
  {
    value: "smart",
    label: "Inteligente",
    description: "Tenta iframe; se o destino bloquear, redireciona automaticamente.",
  },
  {
    value: "iframe",
    label: "Iframe fullscreen",
    description: "Sempre carrega o destino em iframe ocupando 100% da tela.",
  },
  {
    value: "redirect",
    label: "Redirecionamento direto",
    description: "Envia o visitante imediatamente para a URL final, sem iframe.",
  },
  {
    value: "wrapper",
    label: "Página com CTA",
    description: "Mostra uma página intermediária com título, descrição e botão.",
  },
] as const;

export type OpenMode = (typeof OPEN_MODES)[number]["value"];
