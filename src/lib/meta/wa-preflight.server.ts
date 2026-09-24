/**
 * Pré-check obrigatório antes de liberar um disparo (server-only).
 *
 * Verifica, na Graph API e no banco:
 *  - número CONNECTED
 *  - quality_rating GREEN (YELLOW exige confirmação manual)
 *  - WABA/portfólio acessível pelo token
 *  - template aprovado e ativo
 *  - token e permissões válidos
 *  - limite de mensagens disponível (messaging_limit_tier x fila)
 *  - restrições conhecidas (health_status BLOCKED/LIMITED) como alerta operacional
 *
 * Veredito: "green" (autorizado) | "yellow" (confirmar) | "red" (configuração inválida).
 */

import { resolveGraphVersion } from "@/lib/meta/graph-version";
import { getHealthCached } from "@/lib/meta/wa-health.server";
import { metaEgressFetch } from "@/lib/meta/meta-egress";

export type PreflightCheck = {
  key: string;
  label: string;
  status: "ok" | "warn" | "fail";
  detail: string;
};

export type PreflightResult = {
  verdict: "green" | "yellow" | "red";
  headline: string;
  checks: PreflightCheck[];
  quality_rating: string | null;
  number_status: string | null;
  messaging_limit_tier: string | null;
  checked_at: string;
};

const TIER_LIMITS: Record<string, number> = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1000,
  TIER_2K: 2000,
  TIER_10K: 10000,
  TIER_100K: 100000,
  TIER_UNLIMITED: Number.POSITIVE_INFINITY,

  UNLIMITED: Number.POSITIVE_INFINITY,
};

