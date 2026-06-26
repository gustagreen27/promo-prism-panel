// Validação compartilhada do formulário de campanha.
// Distingue entre erros que bloqueiam o salvamento e avisos que apenas
// alertam (por ex.: campanha pode ser salva como rascunho mesmo
// incompleta, mas não pode ser publicada).

export type FieldIssue = {
  field: string;
  level: "error" | "warning";
  message: string;
};

export type ValidationResult = {
  issues: FieldIssue[];
  errorsByField: Record<string, FieldIssue[]>;
  warningsByField: Record<string, FieldIssue[]>;
  hasBlockingErrors: boolean;
  canPublish: boolean;
};

function isValidUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateCampaignForm(
  form: Record<string, string>,
  status: string,
): ValidationResult {
  const issues: FieldIssue[] = [];
  const intentSelected = !!(form.link_intent ?? "").trim();
  const willPublish = status === "active";

  // Sempre obrigatórios
  if (!(form.name ?? "").trim()) {
    issues.push({ field: "name", level: "error", message: "Informe o nome da campanha." });
  }
  if (!(form.slug ?? "").trim()) {
    issues.push({ field: "slug", level: "error", message: "Defina o slug da URL pública." });
  }
  const destination = (form.destination_url ?? "").trim();
  if (!destination) {
    issues.push({
      field: "destination_url",
      level: "error",
      message: "Informe a URL final de destino — sem ela o link não tem para onde apontar.",
    });
  } else if (!isValidUrl(destination)) {
    issues.push({
      field: "destination_url",
      level: "error",
      message: "URL de destino inválida — use http(s)://...",
    });
  } else if (!destination.startsWith("https://")) {
    issues.push({
      field: "destination_url",
      level: "warning",
      message: "Destino sem HTTPS — recomendado para segurança e confiança do usuário.",
    });
  }

  // Dependentes da intenção
  if (intentSelected) {
    if (!(form.intermediate_text ?? "").trim()) {
      issues.push({
        field: "intermediate_text",
        level: willPublish ? "error" : "warning",
        message:
          "Você escolheu uma intenção, mas o texto da página intermediária está vazio — esse texto reforça o que o usuário verá ao clicar.",
      });
    }
    if (!(form.cta_label ?? "").trim()) {
      issues.push({
        field: "cta_label",
        level: willPublish ? "error" : "warning",
        message: "Defina o texto do botão de ação coerente com a intenção escolhida.",
      });
    }
    if (!(form.link_title ?? "").trim()) {
      issues.push({
        field: "link_title",
        level: willPublish ? "error" : "warning",
        message: "Defina um título do link adequado à intenção escolhida.",
      });
    }
  }

  // Avisos para preview / OG
  if (!(form.og_image_url ?? "").trim() && !(form.preview_image_url ?? "").trim()) {
    issues.push({
      field: "og_image_url",
      level: "warning",
      message: "Sem imagem de preview o link aparecerá sem capa em redes sociais.",
    });
  }

  // Coerência simples de UTMs
  const utmFilled = ["utm_source", "utm_medium", "utm_campaign"].filter(
    (k) => (form[k] ?? "").trim(),
  );
  if (utmFilled.length > 0 && utmFilled.length < 3) {
    issues.push({
      field: utmFilled[0],
      level: "warning",
      message:
        "Para rastreamento confiável preencha pelo menos utm_source, utm_medium e utm_campaign.",
    });
  }

  const errorsByField: Record<string, FieldIssue[]> = {};
  const warningsByField: Record<string, FieldIssue[]> = {};
  for (const i of issues) {
    const bucket = i.level === "error" ? errorsByField : warningsByField;
    bucket[i.field] ||= [];
    bucket[i.field].push(i);
  }

  const hasBlockingErrors = issues.some((i) => i.level === "error");
  return {
    issues,
    errorsByField,
    warningsByField,
    hasBlockingErrors,
    canPublish: !hasBlockingErrors,
  };
}
