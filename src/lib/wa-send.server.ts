// Server-only helper for sending official WhatsApp Cloud API messages.
// Never import this from a route or *.functions.ts module scope.
// Always: const { sendTemplateMessage } = await import("@/lib/wa-send.server");

export type WaSendButton = { index: number; urlParam: string };

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
};


export type WaSendResult =
  | { ok: true; metaMessageId: string; messageStatus: string | null; wamid: string | null; raw: any; httpStatus: number }
  | { ok: false; error: string; code?: string; raw?: any; httpStatus?: number };


function buildBodyComponents(variables?: Record<string, string>) {
  if (!variables) return [];
  // Ignore reserved meta keys (e.g. _header_image_url) and non-numeric keys.
  const keys = Object.keys(variables)
    .filter((k) => /^\d+$/.test(k))
    .sort((a, b) => Number(a) - Number(b));
  if (!keys.length) return [];
  return [
    {
      type: "body",
      parameters: keys.map((k) => ({ type: "text", text: String(variables[k] ?? "") })),
    },
  ];
}

function buildHeaderComponent(headerType?: string | null, value?: string | null) {
  if (!headerType || !value) return [];
  const t = headerType.toLowerCase();
  if (t === "text") {
    return [{ type: "header", parameters: [{ type: "text", text: value }] }];
  }
  if (t === "image") return [{ type: "header", parameters: [{ type: "image", image: { link: value } }] }];
  if (t === "video") return [{ type: "header", parameters: [{ type: "video", video: { link: value } }] }];
  if (t === "document")
    return [{ type: "header", parameters: [{ type: "document", document: { link: value } }] }];
  return [];
}

function buildButtonComponents(urlParam?: string | null, index = 0) {
  if (!urlParam) return [];
  return [{
    type: "button",
    sub_type: "url",
    index: String(index),
    parameters: [{ type: "text", text: urlParam }],
  }];
}

export async function sendTemplateMessage(input: WaSendInput): Promise<WaSendResult> {
  const ver = input.graphVersion || "v21.0";
  const url = `https://graph.facebook.com/${ver}/${input.phoneNumberId}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to: input.to,
    type: "template",
    template: {
      name: input.templateName,
      language: { code: input.languageCode },
      components: [
        ...buildHeaderComponent(input.headerType, input.headerValue),
        ...buildBodyComponents(input.variables),
        ...buildButtonComponents(input.buttonUrlParam, input.buttonIndex ?? 0),
      ],
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.accessToken}`,
      },
      body: JSON.stringify(body),
    });
    const json: any = await res.json().catch(() => ({}));
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
      };
    }
    const msg = json?.messages?.[0];
    const id = msg?.id;
    const messageStatus: string | null = msg?.message_status ?? null;
    const wamid: string | null = id ?? null;
    if (!id) return { ok: false, error: "No message id returned", raw: json, httpStatus: res.status };
    return { ok: true, metaMessageId: id, messageStatus, wamid, raw: json, httpStatus: res.status };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Network error", code: "network_error" };
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
    const res = await fetch(url, {
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
    return { ok: false, error: e?.message ?? "Network error", requestPayload: payload };
  }
}