async function graph(path: string, token: string, version: string) {
  const r = await metaEgressFetch(`https://graph.facebook.com/${version}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j: any = await r.json().catch(() => ({}));
  return { ok: r.ok && !j?.error, json: j, error: j?.error?.message ?? (r.ok ? null : `HTTP ${r.status}`) };
}

export async function runCampaignPreflight(
  db: any,
  campaignId: string,
): Promise<PreflightResult> {
  const { data: camp } = await db
    .from("wa_campaigns")
    .select("id, name, connection_id, template_id, total_recipients, fatal_locked, fatal_error_code, fatal_error_message, send_mode, direct_text")
    .eq("id", campaignId)
    .maybeSingle();
  if (!camp) throw new Error("Campanha não encontrada.");

  return runSelectionPreflight(db, {
    connection_id: camp.connection_id,
    template_id: camp.template_id,
    total_recipients: camp.total_recipients,
    fatal_locked: camp.fatal_locked,
    fatal_error_code: camp.fatal_error_code,
    fatal_error_message: camp.fatal_error_message,
    require_queue: true,
    direct_send: camp.send_mode === "direct_utility",
  });
}

/**
 * Mesmo pré-check, porém sobre uma seleção avulsa (número + template),
 * usado no wizard antes mesmo de a campanha existir.
 */
export async function runSelectionPreflight(
  db: any,
  opts: {
    connection_id: string | null;
    template_id: string | null;
    /** Direct Send — Utilidade: não exige template. */
    direct_send?: boolean;
    total_recipients?: number | null;
    fatal_locked?: boolean | null;
    fatal_error_code?: string | null;
    fatal_error_message?: string | null;
    require_queue?: boolean;
  },
): Promise<PreflightResult> {
  const checks: PreflightCheck[] = [];
  const checked_at = new Date().toISOString();
  const push = (c: PreflightCheck) => checks.push(c);

  const camp = {
    connection_id: opts.connection_id,
    template_id: opts.template_id,
    total_recipients: opts.total_recipients ?? 0,
  };

  let qualityRating: string | null = null;
  let numberStatus: string | null = null;
  let tier: string | null = null;

  const finish = (): PreflightResult => {
    const hasFail = checks.some((c) => c.status === "fail");
    const hasWarn = checks.some((c) => c.status === "warn");
    const verdict: PreflightResult["verdict"] = hasFail ? "red" : hasWarn ? "yellow" : "green";
    return {
      verdict,
      headline:
        verdict === "red"
          ? "⛔ Configuração incompleta — disparo bloqueado"
          : verdict === "yellow"
            ? "⚠️ Avisos da Meta — envio permitido"
            : "✅ Conta saudável — disparo autorizado",
      checks,
      quality_rating: qualityRating,
      number_status: numberStatus,
      messaging_limit_tier: tier,
      checked_at,
    };
  };

  if (opts.fatal_locked) {
    const restrictionOnly = ["131031", "131042"].includes(String(opts.fatal_error_code ?? ""));
    push({
      key: "fatal_lock",
      label: "Restrição crítica registrada",
      status: restrictionOnly ? "warn" : "fail",
      detail: restrictionOnly
        ? `Aviso registrado ${opts.fatal_error_code ?? ""}: ${opts.fatal_error_message ?? "restrição da conta na Meta"}. O disparo pode ser tentado normalmente.`
        : `Campanha travada por erro crítico ${opts.fatal_error_code ?? ""}: ${opts.fatal_error_message ?? "configuração inválida"}. Corrija a configuração antes de continuar.`,
    });
    if (!restrictionOnly) return finish();
  }

  if (!camp.connection_id || (!opts.direct_send && !camp.template_id)) {
    push({ key: "config", label: "Configuração", status: "fail", detail: "Selecione número e template antes de iniciar." });
    return finish();
  }
  if (opts.require_queue && !camp.total_recipients) {
    push({ key: "queue", label: "Fila de destinatários", status: "fail", detail: "Gere a fila de destinatários antes de iniciar." });
    return finish();
  }


  const { data: conn } = await db
    .from("whatsapp_connections")
    .select("id, name, display_phone, phone_number_id, waba_id, waba_ref_id, access_token, use_global_token, graph_api_version, status, blocked_at, blocked_reason")
    .eq("id", camp.connection_id)
    .maybeSingle();
  if (!conn?.phone_number_id) {
    push({ key: "connection", label: "Número", status: "fail", detail: "Conexão sem phone_number_id." });
    return finish();
  }
  if (conn.blocked_at) {
    push({
      key: "number_blocked",
      label: "Número bloqueado",
      status: "warn",
      detail: `Número marcado com restrição em ${new Date(conn.blocked_at).toLocaleString("pt-BR")}: ${conn.blocked_reason ?? "restrição da Meta"}. Aviso apenas; o envio será tentado.`,
    });
  }

  const { resolveConnectionToken } = await import("@/lib/meta/wa-waba-token.server");
  const token = (await resolveConnectionToken(db, conn)) || "";

  const version = resolveGraphVersion(conn.graph_api_version ?? null);

  if (!token) {
    push({ key: "token", label: "Token e permissões", status: "fail", detail: "Nenhum token disponível para esta conexão." });
    return finish();
  }

  // 1) Número: status + quality_rating + limite
  const num = await graph(
    `${conn.phone_number_id}?fields=id,display_phone_number,verified_name,status,quality_rating,throughput`,
    token,
    version,
  );
  if (!num.ok) {
    push({ key: "token", label: "Token e permissões", status: "fail", detail: `Falha ao consultar o número: ${num.error}` });
    return finish();
  }
  push({ key: "token", label: "Token e permissões", status: "ok", detail: "Token válido e com acesso ao número." });

  numberStatus = num.json?.status ?? null;
  qualityRating = num.json?.quality_rating ?? null;


  if (numberStatus === "CONNECTED") {
    push({ key: "number_status", label: "Número conectado", status: "ok", detail: `status=CONNECTED (${num.json?.display_phone_number ?? conn.display_phone ?? ""})` });
  } else {
    push({ key: "number_status", label: "Número conectado", status: "warn", detail: `status=${numberStatus ?? "desconhecido"} — a Meta pode recusar o envio, mas esta verificação não impede a tentativa.` });
  }

  if (qualityRating === "GREEN") {
    push({ key: "quality", label: "Qualidade do número", status: "ok", detail: "quality_rating=GREEN" });
  } else if (qualityRating === "YELLOW" || qualityRating === "UNKNOWN" || qualityRating == null) {
    push({ key: "quality", label: "Qualidade do número", status: "warn", detail: `quality_rating=${qualityRating ?? "UNKNOWN"} — exige confirmação manual.` });
  } else {
    push({ key: "quality", label: "Qualidade do número", status: "warn", detail: `quality_rating=${qualityRating} — alerta de qualidade; o disparo continua autorizado.` });
  }

  // 2) WABA/portfólio acessível
  const wabaId = conn.waba_id;
  if (wabaId) {
    const waba = await graph(
      `${wabaId}?fields=id,name,account_review_status,business_verification_status,whatsapp_business_manager_messaging_limit`,
      token,
      version,
    );
    if (waba.ok) {
      const review = waba.json?.account_review_status ?? null;
      const bv = waba.json?.business_verification_status ?? null;
      tier = waba.json?.whatsapp_business_manager_messaging_limit ?? null;
      const r = String(review ?? "").toUpperCase();
      const restricted = r && !["APPROVED", "VERIFIED"].includes(r);
      const blocked = ["REJECTED", "BANNED", "DISABLED", "RESTRICTED"].includes(r);
      push({
        key: "waba",
        label: "WABA/portfólio acessível",
        status: blocked || restricted ? "warn" : "ok",
        detail: `${waba.json?.name ?? wabaId}${review ? ` · review=${review}` : ""}${bv ? ` · negócio=${bv}` : ""}${blocked ? " — conta restrita pela Meta; o envio será tentado mesmo assim." : ""}`,
      });

    } else {
      push({ key: "waba", label: "WABA/portfólio acessível", status: "fail", detail: `Token não acessa a WABA: ${waba.error}` });
    }

  }

  // 3) Template aprovado e ativo (Direct Send não usa template)
  const { data: tpl } = opts.direct_send
    ? { data: null }
    : await db
        .from("whatsapp_templates")
        .select("id, name, language, status, meta_template_id")
        .eq("id", camp.template_id)
        .maybeSingle();
  if (opts.direct_send) {
    push({ key: "template", label: "Direct Send — Utilidade", status: "ok", detail: "Texto livre com categoria utility (sem template)." });
  } else if (!tpl) {
    push({ key: "template", label: "Template", status: "fail", detail: "Template não encontrado." });
  } else {
    const st = String(tpl.status ?? "").toUpperCase();
    if (st === "APPROVED" || st === "ATIVO" || st === "ACTIVE") {
      push({ key: "template", label: "Template aprovado e ativo", status: "ok", detail: `${tpl.name} (${tpl.language}) · ${st}` });
    } else if (st === "PENDING") {
      push({ key: "template", label: "Template aprovado e ativo", status: "warn", detail: `${tpl.name}: ${st} — aguardando aprovação da Meta.` });
    } else {
      push({ key: "template", label: "Template aprovado e ativo", status: "fail", detail: `${tpl.name}: ${st || "status desconhecido"} — não é possível disparar.` });
    }
  }

  // 4) Limite de mensagens do Portfólio Empresarial (compartilhado pela BM)
  if (tier) {
    const cap = TIER_LIMITS[String(tier).toUpperCase()] ?? null;
    const total = Number(camp.total_recipients ?? 0);
    if (cap == null) {
      push({ key: "limit", label: "Limite do Portfólio Empresarial", status: "ok", detail: `${tier} (limite compartilhado da BM)` });

    } else if (Number.isFinite(cap) && total > cap) {
      push({
        key: "limit",
        label: "Limite de mensagens",
        status: "warn",
        detail: `Fila de ${total.toLocaleString("pt-BR")} contatos acima do tier ${tier} (${cap.toLocaleString("pt-BR")}/24h) — o excedente pode falhar.`,
      });
    } else {
      push({ key: "limit", label: "Limite de mensagens", status: "ok", detail: `Tier ${tier} comporta a fila (${total.toLocaleString("pt-BR")}).` });
    }
  }

  // 5) Restrições conhecidas (health_status agregado)
  try {
    const snap =
      (await getHealthCached(db, { node_kind: "MESSAGE_TEMPLATE", template_ref_id: camp.template_id, maxAgeSec: 60 })) ??
      (await getHealthCached(db, { node_kind: "PHONE_NUMBER", connection_id: camp.connection_id, maxAgeSec: 60 }));
    if (snap?.ok && snap.can_send_message) {
      const s = snap.can_send_message;
      const detail = snap.errors[0]?.error_description || snap.additional_info[0]?.message || `health_status=${s}`;
      push({
        key: "health",
        label: "Restrições conhecidas (health_status)",
        status: s === "AVAILABLE" ? "ok" : "warn",
        detail: s === "AVAILABLE" ? "Nenhuma restrição reportada pela Meta." : `${s}: ${detail} — aviso; não impede a tentativa de envio.`,
      });
    } else {
      push({ key: "health", label: "Restrições conhecidas (health_status)", status: "warn", detail: snap?.fetch_error ?? "Não foi possível consultar o health_status." });
    }
  } catch (e: any) {
    push({ key: "health", label: "Restrições conhecidas (health_status)", status: "warn", detail: e?.message ?? "Falha ao consultar health_status." });
  }

  return finish();
}
