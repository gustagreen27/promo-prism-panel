import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Registro genérico de App Secrets da Meta usados para validar
 * X-Hub-Signature-256. Suporta múltiplos Apps sem hardcode:
 *
 *  1. META_APP_SECRET (env) — App padrão do projeto.
 *  2. settings.meta_app_secrets → { apps: [{ app_id, app_secret }] }
 *  3. whatsapp_connections.app_secret (agrupado por app_id)
 *
 * Nunca registramos o segredo em si — apenas um rótulo (`app_id` ou
 * `connection:<id>`) para auditoria.
 */
export type WebhookSecretCandidate = {
  /** Rótulo seguro para log — nunca contém o segredo. */
  label: string;
  appId: string | null;
  source: "env" | "settings" | "connection";
  secret: string;
  /** Conexões (phone_number_id / waba_id) associadas a este segredo. */
  phoneNumberIds: string[];
  wabaIds: string[];
};

function computeSig(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

function safeCompareHex(providedHex: string, expectedHex: string): boolean {
  try {
    const a = Buffer.from(providedHex, "hex");
    const b = Buffer.from(expectedHex, "hex");
    if (a.length !== b.length || a.length === 0) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function parseSignatureHeader(signatureHeader: string | null): string | null {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return null;
  const provided = signatureHeader.slice("sha256=".length).trim();
  return provided.length > 0 ? provided : null;
}

export function signatureMatches(
  rawBody: string,
  providedHex: string,
  secret: string | null | undefined,
): boolean {
  if (!secret) return false;
  return safeCompareHex(providedHex, computeSig(rawBody, secret));
}

/** Monta a lista de segredos conhecidos, deduplicada pelo valor do segredo. */
export async function loadWebhookSecretCandidates(
  supabaseAdmin: any,
): Promise<WebhookSecretCandidate[]> {
  const bySecret = new Map<string, WebhookSecretCandidate>();

  const push = (c: Omit<WebhookSecretCandidate, "phoneNumberIds" | "wabaIds"> &
    Partial<Pick<WebhookSecretCandidate, "phoneNumberIds" | "wabaIds">>) => {
    const secret = String(c.secret ?? "").trim();
    if (!secret) return;
    const existing = bySecret.get(secret);
    if (existing) {
      for (const p of c.phoneNumberIds ?? []) if (p) existing.phoneNumberIds.push(p);
      for (const w of c.wabaIds ?? []) if (w) existing.wabaIds.push(w);
      if (!existing.appId && c.appId) existing.appId = c.appId;
      return;
    }
    bySecret.set(secret, {
      label: c.label,
      appId: c.appId ?? null,
      source: c.source,
      secret,
      phoneNumberIds: (c.phoneNumberIds ?? []).filter(Boolean),
      wabaIds: (c.wabaIds ?? []).filter(Boolean),
    });
  };

  // 1) App padrão via env
  const envSecret = process.env.META_APP_SECRET;
  const envAppId = process.env.META_APP_ID ?? null;
  if (envSecret) {
    push({
      label: envAppId ? `app:${envAppId}` : "app:env",
      appId: envAppId,
      source: "env",
      secret: envSecret,
    });
  }

  // 2) Apps adicionais cadastrados em settings (genérico, sem hardcode)
  try {
    const { data: setting } = await supabaseAdmin
      .from("settings")
      .select("value")
      .eq("key", "meta_app_secrets")
      .maybeSingle();
    const apps: any[] = Array.isArray((setting?.value as any)?.apps)
      ? (setting!.value as any).apps
      : Array.isArray(setting?.value)
        ? (setting!.value as any)
        : [];
    for (const a of apps) {
      const appId = a?.app_id ? String(a.app_id) : null;
      push({
        label: appId ? `app:${appId}` : "app:settings",
        appId,
        source: "settings",
        secret: String(a?.app_secret ?? ""),
      });
    }
  } catch {
    /* settings opcional */
  }

  // 3) Segredos por conexão (agrupados por app_id quando disponível)
  try {
    const { data: conns } = await supabaseAdmin
      .from("whatsapp_connections")
      .select("id, app_id, app_secret, phone_number_id, waba_id")
      .not("app_secret", "is", null);
    for (const c of (conns ?? []) as any[]) {
      const appId = c?.app_id ? String(c.app_id) : null;
      push({
        label: appId ? `app:${appId}` : `connection:${c.id}`,
        appId,
        source: "connection",
        secret: String(c?.app_secret ?? ""),
        phoneNumberIds: [c?.phone_number_id ? String(c.phone_number_id) : ""],
        wabaIds: [c?.waba_id ? String(c.waba_id) : ""],
      });
    }
  } catch {
    /* conexões opcionais */
  }

  return Array.from(bySecret.values());
}

/**
 * Valida a assinatura contra todos os segredos conhecidos.
 * Ordena os candidatos que "combinam" com o payload primeiro (por
 * phone_number_id / waba_id) apenas por eficiência — a validação
 * criptográfica continua obrigatória.
 */
export function verifyAgainstCandidates(
  rawBody: string,
  signatureHeader: string | null,
  candidates: WebhookSecretCandidate[],
  hints: { phone_number_ids: string[]; waba_ids: string[] },
): { valid: boolean; matched: WebhookSecretCandidate | null; tried: number } {
  const provided = parseSignatureHeader(signatureHeader);
  if (!provided) return { valid: false, matched: null, tried: 0 };

  const phoneSet = new Set(hints.phone_number_ids ?? []);
  const wabaSet = new Set(hints.waba_ids ?? []);
  const score = (c: WebhookSecretCandidate) =>
    c.phoneNumberIds.some((p) => phoneSet.has(p)) || c.wabaIds.some((w) => wabaSet.has(w))
      ? 0
      : c.source === "env"
        ? 1
        : 2;
  const ordered = [...candidates].sort((a, b) => score(a) - score(b));

  let tried = 0;
  for (const c of ordered) {
    tried += 1;
    if (signatureMatches(rawBody, provided, c.secret)) {
      return { valid: true, matched: c, tried };
    }
  }
  return { valid: false, matched: null, tried };
}
