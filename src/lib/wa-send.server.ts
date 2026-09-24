import { GRAPH_VERSION } from "@/lib/meta/graph-version";
// Server-only helper for sending official WhatsApp Cloud API messages.
// Never import this from a route or *.functions.ts module scope.
// Always: const { sendTemplateMessage } = await import("@/lib/wa-send.server");

export type WaSendButton = { index: number; urlParam: string; fullUrl?: string };

export type WaSendInput = {
  phoneNumberId: string;
  accessToken: string;
  graphVersion?: string;
  to: string; // E.164 without +
  templateName: string;
  languageCode: string;
  variables?: Record<string, string>; // {{1}}, {{2}} -> by name "1","2" (keys starting with "_" are treated as meta)
  headerType?: string | null;
  headerValue?: string | null; // image/document url or text
  /** Novo: lista completa de botões URL dinâmicos a enviar. */
  buttons?: WaSendButton[];
  /** Legado: um único botão URL. Usado se `buttons` estiver vazio. */
  buttonUrlParam?: string | null;
  buttonIndex?: number;
  /** Chave opaca ecoada pela Meta em status webhooks; usada como dedup key server-side. */
  bizOpaqueCallbackData?: string | null;
  /**
   * Sinal externo de cancelamento (circuit breaker). Quando a conta é bloqueada
   * pela Meta, as requisições ainda em voo são abortadas em vez de concluídas.
   */
  signal?: AbortSignal;
  /**
   * API de Mensagens de Marketing (MM Lite): envia por
   * /{PHONE_NUMBER_ID}/marketing_messages em vez de /messages.
   */
  useMmLite?: boolean;
  /** Compartilhamento de atividade de evento por mensagem (MM Lite). */
  messageActivitySharing?: boolean;
};



export type WaSendResult =
  | { ok: true; metaMessageId: string; messageStatus: string | null; wamid: string | null; raw: any; httpStatus: number; requestStartedAt: string; responseReceivedAt: string }
  | { ok: false; error: string; code?: string; raw?: any; httpStatus?: number; requestStartedAt: string; responseReceivedAt: string };

const META_SEND_TIMEOUT_MS = 8000;

// Todas as chamadas saem pela porta única de egress (ver meta-egress.ts).
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = META_SEND_TIMEOUT_MS,
  external?: AbortSignal,
) {
  const { metaEgressFetch } = await import("@/lib/meta/meta-egress");
  return await metaEgressFetch(url, { ...init, timeoutMs, externalSignal: external });
}




function buildBodyComponents(variables?: Record<string, string>) {
  if (!variables) return [];
  // Ignore reserved meta keys (e.g. _header_image_url).
  const positional = Object.keys(variables)
    .filter((k) => /^\d+$/.test(k))
    .sort((a, b) => Number(a) - Number(b));

  if (positional.length) {
    return [
      {
        type: "body",
        parameters: positional.map((k) => ({ type: "text", text: String(variables[k] ?? "") })),
      },
    ];
  }

  // Parâmetros nomeados (parameter_format: NAMED) — ex.: { day: "Sábado" }
  const named = Object.keys(variables).filter((k) => /^[a-z0-9_]+$/.test(k) && !k.startsWith("_"));
  if (!named.length) return [];
  return [
    {
      type: "body",
      parameters: named.map((k) => ({
        type: "text",
        parameter_name: k,
        text: String(variables[k] ?? ""),
      })),
    },
  ];
}


function buildHeaderComponent(headerType?: string | null, value?: string | null) {
  if (!headerType || !value) return [];
  const t = headerType.toLowerCase();
  if (t === "text") {
    // Only include a header component when the template header actually has a variable ({{n}}).
    // Static header text has 0 params and Meta rejects extra params with error 132000.
    if (!/\{\{\s*\d+\s*\}\}/.test(value)) return [];
    return [{ type: "header", parameters: [{ type: "text", text: value }] }];
  }
  if (t === "image") return [{ type: "header", parameters: [{ type: "image", image: { link: value } }] }];
  if (t === "video") return [{ type: "header", parameters: [{ type: "video", video: { link: value } }] }];
  if (t === "document")
    return [{ type: "header", parameters: [{ type: "document", document: { link: value } }] }];
  return [];
}

