// Server-only helper for Meta Graph API (WhatsApp Business Platform).
// Import ONLY inside .handler() bodies via: const { ... } = await import("@/lib/wa-meta.server");

import { GRAPH_BASE as GRAPH } from "@/lib/meta/graph-version";

export type MetaError = {
  ok: false;
  error: string;
  code?: string;
  raw?: any;
  httpStatus?: number;
};
export type MetaOk<T> = { ok: true; data: T; raw: any };

function humanizeMetaError(json: any, status: number): { error: string; code?: string } {
  const err = json?.error;
  const code = err?.code ? String(err.code) : String(status);
  const sub = err?.error_subcode ? ` (subcode ${err.error_subcode})` : "";
  const msg: string = err?.message ?? `HTTP ${status}`;

  if (code === "190") return { code, error: "Token de acesso inválido ou expirado. Substitua o WHATSAPP_ACCESS_TOKEN nas configurações." };
  if (code === "10" || code === "200") return { code, error: "Token sem permissão para essa WABA. Verifique escopos e permissões do System User." };
  if (/already exists/i.test(msg)) return { code, error: "Já existe um template com esse nome nessa WABA." };
  if (/name.*invalid/i.test(msg)) return { code, error: "Nome de template inválido. Use letras minúsculas, números e underscore." };
  if (/category/i.test(msg)) return { code, error: "Categoria inválida. Use MARKETING, UTILITY ou AUTHENTICATION." };
  if (/example/i.test(msg)) return { code, error: "Variável sem exemplo. Preencha as amostras (variables_examples) para todas as variáveis do corpo/URL." };
  if (/button/i.test(msg)) return { code, error: `Botão inválido: ${msg}${sub}` };
  if (/media/i.test(msg) || /header.*url/i.test(msg)) return { code, error: `Mídia do cabeçalho inválida: ${msg}${sub}` };
  return { code, error: `${msg}${sub}` };
}

async function metaFetch(path: string, init: RequestInit, tokenOverride?: string | null): Promise<Response> {
  const token = tokenOverride || process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new Error("WHATSAPP_ACCESS_TOKEN não configurado.");
  return fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
}

const POSITIONAL_RE = /\{\{\s*\d+\s*\}\}/g;
const NAMED_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/g;

