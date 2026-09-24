import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadConnectionSecure } from "@/lib/meta/wa-token-resolver.server";
import { auditProfileEvent } from "@/lib/meta/wa-profile-audit.server";
import { metaEgressFetch } from "@/lib/meta/meta-egress";
import { GRAPH_VERSION } from "@/lib/meta/graph-version";

/**
 * Ações corretivas usadas pela tela de diagnóstico do WhatsApp.
 * Reutilizam loadConnectionSecure (autorização admin/staff/workspace).
 */

async function loadConnRaw(supabase: any, userId: string, connection_id: string) {
  // Precisa checar autorização mas talvez token esteja quebrado — pega os dados brutos.
  const { data, error } = await supabase
    .from("whatsapp_connections")
    .select("id, workspace_id, waba_id, waba_ref_id, phone_number_id, use_global_token, app_id, app_secret, verify_token, business_id")
    .eq("id", connection_id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Conexão não encontrada.");
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) {
    if (!data.workspace_id) throw new Error("Forbidden");
    const { data: isMember } = await supabase.rpc("is_workspace_member", { _ws: data.workspace_id, _user: userId });
    if (!isMember) throw new Error("Forbidden");
  }
  return data as {
    id: string; workspace_id: string | null; waba_id: string | null;
    waba_ref_id: string | null; phone_number_id: string | null; use_global_token: boolean;
    app_id: string | null; app_secret: string | null;
    verify_token: string | null; business_id: string | null;
  };
}

/** Mascara segredos para retorno seguro ao frontend. */
function mask(s: string | null | undefined) {
  if (!s) return null;
  return { last6: s.slice(-6), length: s.length };
}


/**
 * Atualiza o access_token da conexão e, opcionalmente, também as credenciais
 * Meta específicas (app_id, app_secret, verify_token, business_id) — tudo
 * no mesmo save, para que a próxima chamada a debug_token/webhook use o par
 * (token ↔ App ID/Secret) coerente.
 * Se um campo for omitido/vazio, o valor atual é preservado (nunca apaga).
 */
export const updateConnectionToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    connection_id: z.string().uuid(),
    access_token: z.string().trim().max(4000).optional(),
    app_id: z.string().trim().max(80).optional(),
    app_secret: z.string().trim().max(200).optional(),
    verify_token: z.string().trim().max(200).optional(),
    business_id: z.string().trim().max(80).optional(),
    use_global_token: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const conn = await loadConnRaw(context.supabase, context.userId, data.connection_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    const audit: Record<string, any> = {};

    if (data.access_token && data.access_token.length >= 20) {
      patch.access_token = data.access_token;
      patch.use_global_token = false;
      audit.access_token_last6 = data.access_token.slice(-6);
    }
    if (data.app_id !== undefined && data.app_id !== "") {
      patch.app_id = data.app_id;
      audit.app_id = data.app_id;
    }
    if (data.app_secret !== undefined && data.app_secret !== "") {
      patch.app_secret = data.app_secret;
      audit.app_secret_last6 = data.app_secret.slice(-6);
    }
    if (data.verify_token !== undefined && data.verify_token !== "") {
      patch.verify_token = data.verify_token;
      audit.verify_token_last6 = data.verify_token.slice(-6);
    }
    if (data.business_id !== undefined && data.business_id !== "") {
      patch.business_id = data.business_id;
      audit.business_id = data.business_id;
    }
    if (data.use_global_token === true) {
      patch.use_global_token = true;
    } else if (data.use_global_token === false) {
      patch.use_global_token = false;
    }

    if (Object.keys(patch).length <= 1) {
      throw new Error("Informe pelo menos um campo para atualizar.");
    }

    const { error } = await supabaseAdmin
      .from("whatsapp_connections")
      .update(patch as any)
      .eq("id", conn.id);
    if (error) throw error;
    await auditProfileEvent({
      workspace_id: conn.workspace_id, connection_id: conn.id, phone_number_id: conn.phone_number_id,
      user_id: context.userId, action: "CONNECTION_CREDENTIALS_UPDATED",
      new_value: audit,
    });
    return {
      ok: true,
      last6: data.access_token ? data.access_token.slice(-6) : null,
      updated_fields: Object.keys(audit),
    };
  });