function buildButtonComponents(
  buttons?: WaSendButton[],
  legacyUrlParam?: string | null,
  legacyIndex = 0,
) {
  const list: WaSendButton[] = Array.isArray(buttons) && buttons.length
    ? buttons.filter((b) => b && typeof b.urlParam === "string" && b.urlParam.length > 0)
    : legacyUrlParam
      ? [{ index: legacyIndex, urlParam: legacyUrlParam }]
      : [];
  return list.map((b) => ({
    type: "button",
    sub_type: "url",
    index: String(b.index),
    parameters: [{ type: "text", text: b.fullUrl ?? b.urlParam }],
  }));
}


export async function sendTemplateMessage(input: WaSendInput): Promise<WaSendResult> {
  const ver = GRAPH_VERSION;
  const endpoint = input.useMmLite ? "marketing_messages" : "messages";
  const url = `https://graph.facebook.com/${ver}/${input.phoneNumberId}/${endpoint}`;
  const body: Record<string, any> = {
    messaging_product: "whatsapp",
    ...(input.useMmLite ? { recipient_type: "individual" } : {}),
    ...(input.useMmLite && typeof input.messageActivitySharing === "boolean"
      ? { message_activity_sharing: input.messageActivitySharing }
      : {}),
    to: input.to,
    type: "template",
    template: {
      name: input.templateName,
      language: { code: input.languageCode },
      components: [
        ...buildHeaderComponent(input.headerType, input.headerValue),
        ...buildBodyComponents(input.variables),
        ...buildButtonComponents(input.buttons, input.buttonUrlParam, input.buttonIndex ?? 0),
      ],
    },
  };
  // Meta ecoa esse valor em cada status callback (sent/delivered/read/failed) —
  // usamos recipient_id como chave para dedupe determinístico do lado do provedor.
  if (input.bizOpaqueCallbackData) {
    body.biz_opaque_callback_data = String(input.bizOpaqueCallbackData);
  }

  const requestStartedAt = new Date().toISOString();
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${input.accessToken}`,
        },
        body: JSON.stringify(body),
      },
      META_SEND_TIMEOUT_MS,
      input.signal,
    );

    const json: any = await res.json().catch(() => ({}));
    const responseReceivedAt = new Date().toISOString();
    if (!res.ok) {
      const err = json?.error;
      const details = err?.error_data?.details;
      const baseMsg = err?.message ?? `HTTP ${res.status}`;
      return {
        ok: false,
        error: details ? `${baseMsg} — ${details}` : baseMsg,
        code: err?.code ? String(err.code) : String(res.status),
        raw: json,
        httpStatus: res.status,
        requestStartedAt,
        responseReceivedAt,
      };
    }
    const msg = json?.messages?.[0];
    const id = msg?.id;
    const messageStatus: string | null = msg?.message_status ?? null;
    const wamid: string | null = id ?? null;
    if (!id) return { ok: false, error: "No message id returned", raw: json, httpStatus: res.status, requestStartedAt, responseReceivedAt };
    return { ok: true, metaMessageId: id, messageStatus, wamid, raw: json, httpStatus: res.status, requestStartedAt, responseReceivedAt };
  } catch (e: any) {
    const egress = e?.source === "egress";
    const aborted = e?.name === "AbortError" || e?.code === "egress_timeout";
    // Cancelamento externo (circuit breaker) ≠ timeout: não conta como falha
    // do destinatário, ele volta para a fila sem consumir tentativa.
    const cancelled =
      e?.code === "egress_cancelled" || (aborted && input.signal?.aborted === true);
    // Falha de egress (relay/proxy) é reportada com código próprio para não
    // ser confundida com erro da Meta. Sem fallback para conexão direta.
    const code = cancelled
      ? "cancelled"
      : egress
        ? String(e.code ?? "egress_unavailable")
        : "network_error";
    return {
      ok: false,
      error: cancelled
        ? "Envio cancelado pelo circuit breaker (conta bloqueada)"
        : egress
          ? `Falha na saída de rede (${e.code}): ${e.message}`
          : aborted
            ? `Meta Graph timeout após ${META_SEND_TIMEOUT_MS}ms`
            : (e?.message ?? "Network error"),
      code,
      requestStartedAt,
      responseReceivedAt: new Date().toISOString(),
    };
  }

}

export async function syncTemplatesFromMeta(opts: {
  wabaId: string;
  accessToken: string;
  graphVersion?: string;
}) {
  const ver = GRAPH_VERSION;
  const url = `https://graph.facebook.com/${ver}/${opts.wabaId}/message_templates?limit=200`;
  const { metaEgressFetch } = await import("@/lib/meta/meta-egress");
  const res = await metaEgressFetch(url, { headers: { Authorization: `Bearer ${opts.accessToken}` } });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  return (json?.data ?? []) as any[];
}


