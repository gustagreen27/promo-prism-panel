/**
 * ErrorClassifier — camada única de classificação de erros da Meta.
 *
 * Toda decisão do motor (retry / falha definitiva / supressão do destinatário /
 * problema de rota) passa por aqui. Não espalhe `if (code === "131026")` pelo
 * projeto: adicione o código nos mapas abaixo.
 *
 * Módulo puro (sem I/O) — pode ser importado no servidor e no cliente.
 */

export type ErrorCategory =
  | "SUCCESS"
  | "RETRYABLE"
  | "NON_RETRYABLE"
  | "RECIPIENT_SUPPRESSION"
  | "ROUTE_PROBLEM"
  | "FATAL_ACCOUNT";

export type ClassifiedError = {
  category: ErrorCategory;
  code: string;
  title: string;
  /** Mensagem crua da Meta / rede. */
  message: string;
  /** true = pode reagendar com backoff. */
  retryable: boolean;
  /** true = candidato à supressão global (após limiar de repetição). */
  suppressionCandidate: boolean;
  /** true = erro de rede/timeout (não é rejeição da Meta). */
  network: boolean;
  /** true = throughput/rate limit → throttle adaptativo do número. */
  throughput: boolean;
};

/** Erros FATAIS de conta: param tudo imediatamente (circuit breaker). */
export const FATAL_ACCOUNT_CODES: Record<string, string> = {
  "131031": "Conta comercial bloqueada pela Meta",
  "131042": "Problema de pagamento na conta comercial",
  "133010": "Número não registrado na Cloud API",
};

/** Throughput/rate limit → throttle do número, nunca pausa a campanha. */
export const THROUGHPUT_CODES = new Set(["130429", "80007"]);

/** Problema da rota (número/template), não do destinatário. */
export const ROUTE_PROBLEM_CODES: Record<string, string> = {
  "132015": "Template pausado pela Meta",
  "132016": "Template desabilitado pela Meta",
  "132001": "Template não existe nesse idioma/WABA",
  "133004": "Número temporariamente indisponível",
  "190": "Token inválido ou expirado",
};

/** Temporários: valem retry com backoff. */
export const RETRYABLE_CODES: Record<string, string> = {
  "130429": "Limite de throughput do número",
  "80007": "Limite de requisições da WABA",
  "131000": "Erro temporário da Meta",
  "131016": "Serviço da Meta sobrecarregado",
  "131056": "Muitas mensagens para o mesmo destinatário",
  "368": "Bloqueio temporário da conta",
  "500": "Erro interno da Meta",
  "502": "Gateway indisponível",
  "503": "Serviço indisponível",
  "504": "Tempo esgotado no gateway",
  network_error: "Falha de rede",
  timeout: "Tempo esgotado",
};

/** Definitivos nesta execução: não adianta reenviar agora. */
export const NON_RETRYABLE_CODES: Record<string, string> = {
  "131047": "Fora da janela de 24h (reengajamento necessário)",
  "131049": "Limitação de entrega da Meta (qualidade/frequência)",
  "131051": "Tipo de mensagem não suportado",
  "132000": "Número de parâmetros do template incorreto",
  "132005": "Texto do template maior que o permitido",
  "132007": "Formato do template inválido",
  "132012": "Formato de parâmetro inválido",
  "132068": "Fluxo do template indisponível",
  "132069": "Fluxo do template inválido",
  "133015": "Número em processo de registro",
  "100": "Parâmetro inválido na requisição",
  no_wamid: "Meta não retornou identificador da mensagem",
};

/** Destinatário inválido/inelegível → candidato à supressão global. */
export const SUPPRESSION_CODES: Record<string, string> = {
  "131026": "Número não recebe mensagens (sem WhatsApp ou bloqueado)",
  "131052": "Falha ao baixar mídia do destinatário",
  "470": "Destinatário inelegível",
  "131053": "Destinatário inválido",
};

const NETWORK_RE =
  /failed to fetch|fetch failed|network|econnreset|etimedout|enetunreach|socket hang up|timeout|tempo esgotado|aborted/i;

