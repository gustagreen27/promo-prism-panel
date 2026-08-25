/**
 * Serviço isolado de Gestão de Ativos Meta (server-only).
 *
 * Centraliza TODOS os endpoints e headers usados pela aba "Gestão de Ativos Meta".
 * Ajuste aqui (e somente aqui) caso a Meta mude rotas, versão ou autenticação.
 * Nenhum outro módulo do motor de disparo depende deste arquivo.
 */

import { GRAPH_BASE } from "@/lib/meta/graph-version";

export type MetaCreds = { business_id: string; access_token: string };

export const ASSET_SETTINGS_KEY = "meta_asset_manager";

/** Endpoints usados pela aba — editar aqui para trocar rotas. */
export const ENDPOINTS = {
  me: () => `/me?fields=id,name`,
  business: (businessId: string) => `/${businessId}?fields=id,name,verification_status`,
  listWabas: (businessId: string) =>
    `/${businessId}/client_whatsapp_business_accounts?fields=id,name,currency,account_review_status,timezone_id&limit=100`,
  ownedWabas: (businessId: string) =>
    `/${businessId}/owned_whatsapp_business_accounts?fields=id,name,currency,account_review_status,timezone_id&limit=100`,
  createWaba: (businessId: string) => `/${businessId}/whatsapp_business_accounts`,
  phoneNumbers: (wabaId: string) =>
    `/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type,throughput,status&limit=100`,
  addPhone: (wabaId: string) => `/${wabaId}/phone_numbers`,
  requestCode: (phoneNumberId: string) => `/${phoneNumberId}/request_code`,
  verifyCode: (phoneNumberId: string) => `/${phoneNumberId}/verify_code`,
  registerPhone: (phoneNumberId: string) => `/${phoneNumberId}/register`,
  templates: (wabaId: string) =>
    `/${wabaId}/message_templates?fields=id,name,status,category,language,rejected_reason,quality_score&limit=100`,
  createTemplate: (wabaId: string) => `/${wabaId}/message_templates`,
};

export type GraphResult<T = any> = { ok: true; data: T } | { ok: false; error: string; raw: any };

/** Header de autenticação — ponto único para trocar o esquema de auth. */
function authHeaders(token: string, json = false): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

export async function graph<T = any>(
  path: string,
  token: string,
  init: { method?: "GET" | "POST" | "DELETE"; body?: Record<string, unknown> } = {},
): Promise<GraphResult<T>> {
  const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
  const method = init.method ?? "GET";
  try {
    const { metaEgressFetch } = await import("@/lib/meta/meta-egress");
    const res = await metaEgressFetch(url, {
      method,
      headers: authHeaders(token, !!init.body),
      body: init.body ? JSON.stringify(init.body) : undefined,
      timeoutMs: 30_000,
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json?.error) {
      const e = json?.error ?? {};
      const parts = [
        e.error_user_title,
        e.error_user_msg || e.message || `HTTP ${res.status}`,
        e.code != null ? `(código ${e.code}${e.error_subcode ? `/${e.error_subcode}` : ""})` : null,
      ].filter(Boolean);
      return { ok: false, error: parts.join(" — "), raw: json };
    }
    return { ok: true, data: json as T };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Falha de rede ao chamar a Graph API", raw: null };
  }
}

/** Credenciais salvas em settings (key = meta_asset_manager). */
export async function loadCreds(db: any): Promise<MetaCreds | null> {
  const { data } = await db.from("settings").select("value").eq("key", ASSET_SETTINGS_KEY).maybeSingle();
  const v = (data?.value ?? null) as any;
  if (!v?.business_id || !v?.access_token) return null;
  return { business_id: String(v.business_id), access_token: String(v.access_token) };
}

export async function saveCreds(db: any, creds: MetaCreds) {
  const { data: existing } = await db.from("settings").select("id").eq("key", ASSET_SETTINGS_KEY).maybeSingle();
  if (existing) {
    const { error } = await db.from("settings").update({ value: creds }).eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await db.from("settings").insert({ key: ASSET_SETTINGS_KEY, value: creds });
    if (error) throw error;
  }
}

export function maskToken(token: string) {
  if (token.length <= 10) return "••••";
  return `${token.slice(0, 6)}••••${token.slice(-4)}`;
}
