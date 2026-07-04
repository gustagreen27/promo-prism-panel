import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GRAPH_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

async function logStep(
  supabase: any,
  base: { waba_ref_id?: string | null; connection_id?: string | null; client_id?: string | null; project_id?: string | null },
  step: string,
  status: "ok" | "error",
  payload?: any,
  error?: string,
) {
  try {
    await supabase.from("whatsapp_onboarding_logs").insert({
      ...base,
      step,
      status,
      payload: payload ?? null,
      error: error ?? null,
    });
  } catch {
    /* logs are best-effort */
  }
}

/** Public config for the FB SDK. App ID and Config ID are non-secret (they appear on the browser). */
export const getEmbeddedSignupConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const appId = process.env.META_APP_ID;
    const configId = process.env.META_ES_CONFIG_ID;
    if (!appId || !configId) {
      throw new Error("META_APP_ID ou META_ES_CONFIG_ID não configurados.");
    }
    return { appId, configId, graphVersion: GRAPH_VERSION };
  });

const completeSchema = z.object({
  code: z.string().min(4),
  waba_id: z.string().min(1),
  phone_number_id: z.string().min(1),
  business_id: z.string().min(1).optional().nullable(),
  client_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  nome_interno: z.string().trim().min(1).max(120).optional(),
});

/**
 * Exchange the ES `code` for a customer access token, then upsert WABA + connection,
 * saving business_id, waba_id, phone_number_id, display_phone_number, display_name, quality_rating,
 * messaging_limit and status. All steps are logged in whatsapp_onboarding_logs.
 */