/** Retorna as credenciais atuais mascaradas para a UI de edição. */
export const getConnectionCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ connection_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const conn = await loadConnRaw(context.supabase, context.userId, data.connection_id);
    // Precisa carregar os segredos com admin (RLS pode não retornar tudo)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: full } = await supabaseAdmin
      .from("whatsapp_connections")
      .select("access_token, app_id, app_secret, verify_token, business_id, use_global_token, waba_id, phone_number_id")
      .eq("id", conn.id)
      .maybeSingle();
    return {
      use_global_token: !!full?.use_global_token,
      waba_id: full?.waba_id ?? null,
      phone_number_id: full?.phone_number_id ?? null,
      app_id: full?.app_id ?? null,
      business_id: full?.business_id ?? null,
      access_token_mask: mask(full?.access_token ?? null),
      app_secret_mask: mask(full?.app_secret ?? null),
      verify_token_mask: mask(full?.verify_token ?? null),
    };
  });

/**
 * Executa debug_token usando o App ID + App Secret da conexão (ou global,
 * quando use_global_token=true / conexão sem credenciais próprias).
 * NUNCA mistura token da conexão com App Secret de outro app.
 */
export const debugConnectionToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ connection_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const conn = await loadConnRaw(context.supabase, context.userId, data.connection_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: full } = await supabaseAdmin
      .from("whatsapp_connections")
      .select("access_token, app_id, app_secret, use_global_token")
      .eq("id", conn.id)
      .maybeSingle();
    if (!full) throw new Error("Conexão não encontrada.");

    const useGlobal = !!full.use_global_token;
    const inputToken = useGlobal
      ? (process.env.WHATSAPP_ACCESS_TOKEN || "")
      : (full.access_token || "");
    const appId = useGlobal
      ? (process.env.META_APP_ID || "")
      : (full.app_id || process.env.META_APP_ID || "");
    const appSecret = useGlobal
      ? (process.env.META_APP_SECRET || "")
      : (full.app_secret || (full.app_id ? "" : (process.env.META_APP_SECRET || "")));

    if (!inputToken) {
      return { ok: false, reason: "MISSING_TOKEN", source: useGlobal ? "global" : "connection" };
    }
    if (!appId || !appSecret) {
      return {
        ok: false, reason: "MISSING_APP_CREDENTIALS",
        source: useGlobal ? "global" : "connection",
        hint: "Cadastre App ID e App Secret específicos desta conexão para validar o token corretamente.",
      };
    }

    const appAccessToken = `${appId}|${appSecret}`;
    try {
      const url = `https://graph.facebook.com/${GRAPH_VERSION}/debug_token`
        + "?input_token=" + encodeURIComponent(inputToken)
        + "&access_token=" + encodeURIComponent(appAccessToken);
      const r = await metaEgressFetch(url);
      const j: any = await r.json().catch(() => ({}));
      const d = j?.data;
      const tokenAppId: string | null = d?.app_id ? String(d.app_id) : null;
      const matches = tokenAppId && appId ? tokenAppId === String(appId) : null;
      return {
        ok: !!d?.is_valid,
        source: useGlobal ? "global" : "connection",
        token_last6: inputToken.slice(-6),
        connection_app_id: appId,
        token_app_id: tokenAppId,
        app_id_matches: matches,
        is_valid: !!d?.is_valid,
        expires_at: d?.expires_at ?? null,
        data_access_expires_at: d?.data_access_expires_at ?? null,
        scopes: d?.scopes ?? null,
        type: d?.type ?? null,
        application: d?.application ?? null,
        user_id: d?.user_id ?? null,
        error: d?.error ?? j?.error ?? null,
        message:
          matches === false
            ? `O token informado pertence ao aplicativo ${tokenAppId}, mas esta conexão está configurada com o aplicativo ${appId}. Atualize o App ID e o App Secret desta conexão ou utilize um token emitido pelo aplicativo correto.`
            : null,
      };
    } catch (e: any) {
      return { ok: false, reason: "REQUEST_FAILED", error: e?.message ?? "erro" };
    }
  });

/**
 * Lista os apps inscritos no webhook da WABA e compara com o App ID da conexão.
 */
