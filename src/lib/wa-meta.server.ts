// Server-only helper for Meta Graph API (WhatsApp Business Platform).
// Import ONLY inside .handler() bodies via: const { ... } = await import("@/lib/wa-meta.server");

const GRAPH = "https://graph.facebook.com/v21.0";

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

// Build components payload from template row
export function buildTemplateComponents(t: {
  header_type?: string | null;
  header_text?: string | null;
  header_media_url?: string | null;
  body: string;
  footer?: string | null;
  buttons?: any;
  variables_examples?: any;
}) {
  const components: any[] = [];
  const ht = (t.header_type || "").toLowerCase();

  if (ht === "text" && t.header_text) {
    const headerComp: any = { type: "HEADER", format: "TEXT", text: t.header_text };
    const hVars = (t.header_text.match(/\{\{\d+\}\}/g) || []).length;
    if (hVars > 0) {
      const headerExamples = Array.isArray(t.variables_examples)
        ? (t.variables_examples as any[]).find((e: any) => e?.section === "header")?.values ?? []
        : [];
      headerComp.example = { header_text: headerExamples.slice(0, hVars) };
    }
    components.push(headerComp);
  } else if (["image", "video", "document"].includes(ht) && t.header_media_url) {
    components.push({
      type: "HEADER",
      format: ht.toUpperCase(),
      example: { header_handle: [t.header_media_url] },
    });
  }

  const bodyComp: any = { type: "BODY", text: t.body };
  const bVars = (t.body.match(/\{\{\d+\}\}/g) || []).length;
  if (bVars > 0) {
    const bodyExamples = Array.isArray(t.variables_examples)
      ? (t.variables_examples as any[]).find((e: any) => e?.section === "body")?.values ?? []
      : [];
    if (bodyExamples.length < bVars) {
      throw new Error(`Preencha ${bVars} exemplo(s) para as variáveis do corpo.`);
    }
    bodyComp.example = { body_text: [bodyExamples.slice(0, bVars)] };
  }
  components.push(bodyComp);

  if (t.footer) components.push({ type: "FOOTER", text: t.footer });

  const btns = Array.isArray(t.buttons) ? t.buttons : [];
  if (btns.length) {
    components.push({
      type: "BUTTONS",
      buttons: btns.map((b: any) => {
        const type = (b.type || "").toUpperCase();
        if (type === "URL") {
          const btn: any = { type: "URL", text: b.text, url: b.url };
          if ((b.url || "").includes("{{1}}") && b.example) btn.example = [b.example];
          return btn;
        }
        if (type === "PHONE_NUMBER") return { type: "PHONE_NUMBER", text: b.text, phone_number: b.phone_number };
        return { type: "QUICK_REPLY", text: b.text };
      }),
    });
  }
  return components;
}

export async function submitTemplateToMeta(input: {
  wabaId: string;
  name: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  language: string;
  components: any[];
}): Promise<MetaOk<{ id: string; status: string; category: string }> | MetaError> {
  const res = await metaFetch(`/${input.wabaId}/message_templates`, {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      category: input.category,
      language: input.language,
      components: input.components,
      allow_category_change: true,
    }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, ...humanizeMetaError(json, res.status), raw: json, httpStatus: res.status };
  return { ok: true, data: { id: json.id, status: json.status, category: json.category }, raw: json };
}

export async function fetchTemplateStatusFromMeta(input: {
  wabaId: string;
  name: string;
  language: string;
}): Promise<MetaOk<any> | MetaError> {
  const url = `/${input.wabaId}/message_templates?name=${encodeURIComponent(input.name)}&limit=50`;
  const res = await metaFetch(url, { method: "GET" });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, ...humanizeMetaError(json, res.status), raw: json, httpStatus: res.status };
  const match = (json.data || []).find((t: any) => t.name === input.name && t.language === input.language);
  if (!match) return { ok: false, error: "Template não encontrado nessa WABA/idioma.", raw: json, httpStatus: 404 };
  return { ok: true, data: match, raw: json };
}

export async function fetchWabaPhoneNumbers(wabaId: string, tokenOverride?: string | null) {
  const res = await metaFetch(
    `/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,messaging_limit_tier,code_verification_status,status,name_status`,
    { method: "GET" },
    tokenOverride,
  );
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const h = humanizeMetaError(json, res.status);
    throw new Error(h.error);
  }
  return (json.data ?? []) as any[];
}
