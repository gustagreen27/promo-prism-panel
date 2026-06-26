// Presets aplicados quando o usuário escolhe uma intenção de link.
// Servem como ponto de partida para título, descrição, kicker (a própria
// intenção) e texto da página intermediária — todos editáveis depois.

export type IntentPreset = {
  link_title: string;
  link_description: string;
  intermediate_text: string;
  cta_label: string;
  og_type: string;
  /** Categoria sugerida para a página de destino (apenas sugestão). */
  page_category?: string;
};

export const INTENT_PRESETS: Record<string, IntentPreset> = {
  "Inscrição em evento": {
    link_title: "Garanta sua inscrição",
    link_description:
      "Faça sua inscrição em poucos cliques e receba todos os detalhes do evento.",
    intermediate_text:
      "Sua vaga está a um clique. Continue para concluir a inscrição no evento.",
    cta_label: "Quero me inscrever",
    og_type: "website",
    page_category: "Formulário",
  },
  "Confirmação de participação": {
    link_title: "Confirme sua presença",
    link_description:
      "Confirme que você vai participar para receber os avisos importantes.",
    intermediate_text:
      "Falta só um passo. Confirme sua presença para garantir o acesso completo.",
    cta_label: "Confirmar presença",
    og_type: "website",
    page_category: "Formulário",
  },
  "Aula ao vivo": {
    link_title: "Sua aula ao vivo começa em instantes",
    link_description:
      "Entre agora na sala da aula ao vivo e participe em tempo real.",
    intermediate_text:
      "A transmissão já está liberada. Clique para entrar na aula ao vivo.",
    cta_label: "Entrar na aula",
    og_type: "video.other",
    page_category: "Vídeo / live",
  },
  "Conteúdo educacional": {
    link_title: "Acesse o conteúdo",
    link_description:
      "Material exclusivo para acelerar seu aprendizado — acesso imediato.",
    intermediate_text:
      "Conteúdo pronto para você. Continue para abrir o material completo.",
    cta_label: "Acessar conteúdo",
    og_type: "article",
    page_category: "Artigo / blog",
  },
  "Página institucional": {
    link_title: "Conheça nossa página",
    link_description: "Saiba mais sobre quem somos e o que oferecemos.",
    intermediate_text: "Continue para conhecer a página oficial.",
    cta_label: "Visitar página",
    og_type: "website",
    page_category: "Landing page",
  },
  Atendimento: {
    link_title: "Fale com nosso atendimento",
    link_description: "Tire dúvidas e receba atendimento direto da equipe.",
    intermediate_text:
      "Vamos te atender agora. Continue para iniciar a conversa.",
    cta_label: "Falar com atendimento",
    og_type: "website",
    page_category: "Outro",
  },
  Suporte: {
    link_title: "Central de suporte",
    link_description:
      "Acesso direto à central de suporte para resolver sua solicitação.",
    intermediate_text:
      "Continue para abrir a central de suporte e registrar sua solicitação.",
    cta_label: "Abrir suporte",
    og_type: "website",
    page_category: "Outro",
  },
  Comunidade: {
    link_title: "Entre na comunidade",
    link_description:
      "Faça parte do grupo, troque experiências e receba novidades em primeira mão.",
    intermediate_text:
      "Sua entrada está liberada. Continue para acessar a comunidade.",
    cta_label: "Entrar na comunidade",
    og_type: "website",
    page_category: "Comunidade / grupo",
  },
  Cadastro: {
    link_title: "Crie seu cadastro",
    link_description:
      "Cadastro rápido para liberar todos os recursos disponíveis.",
    intermediate_text:
      "Continue para finalizar seu cadastro em poucos segundos.",
    cta_label: "Fazer cadastro",
    og_type: "website",
    page_category: "Formulário",
  },
  Oferta: {
    link_title: "Oferta especial liberada",
    link_description:
      "Condição exclusiva disponível por tempo limitado — não perca.",
    intermediate_text:
      "Sua oferta está pronta. Continue para ver as condições completas.",
    cta_label: "Ver oferta",
    og_type: "website",
    page_category: "Checkout",
  },
  Upsell: {
    link_title: "Upgrade exclusivo",
    link_description:
      "Aprimore sua experiência com uma condição especial só para você.",
    intermediate_text:
      "Condição válida por tempo limitado. Continue para aproveitar o upgrade.",
    cta_label: "Quero o upgrade",
    og_type: "website",
    page_category: "Checkout",
  },
  "Recuperação de lead": {
    link_title: "Continue de onde parou",
    link_description:
      "Retomamos seu acesso para você concluir o passo que ficou pendente.",
    intermediate_text:
      "Você está quase lá. Continue para finalizar o que ficou pendente.",
    cta_label: "Retomar agora",
    og_type: "website",
    page_category: "Landing page",
  },
  "Página de aviso": {
    link_title: "Aviso importante",
    link_description: "Informação relevante sobre sua conta ou inscrição.",
    intermediate_text:
      "Leia o aviso a seguir antes de continuar — clique para abrir.",
    cta_label: "Abrir aviso",
    og_type: "website",
    page_category: "Página de erro / aviso",
  },
  "Página de redirecionamento informativo": {
    link_title: "Você está sendo redirecionado",
    link_description: "Em instantes você será levado à página correta.",
    intermediate_text:
      "Estamos te encaminhando para a página oficial. Continue para prosseguir.",
    cta_label: "Continuar",
    og_type: "website",
    page_category: "Outro",
  },
};

export function getIntentPreset(intent: string | null | undefined): IntentPreset | null {
  if (!intent) return null;
  return INTENT_PRESETS[intent] ?? null;
}

/** Quais campos do form devem ser preenchidos a partir do preset. */
export const PRESET_TARGET_FIELDS = [
  "link_title",
  "link_description",
  "intermediate_text",
  "cta_label",
  "og_type",
  "og_title",
  "og_description",
  "page_category",
] as const;

export type PresetTargetField = (typeof PRESET_TARGET_FIELDS)[number];

/**
 * Aplica o preset ao form. Se `overwrite` for false, só preenche campos vazios.
 * Retorna um novo objeto com as alterações.
 */
export function applyIntentPreset(
  form: Record<string, string>,
  intent: string | null | undefined,
  overwrite: boolean,
): { next: Record<string, string>; changed: PresetTargetField[] } {
  const preset = getIntentPreset(intent);
  if (!preset) return { next: form, changed: [] };
  const next = { ...form };
  const changed: PresetTargetField[] = [];

  const setIf = (key: PresetTargetField, value: string) => {
    if (!value) return;
    const current = (next[key] ?? "").trim();
    if (current && !overwrite) return;
    if (current === value) return;
    next[key] = value;
    changed.push(key);
  };

  setIf("link_title", preset.link_title);
  setIf("link_description", preset.link_description);
  setIf("intermediate_text", preset.intermediate_text);
  setIf("cta_label", preset.cta_label);
  setIf("og_type", preset.og_type);
  // og_title / og_description seguem o link_title / link_description quando vazios
  setIf("og_title", preset.link_title);
  setIf("og_description", preset.link_description);
  if (preset.page_category) setIf("page_category", preset.page_category);

  return { next, changed };
}