type RawResult = {
  ok?: boolean;
  code?: string | number | null;
  error?: string | null;
  httpStatus?: number | null;
  raw?: any;
};

/** Extrai o código fatal de conta em qualquer dos 3 formatos da Meta. */
export function detectFatalAccountCode(result: RawResult): string | null {
  const direct = result?.code != null ? String(result.code) : null;
  if (direct && FATAL_ACCOUNT_CODES[direct]) return direct;

  const err = result?.raw?.error ?? result?.raw ?? null;
  const sub = err?.error_subcode != null ? String(err.error_subcode) : null;
  if (sub && FATAL_ACCOUNT_CODES[sub]) return sub;

  const haystack = `${result?.error ?? ""} ${err?.message ?? ""} ${err?.error_user_msg ?? ""}`;
  for (const code of Object.keys(FATAL_ACCOUNT_CODES)) {
    if (haystack.includes(`#${code}`) || haystack.includes(code)) return code;
  }
  if (/business account has been locked|account has been restricted/i.test(haystack)) return "131031";
  return null;
}

/** Título legível para um código, mesmo desconhecido. */
export function describeErrorCode(code: string | null | undefined): string {
  if (!code) return "Erro desconhecido";
  return (
    FATAL_ACCOUNT_CODES[code] ??
    ROUTE_PROBLEM_CODES[code] ??
    SUPPRESSION_CODES[code] ??
    NON_RETRYABLE_CODES[code] ??
    RETRYABLE_CODES[code] ??
    (code === "desconhecido" ? "Erro desconhecido" : `Erro ${code}`)
  );
}

export function classifyMetaError(result: RawResult): ClassifiedError {
  if (result?.ok) {
    return {
      category: "SUCCESS",
      code: "0",
      title: "Aceito pela Meta",
      message: "",
      retryable: false,
      suppressionCandidate: false,
      network: false,
      throughput: false,
    };
  }

  const message = result?.error ?? "";
  const httpStatus = result?.httpStatus ?? null;
  let code = result?.code != null && result.code !== "" ? String(result.code) : "";

  const isNetwork = code === "network_error" || (!code && NETWORK_RE.test(message)) || NETWORK_RE.test(message);
  if (!code && isNetwork) code = "network_error";
  if (!code && httpStatus) code = String(httpStatus);
  if (!code) code = "desconhecido";

  const base = {
    code,
    message,
    network: isNetwork,
    throughput: THROUGHPUT_CODES.has(code),
  };

  const fatal = detectFatalAccountCode(result);
  if (fatal) {
    return {
      ...base,
      code: fatal,
      category: "FATAL_ACCOUNT",
      title: FATAL_ACCOUNT_CODES[fatal]!,
      retryable: false,
      suppressionCandidate: false,
    };
  }

  if (SUPPRESSION_CODES[code]) {
    return {
      ...base,
      category: "RECIPIENT_SUPPRESSION",
      title: SUPPRESSION_CODES[code]!,
      retryable: false,
      suppressionCandidate: true,
    };
  }

  if (ROUTE_PROBLEM_CODES[code] || /template .*paused|temporarily unavailable|OAuthException/i.test(message)) {
    const resolved = ROUTE_PROBLEM_CODES[code] ? code : /OAuthException|token/i.test(message) ? "190" : "132015";
    return {
      ...base,
      code: resolved,
      category: "ROUTE_PROBLEM",
      title: ROUTE_PROBLEM_CODES[resolved] ?? "Problema na rota (número/template)",
      retryable: false,
      suppressionCandidate: false,
    };
  }

  if (isNetwork || RETRYABLE_CODES[code] || (httpStatus != null && httpStatus >= 500)) {
    return {
      ...base,
      category: "RETRYABLE",
      title: RETRYABLE_CODES[code] ?? (isNetwork ? "Falha de rede" : `Erro temporário ${code}`),
      retryable: true,
      suppressionCandidate: false,
    };
  }

  return {
    ...base,
    category: "NON_RETRYABLE",
    title: NON_RETRYABLE_CODES[code] ?? `Erro definitivo ${code}`,
    retryable: false,
    suppressionCandidate: false,
  };
}