export const completeEmbeddedSignup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => completeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabase = context.supabase;
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    if (!appId || !appSecret) throw new Error("META_APP_ID/META_APP_SECRET não configurados.");

    const baseLog = {
      client_id: data.client_id ?? null,
      project_id: data.project_id ?? null,
      waba_ref_id: null as string | null,
      connection_id: null as string | null,
    };

    // 1) code -> access_token
    const tokenUrl = new URL(`${GRAPH}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("code", data.code);
    const tokRes = await fetch(tokenUrl.toString(), { method: "GET" });
    const tokJson: any = await tokRes.json().catch(() => ({}));
    if (!tokRes.ok || !tokJson.access_token) {
      await logStep(supabase, baseLog, "exchange_code", "error", tokJson, tokJson?.error?.message ?? `HTTP ${tokRes.status}`);
      throw new Error(tokJson?.error?.message ?? "Falha ao trocar código por token.");
    }
    const accessToken: string = tokJson.access_token;
    const expiresIn: number | undefined = tokJson.expires_in;
    const tokenExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
    await logStep(supabase, baseLog, "exchange_code", "ok", { has_expiry: !!expiresIn });

    const gfetch = async (path: string, init?: RequestInit) =>
      fetch(`${GRAPH}${path}`, {
        ...init,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, ...(init?.headers || {}) },
      });

    // 2) fetch phone info
    const phRes = await gfetch(`/${data.phone_number_id}?fields=id,display_phone_number,verified_name,quality_rating,messaging_limit_tier,code_verification_status,status`);
    const phJson: any = await phRes.json().catch(() => ({}));
    if (!phRes.ok) {
      await logStep(supabase, baseLog, "fetch_phone", "error", phJson, phJson?.error?.message);
      throw new Error(phJson?.error?.message ?? "Falha ao buscar dados do número.");
    }
    await logStep(supabase, baseLog, "fetch_phone", "ok", phJson);

    // 3) fetch WABA info for display name
    const wRes = await gfetch(`/${data.waba_id}?fields=id,name,currency,timezone_id,message_template_namespace,on_behalf_of_business_info`);
    const wJson: any = await wRes.json().catch(() => ({}));
    if (!wRes.ok) {
      await logStep(supabase, baseLog, "fetch_waba", "error", wJson, wJson?.error?.message);
    } else {
      await logStep(supabase, baseLog, "fetch_waba", "ok", wJson);
    }
    const wabaName: string | undefined = wJson?.name;
    const businessId: string | null =
      data.business_id ?? wJson?.on_behalf_of_business_info?.id ?? null;

    // 4) subscribe our app to WABA webhooks (best effort)
    const subRes = await gfetch(`/${data.waba_id}/subscribed_apps`, { method: "POST" });
    const subJson: any = await subRes.json().catch(() => ({}));
    await logStep(supabase, baseLog, "subscribe_app", subRes.ok ? "ok" : "error", subJson, subRes.ok ? undefined : subJson?.error?.message);

    // 5) upsert WABA
    const nomeInterno = data.nome_interno?.trim() || wabaName || `WABA ${data.waba_id.slice(-6)}`;
    const existing = await supabase.from("whatsapp_wabas").select("id").eq("waba_id", data.waba_id).maybeSingle();
    let wabaRefId: string;
    if (existing.data?.id) {
      wabaRefId = existing.data.id;
      await supabase.from("whatsapp_wabas").update({
        nome_interno: nomeInterno,
        business_id: businessId,
        access_token: accessToken,
        token_expires_at: tokenExpiresAt,
        onboarded_via: "embedded_signup",
        onboarded_at: new Date().toISOString(),
        status: "ativo",
        client_id: data.client_id ?? null,
        project_id: data.project_id ?? null,
      }).eq("id", wabaRefId);
    } else {
      const ins = await supabase.from("whatsapp_wabas").insert({
        nome_interno: nomeInterno,
        waba_id: data.waba_id,
        business_id: businessId,
        access_token: accessToken,
        token_expires_at: tokenExpiresAt,
        onboarded_via: "embedded_signup",
        onboarded_at: new Date().toISOString(),
        status: "ativo",
        client_id: data.client_id ?? null,
        project_id: data.project_id ?? null,
      }).select("id").single();
      if (ins.error) {
        await logStep(supabase, baseLog, "upsert_waba", "error", ins.error, ins.error.message);
        throw ins.error;
      }
      wabaRefId = ins.data.id;
    }
    baseLog.waba_ref_id = wabaRefId;
    await logStep(supabase, baseLog, "upsert_waba", "ok", { waba_ref_id: wabaRefId });

    // 6) upsert connection (number)
    const connExisting = await supabase
      .from("whatsapp_connections")
      .select("id")
      .eq("phone_number_id", data.phone_number_id)
      .maybeSingle();

    const connPayload = {
      waba_ref_id: wabaRefId,
      waba_id: data.waba_id,
      business_id: businessId,
      phone_number_id: data.phone_number_id,
      display_phone: phJson?.display_phone_number ?? null,
      display_name: phJson?.verified_name ?? null,
      name: phJson?.verified_name ?? phJson?.display_phone_number ?? `Número ${data.phone_number_id.slice(-6)}`,
      quality_rating: phJson?.quality_rating ?? null,
      messaging_limit: phJson?.messaging_limit_tier ?? null,
      access_token: accessToken,
      graph_api_version: GRAPH_VERSION,
      provider: "meta_cloud",
      status: phJson?.code_verification_status === "VERIFIED" ? "ativo" : "aguardando_verificacao",
      client_id: data.client_id ?? null,
      project_id: data.project_id ?? null,
    };

    let connectionId: string;
    if (connExisting.data?.id) {
      connectionId = connExisting.data.id;
      const { error } = await supabase.from("whatsapp_connections").update(connPayload).eq("id", connectionId);
      if (error) {
        await logStep(supabase, { ...baseLog, connection_id: connectionId }, "upsert_connection", "error", error, error.message);
        throw error;
      }
    } else {
      const { data: c, error } = await supabase.from("whatsapp_connections").insert(connPayload).select("id").single();
      if (error) {
        await logStep(supabase, baseLog, "upsert_connection", "error", error, error.message);
        throw error;
      }
      connectionId = c.id;
    }
    baseLog.connection_id = connectionId;
    await logStep(supabase, baseLog, "upsert_connection", "ok", { connection_id: connectionId, status: connPayload.status });

    return {
      ok: true,
      waba_ref_id: wabaRefId,
      connection_id: connectionId,
      display_phone_number: phJson?.display_phone_number ?? null,
      verified_name: phJson?.verified_name ?? null,
      status: connPayload.status,
    };
  });

export const listOnboardingLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ waba_ref_id: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let q = context.supabase
      .from("whatsapp_onboarding_logs")
      .select("id,step,status,payload,error,created_at,waba_ref_id,connection_id,client_id,project_id")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.waba_ref_id) q = q.eq("waba_ref_id", data.waba_ref_id);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });
