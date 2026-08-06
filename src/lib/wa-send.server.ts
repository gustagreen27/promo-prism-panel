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
};



export type WaSendResult =
  | { ok: true; metaMessageId: string; messageStatus: string | null; wamid: string | null; raw: any; httpStatus: number; requestStartedAt: string; responseReceivedAt: string }
  | { ok: false; error: string; code?: string; raw?: any; httpStatus?: number; requestStartedAt: string; responseReceivedAt: string };

const META_SEND_TIMEOUT_MS = 8000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = META_SEND_TIMEOUT_MS,
  external?: AbortSignal,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort(new Error("cancelled"));
  if (external) {
    if (external.aborted) controller.abort(new Error("cancelled"));
    else external.addEventListener("abort", onExternalAbort, { once: true });
  }
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", onExternalAbort);
  }
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
  const ver = input.graphVersion || "v21.0";
  const url = `https://graph.facebook.com/${ver}/${input.phoneNumberId}/messages`;
  const body: Record<string, any> = {
    messaging_product: "whatsapp",
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
    const aborted = e?.name === "AbortError";
    // Cancelamento externo (circuit breaker) ≠ timeout: não conta como falha
    // do destinatário, ele volta para a fila sem consumir tentativa.
    const cancelled = aborted && input.signal?.aborted === true;
    return {
      ok: false,
      error: cancelled
        ? "Envio cancelado pelo circuit breaker (conta bloqueada)"
        : aborted
          ? `Meta Graph timeout após ${META_SEND_TIMEOUT_MS}ms`
          : (e?.message ?? "Network error"),
      code: cancelled ? "cancelled" : "network_error",
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
  const ver = opts.graphVersion || "v21.0";
  const url = `https://graph.facebook.com/${ver}/${opts.wabaId}/message_templates?limit=200`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${opts.accessToken}` } });
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
  const ver = input.graphVersion || "v25.0";
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
    const timedOut = e?.name === "AbortError";
    return {
      ok: false,
      error: timedOut ? `Meta Graph timeout após ${META_SEND_TIMEOUT_MS}ms` : (e?.message ?? "Network error"),
      code: "network_error",
      requestPayload: payload,
    };
  }
}

