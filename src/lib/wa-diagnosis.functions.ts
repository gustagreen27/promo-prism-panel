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