export const getConnectionSubscribedApps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ connection_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const conn = await loadConnRaw(context.supabase, context.userId, data.connection_id);
    if (!conn.waba_id) return { ok: false, reason: "MISSING_WABA_ID" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: full } = await supabaseAdmin
      .from("whatsapp_connections")
      .select("access_token, app_id, use_global_token")
      .eq("id", conn.id)
      .maybeSingle();
    const useGlobal = !!full?.use_global_token;
    const token = useGlobal ? (process.env.WHATSAPP_ACCESS_TOKEN || "") : (full?.access_token || "");
    const expectedAppId = useGlobal
      ? (process.env.META_APP_ID || "")
      : (full?.app_id || process.env.META_APP_ID || "");
    if (!token) return { ok: false, reason: "MISSING_TOKEN" };

    try {
      const r = await metaEgressFetch(`https://graph.facebook.com/${GRAPH_VERSION}/${conn.waba_id}/subscribed_apps`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j: any = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) {
        return { ok: false, error: j?.error ?? { message: `HTTP ${r.status}` } };
      }
      const apps: any[] = Array.isArray(j?.data) ? j.data : [];
      const subscribed = apps.map((a) => ({
        app_id: a?.whatsapp_business_api_data?.id ?? a?.id ?? null,
        name: a?.whatsapp_business_api_data?.name ?? a?.name ?? null,
      }));
      const isSubscribed = expectedAppId
        ? subscribed.some((a) => String(a.app_id) === String(expectedAppId))
        : null;
      return { ok: true, expected_app_id: expectedAppId || null, subscribed, is_subscribed: isSubscribed };
    } catch (e: any) {
      return { ok: false, error: { message: e?.message ?? "erro" } };
    }
  });


/** Alterna entre token global e token próprio da conexão. */
export const toggleGlobalToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    connection_id: z.string().uuid(),
    use_global_token: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const conn = await loadConnRaw(context.supabase, context.userId, data.connection_id);
    if (data.use_global_token && !process.env.WHATSAPP_ACCESS_TOKEN) {
      throw new Error("WHATSAPP_ACCESS_TOKEN não está configurado no ambiente.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("whatsapp_connections")
      .update({ use_global_token: data.use_global_token, updated_at: new Date().toISOString() })
      .eq("id", conn.id);
    if (error) throw error;
    await auditProfileEvent({
      workspace_id: conn.workspace_id, connection_id: conn.id, phone_number_id: conn.phone_number_id,
      user_id: context.userId, action: "TOKEN_SOURCE_CHANGED",
      new_value: { use_global_token: data.use_global_token },
    });
    return { ok: true };
  });

/** Aplica um phone_number_id corrigido (após confirmação do diagnóstico). */
export const applyFixPhoneNumberId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    connection_id: z.string().uuid(),
    phone_number_id: z.string().trim().min(3).max(64),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const conn = await loadConnRaw(context.supabase, context.userId, data.connection_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("whatsapp_connections")
      .update({ phone_number_id: data.phone_number_id, meta_sync_status: "connected", updated_at: new Date().toISOString() })
      .eq("id", conn.id);
    if (error) throw error;
    await auditProfileEvent({
      workspace_id: conn.workspace_id, connection_id: conn.id, phone_number_id: data.phone_number_id,
      user_id: context.userId, action: "PHONE_NUMBER_ID_CORRECTED",
      previous_value: { phone_number_id: conn.phone_number_id },
      new_value: { phone_number_id: data.phone_number_id },
    });
    return { ok: true };
  });

/** Corrige o waba_id (aceita apenas texto simples do BM). */
export const applyFixWabaId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    connection_id: z.string().uuid(),
    waba_id: z.string().trim().min(3).max(64),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const conn = await loadConnRaw(context.supabase, context.userId, data.connection_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("whatsapp_connections")
      .update({ waba_id: data.waba_id, updated_at: new Date().toISOString() })
      .eq("id", conn.id);
    if (error) throw error;
    await auditProfileEvent({
      workspace_id: conn.workspace_id, connection_id: conn.id, phone_number_id: conn.phone_number_id,
      user_id: context.userId, action: "WABA_ID_CORRECTED",
      previous_value: { waba_id: conn.waba_id }, new_value: { waba_id: data.waba_id },
    });
    return { ok: true };
  });

/** Inscreve o aplicativo no webhook da WABA (POST /{waba_id}/subscribed_apps). */
export const subscribeAppToWaba = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ connection_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const conn = await loadConnectionSecure(context.supabase, context.userId, data.connection_id);
    if (!conn.waba_id) throw new Error("Conexão sem waba_id.");
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${conn.waba_id}/subscribed_apps`;
    const r = await metaEgressFetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${conn.access_token}`, "Content-Type": "application/json" },
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) {
      const err = j?.error ?? {};
      await auditProfileEvent({
        workspace_id: conn.workspace_id, connection_id: conn.id, phone_number_id: conn.phone_number_id,
        user_id: context.userId, action: "APP_SUBSCRIBE_FAILED",
        new_value: { code: err.code, message: err.message, fbtrace_id: err.fbtrace_id },
      });
      throw new Error(err.message ?? `HTTP ${r.status}`);
    }
    await auditProfileEvent({
      workspace_id: conn.workspace_id, connection_id: conn.id, phone_number_id: conn.phone_number_id,
      user_id: context.userId, action: "APP_SUBSCRIBED", new_value: { waba_id: conn.waba_id },
    });
    return { ok: true, raw: j };
  });

/** Diagnóstico completo: token global + conexões (token/phone_number_id/waba). */
export const runWhatsAppDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspace_id: z.string().uuid().nullish() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    const globalToken = process.env.WHATSAPP_ACCESS_TOKEN || "";
    const globalCheck = {
      configured: !!globalToken,
      length: globalToken.length,
      last6: globalToken ? globalToken.slice(-6) : null,
      valid: false as boolean,
      error: null as string | null,
    };
    if (globalToken) {
      try {
        const r = await metaEgressFetch(`https://graph.facebook.com/${GRAPH_VERSION}/debug_token?input_token=` + encodeURIComponent(globalToken) + "&access_token=" + encodeURIComponent(globalToken));
        const j: any = await r.json().catch(() => ({}));
        if (j?.data?.is_valid) globalCheck.valid = true;
        else globalCheck.error = j?.data?.error?.message || j?.error?.message || "Token inválido (debug_token)";
      } catch (e: any) { globalCheck.error = e?.message ?? "Falha ao validar"; }
    }

    let connsQ = supabase
      .from("whatsapp_connections")
      .select("id, nome_interno, display_phone, phone_number_id, waba_id, access_token, use_global_token, status, workspace_id");
    if (!isAdmin && data.workspace_id) connsQ = connsQ.eq("workspace_id", data.workspace_id);
    const { data: conns } = await connsQ;

    const connReports = [] as any[];
    for (const c of (conns ?? []) as any[]) {
      const problems: string[] = [];
      const tokenSource = c.access_token ? "conexão" : (globalToken ? "global" : "faltando");
      const token = c.access_token || globalToken;
      if (!c.phone_number_id) problems.push("phone_number_id ausente");
      if (!c.waba_id) problems.push("waba_id ausente");
      if (!token) problems.push("access_token ausente (nem local nem global)");
      let tokenValid: boolean | null = null;
      let tokenError: string | null = null;
      if (token) {
        try {
          const r = await metaEgressFetch(`https://graph.facebook.com/${GRAPH_VERSION}/${c.phone_number_id ?? "me"}?fields=id`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const j: any = await r.json().catch(() => ({}));
          if (r.ok && !j?.error) tokenValid = true;
          else { tokenValid = false; tokenError = j?.error?.message ?? `HTTP ${r.status}`; problems.push(`Token não valida no phone_number_id: ${tokenError}`); }
        } catch (e: any) { tokenValid = false; tokenError = e?.message ?? "Falha"; problems.push(tokenError ?? "Falha"); }
      }
      connReports.push({
        id: c.id,
        nome: c.nome_interno,
        phone: c.display_phone,
        status: c.status,
        phone_number_id: c.phone_number_id,
        waba_id: c.waba_id,
        has_local_token: !!c.access_token,
        use_global_token: !!c.use_global_token,
        token_source: tokenSource,
        token_valid: tokenValid,
        token_error: tokenError,
        problems,
        ok: problems.length === 0,
      });
    }

    return { global: globalCheck, connections: connReports, is_admin: !!isAdmin };
  });