function namedParams(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(NAMED_RE)) {
    const n = m[1];
    if (/^\d+$/.test(n)) continue;
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

function examplesFor(variables_examples: any, section: string): any[] {
  return Array.isArray(variables_examples)
    ? (variables_examples as any[]).find((e: any) => e?.section === section)?.values ?? []
    : [];
}

/**
 * Monta os components no formato da API de Modelos de Mensagens.
 * Suporta variáveis posicionais ({{1}}) e nomeadas ({{nome_do_param}}).
 * Retorna também o parameter_format detectado.
 */
export function buildTemplateComponents(t: {
  header_type?: string | null;
  header_text?: string | null;
  header_media_url?: string | null;
  body: string;
  footer?: string | null;
  buttons?: any;
  variables_examples?: any;
}): any[] & { parameterFormat?: "NAMED" | "POSITIONAL" } {
  const components: any[] = [];
  const ht = (t.header_type || "").toLowerCase();

  const bodyNamed = namedParams(t.body || "");
  const usesNamed = bodyNamed.length > 0;

  if (ht === "text" && t.header_text) {
    const headerComp: any = { type: "HEADER", format: "TEXT", text: t.header_text };
    const headerExamples = examplesFor(t.variables_examples, "header");
    const hNamed = namedParams(t.header_text);
    const hPos = (t.header_text.match(POSITIONAL_RE) || []).length;
    if (hNamed.length > 0) {
      headerComp.example = {
        header_text_named_params: hNamed.map((param_name, i) => ({
          param_name,
          example: String(headerExamples[i] ?? param_name),
        })),
      };
    } else if (hPos > 0) {
      headerComp.example = { header_text: headerExamples.slice(0, hPos) };
    }
    components.push(headerComp);
  } else if (["image", "video", "document"].includes(ht) && t.header_media_url) {
    components.push({
      type: "HEADER",
      format: ht.toUpperCase(),
      example: { header_handle: [t.header_media_url] },
    });
  } else if (ht === "location") {
    components.push({ type: "HEADER", format: "LOCATION" });
  }

  const bodyComp: any = { type: "BODY", text: t.body };
  const bodyExamples = examplesFor(t.variables_examples, "body");
  if (usesNamed) {
    if (bodyExamples.length < bodyNamed.length) {
      throw new Error(`Preencha ${bodyNamed.length} exemplo(s) para as variáveis do corpo (${bodyNamed.join(", ")}).`);
    }
    bodyComp.example = {
      body_text_named_params: bodyNamed.map((param_name, i) => ({
        param_name,
        example: String(bodyExamples[i]),
      })),
    };
  } else {
    const bVars = (t.body.match(POSITIONAL_RE) || []).length;
    if (bVars > 0) {
      if (bodyExamples.length < bVars) {
        throw new Error(`Preencha ${bVars} exemplo(s) para as variáveis do corpo.`);
      }
      bodyComp.example = { body_text: [bodyExamples.slice(0, bVars)] };
    }
  }
  components.push(bodyComp);

  if (t.footer) components.push({ type: "FOOTER", text: t.footer });

  const btns = Array.isArray(t.buttons) ? t.buttons : [];
  if (btns.length) {
    if (btns.length > 10) throw new Error("Máximo de 10 botões por template.");
    components.push({
      type: "BUTTONS",
      buttons: btns.slice(0, 10).map((b: any) => {
        const type = (b.type || "").toUpperCase();
        if (type === "URL") {
          const btn: any = { type: "URL", text: b.text, url: b.url };
          const url = String(b.url || "");
          if ((POSITIONAL_RE.test(url) || namedParams(url).length > 0) && b.example) btn.example = [b.example];
          POSITIONAL_RE.lastIndex = 0;
          return btn;
        }
        if (type === "PHONE_NUMBER") return { type: "PHONE_NUMBER", text: b.text, phone_number: b.phone_number };
        if (type === "COPY_CODE") {
          const btn: any = { type: "COPY_CODE" };
          if (b.example) btn.example = [b.example];
          return btn;
        }
        if (type === "VOICE_CALL" || type === "CALL_REQUEST") {
          return { type: "VOICE_CALL", text: b.text };
        }
        return { type: "QUICK_REPLY", text: b.text };
      }),
    });
  }

  const result = components as any;
  result.parameterFormat = usesNamed ? "NAMED" : "POSITIONAL";
  return result;
}

export async function submitTemplateToMeta(input: {
  wabaId: string;
  name: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  language: string;
  components: any[];
  parameterFormat?: "NAMED" | "POSITIONAL" | null;
  allowCategoryChange?: boolean;
  accessToken?: string | null;
}): Promise<MetaOk<{ id: string; status: string; category: string }> | MetaError> {
  const payload: any = {
    name: input.name,
    category: input.category,
    language: input.language,
    components: input.components,
    allow_category_change: input.allowCategoryChange !== false,
  };
  const fmt = input.parameterFormat ?? (input.components as any)?.parameterFormat;
  if (fmt) payload.parameter_format = fmt;

  const res = await metaFetch(
    `/${input.wabaId}/message_templates`,
    { method: "POST", body: JSON.stringify(payload) },
    input.accessToken,
  );
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, ...humanizeMetaError(json, res.status), raw: json, httpStatus: res.status };
  return { ok: true, data: { id: json.id, status: json.status, category: json.category }, raw: json };
}