// ---------------------------------------------------------------------------
// Template específico frgc_01 (Disparos FR)
// Header: imagem | Body: 4 variáveis | Botão URL com 1 parâmetro
// ---------------------------------------------------------------------------

export type SendFrgc01Input = {
  phoneNumberId: string;
  accessToken: string;
  graphVersion?: string;
  to: string;
  imageUrl: string;
  mediaType?: "image" | "video";
  nomeCliente: string;
  informacaoPrincipal: string;
  mensagemComplementar: string;
  textoAcao: string;
  urlParametro: string;
  templateName?: string;
};

export type SendFrgc01Result =
  | { ok: true; metaMessageId: string; status: string; requestPayload: any; raw: any; httpStatus: number }
  | { ok: false; error: string; code?: string; requestPayload: any; raw?: any; httpStatus?: number };

export function buildFrgc01Payload(input: SendFrgc01Input) {
  const mediaType = input.mediaType ?? "image";
  const headerParam =
    mediaType === "video"
      ? { type: "video", video: { link: input.imageUrl } }
      : { type: "image", image: { link: input.imageUrl } };
  const templateName =
    input.templateName ?? (mediaType === "video" ? "fdsda_01" : "frgc_01");

  return {
    messaging_product: "whatsapp",
    to: input.to,
    type: "template",
    template: {
      name: templateName,
      language: { code: "en" },
      components: [
        {
          type: "header",
          parameters: [headerParam],
        },
        {
          type: "body",
          parameters: [
            { type: "text", text: input.nomeCliente },
            { type: "text", text: input.informacaoPrincipal },
            { type: "text", text: input.mensagemComplementar },
            { type: "text", text: input.textoAcao },
          ],
        },
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: input.urlParametro }],
        },
      ],
    },
  };
}

