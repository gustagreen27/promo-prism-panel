/**
 * Porta única de saída (egress) para TODAS as chamadas ao graph.facebook.com.
 *
 * Objetivo desta camada:
 *  - centralizar o transporte HTTP das chamadas à Meta em um único ponto,
 *    para que o caminho de rede (direto ou via relay/proxy fixo) seja
 *    configurável sem tocar em fila, workers, rate limit ou payloads;
 *  - distinguir claramente falha de EGRESS (rede/relay/proxy) de falha da META
 *    (resposta HTTP da Graph API com corpo de erro);
 *  - nunca fazer fallback silencioso: se o modo for "proxy" e o relay falhar,
 *    a tentativa é abortada com erro explícito, jamais sai por IP direto.
 *
 * Segredos são lidos SEMPRE dentro das funções (nunca em escopo de módulo),
 * porque no runtime serverless o env é injetado por requisição.
 * Usuário/senha do proxy nunca aparecem em mensagem de erro nem em log.
 */

export type MetaEgressMode = "direct" | "proxy";

export type EgressFailureCode =
  | "egress_timeout"
  | "egress_unavailable"
  | "egress_auth"
  | "egress_misconfigured"
  | "egress_cancelled";

/** Erro originado na camada de rede/relay — NUNCA é erro de negócio da Meta. */
export class MetaEgressError extends Error {
  readonly source = "egress" as const;
  code: EgressFailureCode;
  endpoint: string;

  constructor(code: EgressFailureCode, message: string, endpoint: string) {
    super(message);
    this.name = "MetaEgressError";
    this.code = code;
    this.endpoint = endpoint;
  }
}

export function isMetaEgressError(e: unknown): e is MetaEgressError {
  return !!e && typeof e === "object" && (e as any).source === "egress";
}

function env(name: string): string | undefined {
  if (typeof process === "undefined" || !process.env) return undefined;
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : undefined;
}

export function getEgressMode(): MetaEgressMode {
  return env("META_EGRESS_MODE") === "proxy" ? "proxy" : "direct";
}

/** Descrição segura do egress atual (sem credenciais) para diagnóstico. */
export function describeEgress() {
  const mode = getEgressMode();
  const relay = env("META_EGRESS_RELAY_URL");
  let relayHost: string | null = null;
  if (relay) {
    try {
      relayHost = new URL(relay).host;
    } catch {
      relayHost = "invalid_url";
    }
  }
  return { mode, relay_host: relayHost, relay_configured: !!relay };
}

export type MetaEgressInit = RequestInit & {
  /** Timeout total da chamada (default 25s). */
  timeoutMs?: number;
  /** Sinal externo de cancelamento (circuit breaker). */
  externalSignal?: AbortSignal;
};

const DEFAULT_TIMEOUT_MS = 25_000;

/**
 * Executa a chamada HTTP à Meta pelo caminho de egress configurado.
 * Retorna a Response crua — o parsing/erro de negócio continua com quem chamou,
 * exatamente como antes (nenhuma mudança de comportamento no modo "direct").
 */
export async function metaEgressFetch(
  url: string,
  init: MetaEgressInit = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, externalSignal, signal, ...rest } = init;
  const mode = getEgressMode();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
  const external = externalSignal ?? (signal as AbortSignal | undefined);
  const onAbort = () => controller.abort(new Error("cancelled"));
  if (external) {
    if (external.aborted) controller.abort(new Error("cancelled"));
    else external.addEventListener("abort", onAbort, { once: true });
  }

  try {
    if (mode === "direct") {
      return await fetch(url, { ...rest, signal: controller.signal });
    }

    // ---- modo proxy: sai obrigatoriamente pelo relay de IP fixo ----
    const relayUrl = env("META_EGRESS_RELAY_URL");
    const relaySecret = env("META_EGRESS_RELAY_SECRET");
    if (!relayUrl || !relaySecret) {
      throw new MetaEgressError(
        "egress_misconfigured",
        "META_EGRESS_MODE=proxy mas o relay de saída não está configurado (URL/segredo ausentes).",
        url,
      );
    }

    const headers = new Headers(rest.headers as HeadersInit | undefined);
    headers.set("x-egress-secret", relaySecret);
    headers.set("x-egress-target", url);

    let res: Response;
    try {
      res = await fetch(relayUrl, {
        ...rest,
        headers,
        signal: controller.signal,
      });
    } catch (e: any) {
      throw toEgressError(e, url, external);
    }

    // Erros gerados pelo próprio relay (não pela Meta) vêm marcados.
    const relayError = res.headers.get("x-egress-error");
    if (relayError) {
      throw new MetaEgressError(
        relayError === "auth" ? "egress_auth" : "egress_unavailable",
        `Falha no egress fixo (relay respondeu: ${relayError}).`,
        url,
      );
    }
    if (res.status === 502 || res.status === 504) {
      throw new MetaEgressError(
        "egress_unavailable",
        `Relay de saída indisponível (HTTP ${res.status}). Tentativa abortada — sem fallback para IP direto.`,
        url,
      );
    }
    return res;
  } catch (e: any) {
    if (isMetaEgressError(e)) throw e;
    throw toEgressError(e, url, external);
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", onAbort);
  }
}

function toEgressError(e: any, url: string, external?: AbortSignal): Error {
  const aborted = e?.name === "AbortError";
  if (aborted && external?.aborted) {
    return new MetaEgressError("egress_cancelled", "Chamada cancelada externamente.", url);
  }
  if (aborted) {
    return new MetaEgressError("egress_timeout", "Tempo esgotado na saída de rede.", url);
  }
  // Erro de rede genérico: em modo direct mantemos o erro original para não
  // mudar o comportamento atual do motor; em modo proxy classificamos.
  if (getEgressMode() === "proxy") {
    return new MetaEgressError("egress_unavailable", e?.message ?? "Falha de rede no egress.", url);
  }
  return e instanceof Error ? e : new Error(String(e?.message ?? e));
}
