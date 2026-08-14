/**
 * Verificação de restrições de BM/WABA na Meta (server-only).
 *
 * Consulta a Graph API e grava em `whatsapp_wabas` o estado real da conta:
 * análise da conta, verificação do negócio, status e health_status agregado.
 * Assim o painel deixa de mostrar "normal/dispara" para contas restritas.
 */

import { resolveGraphVersion } from "@/lib/meta/graph-version";
import { metaEgressFetch } from "@/lib/meta/meta-egress";
import { loadWabaToken } from "@/lib/meta/wa-waba-token.server";

export type RestrictionLevel = "none" | "limited" | "restricted" | "unknown";

export type WabaRestriction = {
  waba_ref_id: string;
  waba_id: string | null;
  nome_interno: string | null;
  business_id: string | null;
  level: RestrictionLevel;
  reason: string | null;
  account_review_status: string | null;
  business_verification_status: string | null;
  meta_status: string | null;
  ban_state: string | null;
  restrictions: Array<{ type: string; detail: string; level: RestrictionLevel }>;
};

async function graph(path: string, token: string, version: string) {
  const r = await metaEgressFetch(`https://graph.facebook.com/${version}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeoutMs: 20_000,
  });
  const j: any = await r.json().catch(() => ({}));
  return { ok: r.ok && !j?.error, json: j, error: j?.error?.message ?? (r.ok ? null : `HTTP ${r.status}`) };
}

const worst = (a: RestrictionLevel, b: RestrictionLevel): RestrictionLevel => {
  const rank: Record<RestrictionLevel, number> = { none: 0, unknown: 1, limited: 2, restricted: 3 };
  return rank[a] >= rank[b] ? a : b;
};

/** Consulta a Meta e grava o estado de restrição de uma WABA. */
export async function checkWabaRestrictions(db: any, waba: any): Promise<WabaRestriction> {
  const out: WabaRestriction = {
    waba_ref_id: waba.id,
    waba_id: waba.waba_id ?? null,
    nome_interno: waba.nome_interno ?? null,
    business_id: waba.business_id ?? null,
    level: "unknown",
    reason: null,
    account_review_status: null,
    business_verification_status: null,
    meta_status: null,
    ban_state: null,
    restrictions: [],
  };

  const version = resolveGraphVersion(null);
  const token =
    (waba.access_token as string | null) ||
    (await loadWabaToken(db, { waba_ref_id: waba.id, waba_id: waba.waba_id })) ||
    process.env["WHATSAPP_ACCESS_TOKEN"] ||
    null;

  if (!waba.waba_id) {
    out.reason = "WABA sem waba_id cadastrado — não é possível verificar na Meta.";
    await persist(db, out);
    return out;
  }
  if (!token) {
    out.reason = "Sem token disponível para consultar esta WABA na Meta.";
    await persist(db, out);
    return out;
  }

  const fields =
    "id,name,account_review_status,business_verification_status,status,health_status,owner_business_info";
  let res = await graph(`${waba.waba_id}?fields=${fields}`, token, version);
  if (!res.ok) {
    // Alguns campos não existem em todas as versões/contas — tenta o mínimo.
    res = await graph(
      `${waba.waba_id}?fields=id,name,account_review_status,business_verification_status`,
      token,
      version,
    );
  }

  if (!res.ok) {
    out.level = "restricted";
    out.reason = `Sem acesso à WABA na Meta: ${res.error}`;
    out.restrictions.push({ type: "acesso", detail: out.reason, level: "restricted" });
    await persist(db, out);
    return out;
  }

  const j = res.json ?? {};
  out.account_review_status = j.account_review_status ?? null;
  out.business_verification_status = j.business_verification_status ?? null;
  out.meta_status = j.status ?? null;

  let level: RestrictionLevel = "none";

  const review = String(out.account_review_status ?? "").toUpperCase();
  if (review && !["APPROVED", "VERIFIED"].includes(review)) {
    const l: RestrictionLevel = review === "REJECTED" ? "restricted" : "limited";
    level = worst(level, l);
    out.restrictions.push({ type: "análise da conta", detail: `account_review_status=${review}`, level: l });
  }

  const bv = String(out.business_verification_status ?? "").toUpperCase();
  if (bv && !["VERIFIED", "APPROVED"].includes(bv)) {
    level = worst(level, "limited");
    out.restrictions.push({
      type: "verificação do negócio",
      detail: `business_verification_status=${bv}`,
      level: "limited",
    });
  }

  const st = String(out.meta_status ?? "").toUpperCase();
  if (st && !["ACTIVE", "APPROVED", "CONNECTED"].includes(st)) {
    const l: RestrictionLevel = ["BANNED", "DISABLED", "RESTRICTED"].includes(st) ? "restricted" : "limited";
    out.ban_state = st;
    level = worst(level, l);
    out.restrictions.push({ type: "status da conta", detail: `status=${st}`, level: l });
  }

  const health = j.health_status;
  const entities: any[] = Array.isArray(health?.entities) ? health.entities : [];
  const wabaEntity = entities.find((e) => String(e?.entity_type ?? "").toUpperCase() === "WABA") ?? entities[0];
  const canSend = String(health?.can_send_message ?? wabaEntity?.can_send_message ?? "").toUpperCase();
  if (canSend && canSend !== "AVAILABLE") {
    const l: RestrictionLevel = canSend === "BLOCKED" ? "restricted" : "limited";
    const msg =
      wabaEntity?.errors?.[0]?.error_description ||
      wabaEntity?.additional_info?.[0] ||
      `health_status=${canSend}`;
    level = worst(level, l);
    out.restrictions.push({ type: "health_status", detail: String(msg), level: l });
  }

  out.level = level;
  out.reason = out.restrictions.length
    ? out.restrictions.map((r) => `${r.type}: ${r.detail}`).join(" · ")
    : null;

  await persist(db, out);
  return out;
}

async function persist(db: any, r: WabaRestriction) {
  await db
    .from("whatsapp_wabas")
    .update({
      account_review_status: r.account_review_status,
      business_verification_status: r.business_verification_status,
      meta_status: r.meta_status,
      ban_state: r.ban_state,
      restriction_level: r.level,
      restriction_reason: r.reason,
      restrictions: r.restrictions,
      restriction_checked_at: new Date().toISOString(),
    })
    .eq("id", r.waba_ref_id);
}