export async function sendWhatsAppTemplateFrgc01(input: SendFrgc01Input): Promise<SendFrgc01Result> {
  const ver = GRAPH_VERSION;
  const url = `https://graph.facebook.com/${ver}/${input.phoneNumberId}/messages`;
  const payload = buildFrgc01Payload(input);

  try {
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.accessToken}`,
      },
      body: JSON.stringify(payload),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = json?.error;
      return {
        ok: false,
        error: err?.message ?? `HTTP ${res.status}`,
        code: err?.code ? String(err.code) : String(res.status),
        requestPayload: payload,
        raw: json,
        httpStatus: res.status,
      };
    }
    const id = json?.messages?.[0]?.id;
    const status = json?.messages?.[0]?.message_status ?? "accepted";
    if (!id) {
      return { ok: false, error: "No message id returned", requestPayload: payload, raw: json, httpStatus: res.status };
    }
    return { ok: true, metaMessageId: id, status, requestPayload: payload, raw: json, httpStatus: res.status };
  } catch (e: any) {
    const timedOut = e?.name === "AbortError" || e?.code === "egress_timeout";
    return {
      ok: false,
      error: timedOut ? `Meta Graph timeout após ${META_SEND_TIMEOUT_MS}ms` : (e?.message ?? "Network error"),
      code: "network_error",
      requestPayload: payload,
    };
  }
}


// ---------------------------------------------------------------------------
// Direct Send — Utilidade: texto livre (sem template) com category "utility".
// Usado apenas para comunicações transacionais. Nunca faz fallback para template.
// ---------------------------------------------------------------------------

export type DirectUtilityInput = {
  phoneNumberId: string;
  accessToken: string;
  graphVersion?: string;
  to: string;
  text: string;
  bizOpaqueCallbackData?: string | null;
  signal?: AbortSignal;
  /** Formato interativo (cabeçalho/botões). Ausente = texto simples. */
  directConfig?: import("@/lib/direct-send").DirectConfig | null;
  /** id da mídia já enviada à Meta (obrigatório com cabeçalho imagem/vídeo). */
  mediaId?: string | null;
};

/**
 * Upload oficial de mídia: POST /{phone-number-id}/media (multipart).
 * Retorna o id da mídia (válido por 30 dias) ou o erro real da Meta.
 */
export async function uploadMediaToMeta(input: {
  phoneNumberId: string;
  accessToken: string;
  file: Blob;
  mime: string;
  filename: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string; code?: string; raw?: any }> {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", input.mime);
  form.append("file", new Blob([await input.file.arrayBuffer()], { type: input.mime }), input.filename);
  try {
    const res = await fetchWithTimeout(
      `https://graph.facebook.com/${GRAPH_VERSION}/${input.phoneNumberId}/media`,
      { method: "POST", headers: { Authorization: `Bearer ${input.accessToken}` }, body: form },
      60000,
    );
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || !json?.id) {
      const err = json?.error;
      const details = err?.error_data?.details;
      const msg = err?.message ?? `HTTP ${res.status}`;
      return { ok: false, error: details ? `${msg} — ${details}` : msg, code: err?.code ? String(err.code) : String(res.status), raw: json };
    }
    return { ok: true, id: String(json.id) };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Falha no upload da mídia", code: "network_error" };
  }
}

/**
 * Diagnóstico: GET /{media-id} com o mesmo token. Confirma se a Meta reconhece o id
 * (mime, tamanho, phone_number_id dono). Não devolve a URL (é temporária e autenticada).
 */
export async function inspectMetaMediaId(mediaId: string, accessToken: string, phoneNumberId: string) {
  try {
    const res = await fetchWithTimeout(
      `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(mediaId)}?phone_number_id=${encodeURIComponent(phoneNumberId)}`,
      { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } },
      15000,
    );
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) return { recognized: false, http_status: res.status, error: json?.error?.message ?? `HTTP ${res.status}`, code: json?.error?.code ?? null };
    return { recognized: !!json?.id, http_status: res.status, id: json?.id ?? null, mime_type: json?.mime_type ?? null, file_size: json?.file_size ?? null, owner_phone_number_id: json?.phone_number_id ?? null, has_url: !!json?.url };
  } catch (e: any) {
    return { recognized: false, http_status: null, error: e?.message ?? "falha ao consultar a mídia" };
  }
}

