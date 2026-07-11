/**
 * Assinatura de WABAs no app da Meta para receber webhooks.
 *
 * Endpoints usados (Graph API):
 *  - POST /{waba-id}/subscribed_apps  → assina o app da Meta na WABA.
 *      Depois disso, todos os campos assinados pelo app no Meta App Dashboard
 *      (messages, message_template_status_update, etc.) passam a ser entregues
 *      no callback URL configurado no app.
 *  - GET  /{waba-id}/subscribed_apps  → lista os apps atualmente assinados,
 *      permitindo confirmar a operação.
 *
 * Regras:
 *  - Somente admin pode chamar.
 *  - Usa o access_token gravado na WABA/conexão; se ausente, cai para o
 *    WHATSAPP_ACCESS_TOKEN do ambiente (token de sistema).
 *  - Nunca aceita waba_id, phone_number_id ou token vindo do frontend.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { metaFetch, META_GRAPH_VERSION } from "@/lib/meta/meta-client.server";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (!data) throw new Error("Forbidden");
}

type WabaTokenCtx = { waba_id: string; token: string; source: "waba" | "connection" | "env" };

async function resolveWabaToken(
  supabase: any,
  wabaRefId: string,
): Promise<WabaTokenCtx> {
  const { data: waba, error } = await supabase
    .from("whatsapp_wabas")
    .select("id, waba_id, access_token")
    .eq("id", wabaRefId)
    .maybeSingle();
  if (error) throw error;
  if (!waba) throw new Error("WABA não encontrada.");
  if (!waba.waba_id) throw new Error("Esta WABA não tem waba_id preenchido.");

  if (waba.access_token) {
    return { waba_id: waba.waba_id, token: waba.access_token, source: "waba" };
  }

  // Fallback 1: token de alguma conexão da mesma WABA
  const { data: conn } = await supabase
    .from("whatsapp_connections")
    .select("access_token, use_global_token")
    .eq("waba_ref_id", wabaRefId)
    .not("access_token", "is", null)
    .limit(1)
    .maybeSingle();
  if (conn?.access_token) {
    return { waba_id: waba.waba_id, token: conn.access_token, source: "connection" };
  }

  // Fallback 2: token global do ambiente
  const envToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (envToken) {
    return { waba_id: waba.waba_id, token: envToken, source: "env" };
  }

  throw new Error(
    "Sem token para assinar a WABA. Configure access_token na WABA ou defina WHATSAPP_ACCESS_TOKEN no ambiente.",
  );
}

const idInput = z.object({ waba_ref_id: z.string().uuid() });

/** Assina o app da Meta na WABA — habilita a entrega de webhooks. */
export const subscribeWabaToApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabase = context.supabase as any;
    const { waba_id, token, source } = await resolveWabaToken(supabase, data.waba_ref_id);

    // POST /{waba-id}/subscribed_apps
    const subscribed = await metaFetch(`/${META_GRAPH_VERSION}/${waba_id}/subscribed_apps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    // GET /{waba-id}/subscribed_apps para confirmar
    const listing = await metaFetch(`/${META_GRAPH_VERSION}/${waba_id}/subscribed_apps`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    // Registra o evento no log de onboarding
    await supabase.from("whatsapp_onboarding_logs").insert({
      waba_ref_id: data.waba_ref_id,
      step: "subscribe_app",
      status: "success",
      payload: { subscribed, listing, token_source: source },
    });

    return {
      ok: true,
      waba_id,
      token_source: source,
      subscribed,
      apps: (listing?.data ?? []) as Array<{
        whatsapp_business_api_data?: { id?: string; name?: string; link?: string };
      }>,
    };
  });

/** Retorna quais apps estão assinados nesta WABA (usado para exibir status). */
export const listSubscribedApps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabase = context.supabase as any;
    const { waba_id, token, source } = await resolveWabaToken(supabase, data.waba_ref_id);

    const listing = await metaFetch(`/${META_GRAPH_VERSION}/${waba_id}/subscribed_apps`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    return {
      ok: true,
      waba_id,
      token_source: source,
      apps: (listing?.data ?? []) as Array<{
        whatsapp_business_api_data?: { id?: string; name?: string; link?: string };
      }>,
    };
  });

/** Remove a assinatura do app (útil para testar/desconectar). */
export const unsubscribeWabaFromApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabase = context.supabase as any;
    const { waba_id, token, source } = await resolveWabaToken(supabase, data.waba_ref_id);

    const res = await metaFetch(`/${META_GRAPH_VERSION}/${waba_id}/subscribed_apps`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    await supabase.from("whatsapp_onboarding_logs").insert({
      waba_ref_id: data.waba_ref_id,
      step: "unsubscribe_app",
      status: "success",
      payload: { res, token_source: source },
    });

    return { ok: true, waba_id, token_source: source, res };
  });