/** Contexto de erro de uma campanha: last_error, últimos eventos do timeline e amostras de destinatários falhos. */
export const getCampaignErrorContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaign_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = isAdmin ? supabaseAdmin : supabase;

    const { data: camp } = await db
      .from("wa_campaigns")
      .select("id, name, status, last_error, pause_reason, connection_id, template_id, workspace_id, total_recipients, sent_count, failed_count")
      .eq("id", data.campaign_id)
      .maybeSingle();
    if (!camp) throw new Error("Campanha não encontrada");

    const [{ data: timeline }, { data: failedRecs }] = await Promise.all([
      db.from("campaign_timeline")
        .select("event_type, message, payload, created_at")
        .eq("campaign_id", data.campaign_id)
        .order("created_at", { ascending: false })
        .limit(15),
      db.from("campaign_recipients")
        .select("phone, status, failed_reason, error_code, attempt, failed_at")
        .eq("campaign_id", data.campaign_id)
        .eq("status", "failed")
        .order("failed_at", { ascending: false })
        .limit(10),
    ]);

    return {
      campaign: camp,
      timeline: timeline ?? [],
      failed_recipients: failedRecs ?? [],
    };
  });

/**
 * Messaging & Calling Health Status (Graph API).
 * GET /<NODE_ID>?fields=health_status — retorna o status agregado (AVAILABLE /
 * LIMITED / BLOCKED) de todas as entidades envolvidas no envio: número, WABA,
 * portfólio de negócios, app e (opcionalmente) template.
 * Usa SEMPRE o token da própria conexão (ou o global, se marcada assim).
 */
export const getConnectionHealthStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    connection_id: z.string().uuid(),
    template_id: z.string().trim().max(64).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const conn = await loadConnRaw(context.supabase, context.userId, data.connection_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: full } = await supabaseAdmin
      .from("whatsapp_connections")
      .select("access_token, use_global_token, phone_number_id, waba_id")
      .eq("id", conn.id)
      .maybeSingle();
    if (!full) throw new Error("Conexão não encontrada.");

    const useGlobal = !!full.use_global_token;
    const token = useGlobal ? (process.env.WHATSAPP_ACCESS_TOKEN || "") : (full.access_token || "");
    if (!token) return { ok: false, reason: "MISSING_TOKEN", source: useGlobal ? "global" : "connection" };

    const { resolveGraphVersion } = await import("@/lib/meta/graph-version");
    const version = resolveGraphVersion((full as any).graph_version ?? null);

    const nodeId = data.template_id || full.phone_number_id || full.waba_id;
    if (!nodeId) return { ok: false, reason: "MISSING_NODE_ID" };

    try {
      const r = await metaEgressFetch(
        `https://graph.facebook.com/${version}/${nodeId}?fields=health_status`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const j: any = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) {
        return { ok: false, node_id: nodeId, error: j?.error ?? { message: `HTTP ${r.status}` } };
      }
      const hs = j?.health_status ?? null;
      const entities: any[] = Array.isArray(hs?.entities) ? hs.entities : [];
      const blocked = entities.filter((e) => e?.can_send_message === "BLOCKED");
      const limited = entities.filter((e) => e?.can_send_message === "LIMITED");
      return {
        ok: true,
        node_id: nodeId,
        node_kind: data.template_id ? "MESSAGE_TEMPLATE" : (full.phone_number_id ? "PHONE_NUMBER" : "WABA"),
        graph_version: version,
        token_source: useGlobal ? "global" : "connection",
        can_send_message: hs?.can_send_message ?? null,
        entities,
        blocked_entities: blocked,
        limited_entities: limited,
        errors: blocked.flatMap((e) => (e.errors ?? []).map((x: any) => ({ entity: e.entity_type, ...x }))),
        additional_info: limited.flatMap((e) => (e.additional_info ?? []).map((m: string) => ({ entity: e.entity_type, message: m }))),
      };
    } catch (e: any) {
      return { ok: false, node_id: nodeId, error: { message: e?.message ?? "erro" } };
    }
  });