/** Baixa a mídia do armazenamento interno e envia à Meta. */
export async function uploadStoredMediaToMeta(supabaseAdmin: any, input: {
  phoneNumberId: string; accessToken: string; mediaPath: string; mime: string;
}): Promise<({ ok: true; id: string } | { ok: false; error: string; code?: string; raw?: any }) & { bytes?: number }> {
  const { data, error } = await supabaseAdmin.storage.from("campaign-images").download(input.mediaPath);
  if (error || !data) return { ok: false as const, error: `Arquivo de mídia não encontrado: ${error?.message ?? input.mediaPath}`, code: "storage_missing" };
  const r = await uploadMediaToMeta({
    phoneNumberId: input.phoneNumberId,
    accessToken: input.accessToken,
    file: data,
    mime: input.mime,
    filename: input.mediaPath.split("/").pop() || "media",
  });
  return { ...r, bytes: (data as Blob).size };
}

/** Oculta o número do destinatário (mantém os 4 últimos dígitos). O token nunca entra no payload. */
export function redactDirectPayload(p: any) {
  if (!p) return p;
  const c = JSON.parse(JSON.stringify(p));
  if (typeof c.to === "string") c.to = c.to.replace(/\d(?=\d{4})/g, "•");
  return c;
}

export function buildDirectUtilityPayload(to: string, text: string, bizOpaque?: string | null) {
  const body: Record<string, any> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body: text },
    category: "utility",
  };
  if (bizOpaque) body.biz_opaque_callback_data = String(bizOpaque);
  return body;
}

/** Detecta resposta da Meta indicando que Direct Send não está habilitado para a conta. */
/**
 * Classifica erros específicos do Direct Send (doc oficial "Direct Send API reference"):
 *  - "not_enabled": code 100 com detalhe "requires Direct Send, which isn't enabled"
 *  - "blocked":     code 139200 (acesso bloqueado por classificação incorreta)
 *  - "rate_limited":code 131064 (limite de 24h por classificação incorreta — temporário)
 */
export function classifyDirectSendError(result: { ok: boolean; error?: string; code?: string; raw?: any }):
  | "not_enabled" | "blocked" | "rate_limited" | null {
  if (result.ok) return null;
  const err = (result as any).raw?.error;
  const code = String(err?.code ?? result.code ?? "");
  if (code === "131064") return "rate_limited";
  if (code === "139200") return "blocked";
  const txt = `${err?.message ?? ""} ${err?.error_data?.details ?? ""} ${result.error ?? ""}`.toLowerCase();
  if (code === "100" && /direct[\s_-]?send/.test(txt)) return "not_enabled";
  if (/requires direct send|direct send isn.?t enabled/.test(txt)) return "not_enabled";
  return null;
}

/** Erros que impedem continuar a demanda (conta não habilitada ou bloqueada). */
export function isDirectSendNotEnabled(result: { ok: boolean; error?: string; code?: string; raw?: any }) {
  const c = classifyDirectSendError(result);
  return c === "not_enabled" || c === "blocked";
}

export async function sendDirectUtilityText(input: DirectUtilityInput): Promise<WaSendResult & { payload: any }> {
  const ver = GRAPH_VERSION;
  const url = `https://graph.facebook.com/${ver}/${input.phoneNumberId}/messages`;
  // Mesma função de montagem usada pela prévia/validação: nunca descarta cabeçalho, rodapé e botões.
  const requestStartedAt = new Date().toISOString();
  let payload: any;
  try {
    const { buildDirectPayload } = await import("@/lib/direct-send");
    payload = buildDirectPayload(input.to, input.text, input.directConfig ?? null, {
      mediaId: input.mediaId ?? null,
      bizOpaque: input.bizOpaqueCallbackData ?? null,
    });
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Falha ao montar a mensagem", code: "payload_build", requestStartedAt, responseReceivedAt: new Date().toISOString(), payload: null };
  }
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.accessToken}` },
        body: JSON.stringify(payload),
      },
      META_SEND_TIMEOUT_MS,
      input.signal,
    );
    const json: any = await res.json().catch(() => ({}));
    const responseReceivedAt = new Date().toISOString();
    if (!res.ok) {
      const err = json?.error;
      const details = err?.error_data?.details;
      const baseMsg = err?.message ?? `HTTP ${res.status}`;
      return { ok: false, error: details ? `${baseMsg} — ${details}` : baseMsg, code: err?.code ? String(err.code) : String(res.status), raw: json, httpStatus: res.status, requestStartedAt, responseReceivedAt, payload };
    }
    const msg = json?.messages?.[0];
    if (!msg?.id) return { ok: false, error: "No message id returned", raw: json, httpStatus: res.status, requestStartedAt, responseReceivedAt, payload };
    return { ok: true, metaMessageId: msg.id, messageStatus: msg?.message_status ?? null, wamid: msg.id, raw: json, httpStatus: res.status, requestStartedAt, responseReceivedAt, payload };
  } catch (e: any) {
    const egress = e?.source === "egress";
    const aborted = e?.name === "AbortError" || e?.code === "egress_timeout";
    const cancelled = e?.code === "egress_cancelled" || (aborted && input.signal?.aborted === true);
    return {
      ok: false,
      error: cancelled ? "Envio cancelado pelo circuit breaker" : egress ? `Falha na saída de rede (${e.code}): ${e.message}` : aborted ? `Meta Graph timeout após ${META_SEND_TIMEOUT_MS}ms` : (e?.message ?? "Network error"),
      code: cancelled ? "cancelled" : egress ? String(e.code ?? "egress_unavailable") : "network_error",
      requestStartedAt,
      responseReceivedAt: new Date().toISOString(),
      payload,
    };
  }
}

/** Renderiza {nome} / {{nome}} e {telefone} no texto do Direct Send. */
export function renderDirectText(text: string, vars: { nome?: string | null; telefone?: string | null }) {
  const nome = (vars.nome ?? "").trim() || "cliente";
  return text
    .replace(/\{\{\s*nome\s*\}\}|\{\s*nome\s*\}/gi, nome)
    .replace(/\{\{\s*telefone\s*\}\}|\{\s*telefone\s*\}/gi, vars.telefone ?? "");
}

/**
 * Garante o id de mídia da Meta para o cabeçalho de uma demanda Direct Send.
 * Reaproveita o id salvo em direct_config.media_ids enquanto tiver menos de 25 dias
 * (a Meta mantém a mídia por 30 dias); senão refaz o upload oficial.
 */
export async function resolveCampaignDirectMediaId(supabaseAdmin: any, input: {
  campaignId: string; directConfig: any; phoneNumberId: string; accessToken: string;
}): Promise<{ ok: true; id: string | null } | { ok: false; error: string; code?: string; raw?: any }> {
  const cfg = input.directConfig;
  if (!cfg || cfg.buttons_type === "none" || (cfg.header_type !== "image" && cfg.header_type !== "video")) return { ok: true, id: null };
  const cached = cfg.media_ids?.[input.phoneNumberId];
  if (cached?.id && (!(cached as any).path || (cached as any).path === cfg.media_path) && Date.now() - new Date(cached.uploaded_at).getTime() < 25 * 86400_000) return { ok: true, id: cached.id };
  if (!cfg.media_path || !cfg.media_mime) return { ok: false, error: "Mídia do cabeçalho ausente na demanda." };
  const up = await uploadStoredMediaToMeta(supabaseAdmin, {
    phoneNumberId: input.phoneNumberId, accessToken: input.accessToken, mediaPath: cfg.media_path, mime: cfg.media_mime,
  });
  if (!up.ok) return up;
  const media_ids = { ...(cfg.media_ids ?? {}), [input.phoneNumberId]: { id: up.id, uploaded_at: new Date().toISOString(), path: cfg.media_path } };
  cfg.media_ids = media_ids;
  await supabaseAdmin.from("wa_campaigns").update({ direct_config: { ...cfg, media_ids } }).eq("id", input.campaignId);
  return { ok: true, id: up.id };
}