export async function fetchTemplateStatusFromMeta(input: {
  wabaId: string;
  name: string;
  language: string;
  accessToken?: string | null;
}): Promise<MetaOk<any> | MetaError> {
  const url = `/${input.wabaId}/message_templates?name=${encodeURIComponent(input.name)}&limit=50`;
  const res = await metaFetch(url, { method: "GET" }, input.accessToken);

  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, ...humanizeMetaError(json, res.status), raw: json, httpStatus: res.status };
  const match = (json.data || []).find((t: any) => t.name === input.name && t.language === input.language);
  if (!match) return { ok: false, error: "Template não encontrado nessa WABA/idioma.", raw: json, httpStatus: 404 };
  return { ok: true, data: match, raw: json };
}

/**
 * Limite de mensagens do Portfólio Empresarial/BM.
 * A Meta aplica o limite no nível do portfólio (não por número) e o expõe
 * no objeto da WABA via `whatsapp_business_manager_messaging_limit`.
 * O antigo `messaging_limit_tier` do phone_number está descontinuado.
 */
export async function fetchWabaMessagingLimit(
  wabaId: string,
  tokenOverride?: string | null,
): Promise<string | null> {
  try {
    const res = await metaFetch(
      `/${wabaId}?fields=id,name,whatsapp_business_manager_messaging_limit`,
      { method: "GET" },
      tokenOverride,
    );
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    return json?.whatsapp_business_manager_messaging_limit ?? null;
  } catch {
    return null;
  }
}

export async function fetchWabaPhoneNumbers(wabaId: string, tokenOverride?: string | null) {
  const res = await metaFetch(
    `/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,status,name_status`,
    { method: "GET" },
    tokenOverride,
  );
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const h = humanizeMetaError(json, res.status);
    throw new Error(h.error);
  }
  const list = (json.data ?? []) as any[];

  // O limite é compartilhado pelo portfólio: consulta uma vez na WABA e
  // aplica a todos os números dela.
  const tier = await fetchWabaMessagingLimit(wabaId, tokenOverride);
  if (tier) for (const n of list) n.messaging_limit_tier = tier;

  return list;
}


// ── Token diagnostics ────────────────────────────────────────────────────────
export async function debugAccessToken(tokenOverride?: string | null): Promise<
  MetaOk<{ app_id?: string; user_id?: string; type?: string; expires_at?: number; is_valid?: boolean; scopes: string[] }>
  | MetaError
> {
  const token = tokenOverride || process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) return { ok: false, error: "WHATSAPP_ACCESS_TOKEN não configurado." };
  const appToken = process.env.META_APP_ID && process.env.META_APP_SECRET
    ? `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`
    : token;
  const url = `${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`;
  const res = await fetch(url, { method: "GET" });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, ...humanizeMetaError(json, res.status), raw: json, httpStatus: res.status };
  const d = json?.data ?? {};
  return {
    ok: true,
    raw: json,
    data: {
      app_id: d.app_id,
      user_id: d.user_id,
      type: d.type,
      expires_at: d.expires_at,
      is_valid: d.is_valid,
      scopes: Array.isArray(d.scopes) ? d.scopes : [],
    },
  };
}

export async function listOwnedWabas(businessId: string, tokenOverride?: string | null) {
  const url = `/${businessId}/owned_whatsapp_business_accounts?fields=id,name,timezone_id,message_template_namespace,currency,account_review_status,whatsapp_business_manager_messaging_limit`;
  const res = await metaFetch(url, { method: "GET" }, tokenOverride);
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const h = humanizeMetaError(json, res.status);
    throw new Error(h.error);
  }
  return (json.data ?? []) as any[];
}

