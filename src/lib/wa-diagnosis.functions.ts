import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadConnectionSecure } from "@/lib/meta/wa-token-resolver.server";
import { auditProfileEvent } from "@/lib/meta/wa-profile-audit.server";

/**
 * Ações corretivas usadas pela tela de diagnóstico do WhatsApp.
 * Reutilizam loadConnectionSecure (autorização admin/staff/workspace).
 */

async function loadConnRaw(supabase: any, userId: string, connection_id: string) {
  // Precisa checar autorização mas talvez token esteja quebrado — pega os dados brutos.
  const { data, error } = await supabase
    .from("whatsapp_connections")
    .select("id, workspace_id, waba_id, waba_ref_id, phone_number_id, use_global_token")
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
  };
}

/** Atualiza o access_token da conexão (armazena token novo do usuário). */
export const updateConnectionToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    connection_id: z.string().uuid(),
    access_token: z.string().trim().min(20).max(4000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const conn = await loadConnRaw(context.supabase, context.userId, data.connection_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("whatsapp_connections")
      .update({ access_token: data.access_token, use_global_token: false, updated_at: new Date().toISOString() })
      .eq("id", conn.id);
    if (error) throw error;
    await auditProfileEvent({
      workspace_id: conn.workspace_id, connection_id: conn.id, phone_number_id: conn.phone_number_id,
      user_id: context.userId, action: "TOKEN_UPDATED",
      new_value: { source: "connection", last6: data.access_token.slice(-6) },
    });
    return { ok: true, last6: data.access_token.slice(-6) };
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
    const url = `https://graph.facebook.com/v21.0/${conn.waba_id}/subscribed_apps`;
    const r = await fetch(url, {
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
        const r = await fetch("https://graph.facebook.com/v21.0/debug_token?input_token=" + encodeURIComponent(globalToken) + "&access_token=" + encodeURIComponent(globalToken));
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
          const r = await fetch(`https://graph.facebook.com/v21.0/${c.phone_number_id ?? "me"}?fields=id`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const j: any = await r.json().catch(() => ({}));
          if (r.ok && !j?.error) tokenValid = true;
          else { tokenValid = false; tokenError = j?.error?.message ?? `HTTP ${r.status}`; problems.push(`Token não valida no phone_number_id: ${tokenError}`); }
        } catch (e: any) { tokenValid = false; tokenError = e?.message ?? "Falha"; problems.push(tokenError); }
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
