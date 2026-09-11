/**
 * API de Mensagens de Marketing do WhatsApp (MM Lite) — server-only.
 *
 * - Consulta `marketing_messages_onboarding_status` da WABA na Graph API
 *   e persiste em `whatsapp_wabas`.
 * - Decide se um envio de marketing deve usar o endpoint
 *   `/{PHONE_NUMBER_ID}/marketing_messages` em vez de `/messages`.
 *
 * Docs: developers.facebook.com/documentation/business-messaging/whatsapp/marketing-messages
 */
import { resolveGraphVersion } from "@/lib/meta/graph-version";
import { metaEgressFetch } from "@/lib/meta/meta-egress";
import { loadWabaToken } from "@/lib/meta/wa-waba-token.server";

export type MmLiteStatus =
  | "ELIGIBLE"
  | "ONBOARDED"
  | "NOT_ELIGIBLE"
  | "NOT_STARTED"
  | "UNKNOWN";

export type MmLiteCheck = {
  waba_ref_id: string;
  waba_id: string | null;
  nome_interno: string | null;
  status: MmLiteStatus;
  tos_status: string | null;
  reason: string | null;
  enabled: boolean;
};

async function graph(path: string, token: string, version: string) {
  const r = await metaEgressFetch(`https://graph.facebook.com/${version}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeoutMs: 20_000,
  });
  const j: any = await r.json().catch(() => ({}));
  return { ok: r.ok && !j?.error, json: j, error: j?.error?.message ?? (r.ok ? null : `HTTP ${r.status}`) };
}

function normalizeStatus(raw: any): { status: MmLiteStatus; tos: string | null } {
  // O campo pode vir como string ou como objeto { status, time }.
  if (raw == null) return { status: "UNKNOWN", tos: null };
  if (typeof raw === "string") {
    const s = raw.toUpperCase();
    if (["ELIGIBLE", "ONBOARDED", "NOT_ELIGIBLE", "NOT_STARTED"].includes(s)) {
      return { status: s as MmLiteStatus, tos: null };
    }
    return { status: "UNKNOWN", tos: s };
  }
  const inner = String(raw?.status ?? "").toUpperCase();
  if (inner === "TERM_OF_SERVICE_SIGNED") return { status: "ONBOARDED", tos: inner };
  if (inner === "REQUEST_SENT") return { status: "ELIGIBLE", tos: inner };
  if (inner === "NOT_STARTED") return { status: "NOT_STARTED", tos: inner };
  return { status: "UNKNOWN", tos: inner || null };
}

/** Consulta a Meta e grava o status de MM Lite de uma WABA. */
export async function checkMmLiteStatus(db: any, waba: any): Promise<MmLiteCheck> {
  const out: MmLiteCheck = {
    waba_ref_id: waba.id,
    waba_id: waba.waba_id ?? null,
    nome_interno: waba.nome_interno ?? null,
    status: "UNKNOWN",
    tos_status: null,
    reason: null,
    enabled: !!waba.mm_lite_enabled,
  };

  const version = resolveGraphVersion(null);
  const token =
    (waba.access_token as string | null) ||
    (await loadWabaToken(db, { waba_ref_id: waba.id, waba_id: waba.waba_id })) ||
    process.env["WHATSAPP_ACCESS_TOKEN"] ||
    null;

  if (!waba.waba_id) {
    out.reason = "WABA sem waba_id cadastrado.";
  } else if (!token) {
    out.reason = "Sem token disponível para consultar esta WABA na Meta.";
  } else {
    const res = await graph(
      `${waba.waba_id}?fields=marketing_messages_onboarding_status,owner_business_info`,
      token,
      version,
    );
    if (!res.ok) {
      out.reason = `Falha ao consultar a Meta: ${res.error}`;
    } else {
      const j = res.json ?? {};
      const primary = normalizeStatus(j.marketing_messages_onboarding_status);
      const owner = normalizeStatus(j?.owner_business_info?.marketing_messages_onboarding_status);
      out.status = primary.status !== "UNKNOWN" ? primary.status : owner.status;
      out.tos_status = primary.tos ?? owner.tos;
      if (out.status === "UNKNOWN") out.reason = "A Meta não retornou o status de MM Lite para esta WABA.";
    }
  }

  // Só mantém habilitado se a conta continuar integrada.
  const enabled = out.status === "ONBOARDED" ? out.enabled : false;
  out.enabled = enabled;

  await db
    .from("whatsapp_wabas")
    .update({
      mm_lite_status: out.status,
      mm_lite_tos_status: out.tos_status,
      mm_lite_reason: out.reason,
      mm_lite_enabled: enabled,
      mm_lite_checked_at: new Date().toISOString(),
    })
    .eq("id", waba.id);

  return out;
}

/** Marca a WABA como integrada quando chega o webhook de Termos assinados. */
export async function markMmLiteOnboarded(db: any, wabaId: string, adAccountId?: string | null) {
  const patch: Record<string, any> = {
    mm_lite_status: "ONBOARDED",
    mm_lite_tos_status: "TERM_OF_SERVICE_SIGNED",
    mm_lite_reason: null,
    mm_lite_checked_at: new Date().toISOString(),
  };
  if (adAccountId) patch.mm_lite_ad_account_id = String(adAccountId);
  await db.from("whatsapp_wabas").update(patch).eq("waba_id", String(wabaId));
}

/**
 * Decide se este envio deve sair pela MM Lite.
 * Regra: template de MARKETING + WABA integrada e habilitada no painel.
 */
export async function resolveMmLiteSend(
  db: any,
  conn: { waba_ref_id?: string | null; waba_id?: string | null },
  tpl: { category?: string | null },
): Promise<{ useMmLite: boolean; activitySharing: boolean | undefined }> {
  const category = String(tpl?.category ?? "").toUpperCase();
  if (category !== "MARKETING") return { useMmLite: false, activitySharing: undefined };

  let q = db.from("whatsapp_wabas").select("mm_lite_enabled,mm_lite_status,mm_lite_activity_sharing").limit(1);
  if (conn.waba_ref_id) q = q.eq("id", conn.waba_ref_id);
  else if (conn.waba_id) q = q.eq("waba_id", String(conn.waba_id));
  else return { useMmLite: false, activitySharing: undefined };

  const { data } = await q.maybeSingle();
  const ok = !!data?.mm_lite_enabled && String(data?.mm_lite_status ?? "") === "ONBOARDED";
  return {
    useMmLite: ok,
    activitySharing: ok ? data?.mm_lite_activity_sharing !== false : undefined,
  };
}