export async function createWabaOnMeta(input: {
  businessId: string;
  name: string;
  timezoneId?: string;
  currency?: string;
  tokenOverride?: string | null;
}): Promise<MetaOk<{ id: string }> | MetaError> {
  const body: any = { name: input.name };
  if (input.timezoneId) body.timezone_id = input.timezoneId;
  if (input.currency) body.currency = input.currency;
  const res = await metaFetch(`/${input.businessId}/whatsapp_business_accounts`, {
    method: "POST", body: JSON.stringify(body),
  }, input.tokenOverride);
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, ...humanizeMetaError(json, res.status), raw: json, httpStatus: res.status };
  return { ok: true, data: { id: json.id }, raw: json };
}

export async function addPhoneToWaba(input: {
  wabaId: string;
  cc: string;
  phone_number: string;
  verified_name: string;
  tokenOverride?: string | null;
}): Promise<MetaOk<{ id: string }> | MetaError> {
  const res = await metaFetch(`/${input.wabaId}/phone_numbers`, {
    method: "POST",
    body: JSON.stringify({ cc: input.cc, phone_number: input.phone_number, verified_name: input.verified_name }),
  }, input.tokenOverride);
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, ...humanizeMetaError(json, res.status), raw: json, httpStatus: res.status };
  return { ok: true, data: { id: json.id }, raw: json };
}

export async function requestPhoneCode(input: {
  phoneNumberId: string;
  code_method: "SMS" | "VOICE";
  language?: string;
  tokenOverride?: string | null;
}): Promise<MetaOk<any> | MetaError> {
  const locale = input.language ?? "pt_BR";
  const res = await metaFetch(`/${input.phoneNumberId}/request_code`, {
    method: "POST",
    // A Graph aceita `language`; versões recentes documentam `locale`. Enviamos ambos.
    body: JSON.stringify({ code_method: input.code_method, language: locale, locale }),
  }, input.tokenOverride);
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, ...humanizeMetaError(json, res.status), raw: json, httpStatus: res.status };
  return { ok: true, data: json, raw: json };
}

/** POST /{WABA_ID}/subscribed_apps — assina o app aos webhooks da WABA. */
export async function subscribeWabaApps(input: {
  wabaId: string; tokenOverride?: string | null;
}): Promise<MetaOk<any> | MetaError> {
  const res = await metaFetch(`/${input.wabaId}/subscribed_apps`, { method: "POST" }, input.tokenOverride);
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, ...humanizeMetaError(json, res.status), raw: json, httpStatus: res.status };
  return { ok: true, data: json, raw: json };
}

/** GET /{WABA_ID}/phone_numbers — lista números da WABA com status de verificação. */
export async function listWabaPhoneNumbers(input: {
  wabaId: string; tokenOverride?: string | null;
}): Promise<MetaOk<any[]> | MetaError> {
  const fields = "id,display_phone_number,verified_name,code_verification_status,platform_type,quality_rating,status";
  const res = await metaFetch(`/${input.wabaId}/phone_numbers?limit=100&fields=${fields}`, { method: "GET" }, input.tokenOverride);
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, ...humanizeMetaError(json, res.status), raw: json, httpStatus: res.status };
  return { ok: true, data: Array.isArray(json?.data) ? json.data : [], raw: json };
}


export async function verifyPhoneCode(input: {
  phoneNumberId: string; code: string; tokenOverride?: string | null;
}): Promise<MetaOk<any> | MetaError> {
  const res = await metaFetch(`/${input.phoneNumberId}/verify_code`, {
    method: "POST", body: JSON.stringify({ code: input.code }),
  }, input.tokenOverride);
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, ...humanizeMetaError(json, res.status), raw: json, httpStatus: res.status };
  return { ok: true, data: json, raw: json };
}

export async function registerPhone(input: {
  phoneNumberId: string; pin: string; tokenOverride?: string | null;
}): Promise<MetaOk<any> | MetaError> {
  const res = await metaFetch(`/${input.phoneNumberId}/register`, {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", pin: input.pin }),
  }, input.tokenOverride);
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, ...humanizeMetaError(json, res.status), raw: json, httpStatus: res.status };
  return { ok: true, data: json, raw: json };
}
