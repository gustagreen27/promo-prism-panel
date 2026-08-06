import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { GRAPH_VERSION, GRAPH_BASE as GRAPH } from "@/lib/meta/graph-version";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

/** Returns whether the caller is admin and their primary workspace_id (owner/admin role). */
async function resolveCaller(ctx: { supabase: any; userId: string }): Promise<{ isAdmin: boolean; workspaceId: string | null }> {
  const [{ data: isAdmin }, ws] = await Promise.all([
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" }),
    ctx.supabase
      .from("workspace_members")
      .select("workspace_id, role, workspaces!inner(created_at)")
      .eq("user_id", ctx.userId)
      .in("role", ["owner", "admin"])
      .order("workspaces(created_at)", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  return { isAdmin: !!isAdmin, workspaceId: (ws.data as any)?.workspace_id ?? null };
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
    // Any authenticated user (admin OR workspace owner) can bootstrap the SDK.
    const caller = await resolveCaller(context);
    if (!caller.isAdmin && !caller.workspaceId) throw new Error("Forbidden");
    const appId = process.env.META_APP_ID;
    const configId = process.env.META_ES_CONFIG_ID;
    if (!appId || !configId) {
      throw new Error("META_APP_ID ou META_ES_CONFIG_ID não configurados.");
    }
    // Versão do JS SDK do Facebook (browser) é independente da versão usada
    // nas chamadas server-side ao Graph. Padrão v26.0 conforme doc do ES.
    const sdkVersion = (process.env.META_JS_SDK_VERSION || "v26.0").trim();
    return { appId, configId, graphVersion: GRAPH_VERSION, sdkVersion };
  });

const completeSchema = z.object({
  code: z.string().min(4),
  waba_id: z.string().min(1),
  phone_number_id: z.string().min(1),
  business_id: z.string().min(1).optional().nullable(),
  client_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  nome_interno: z.string().trim().min(1).max(120).optional(),
  onboarding_mode: z.enum(["standard", "coexistence"]).optional().default("standard"),
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
    const caller = await resolveCaller(context);
    if (!caller.isAdmin && !caller.workspaceId) throw new Error("Forbidden");
    // Non-admins are always scoped to their own workspace; admin passes client/project explicitly.
    const scopedClientId = caller.isAdmin ? (data.client_id ?? null) : null;
    const scopedProjectId = caller.isAdmin ? (data.project_id ?? null) : null;
    // Admin: resolvido depois, a partir do Business Manager retornado pela Meta.
    let scopedWorkspaceId: string | null = caller.isAdmin ? null : caller.workspaceId;

    const supabase = context.supabase;
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    if (!appId || !appSecret) throw new Error("META_APP_ID/META_APP_SECRET não configurados.");

    const baseLog = {
      client_id: scopedClientId,
      project_id: scopedProjectId,
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

    // 3b) Validate that phone_number_id really belongs to the returned WABA (PHONE_ID_WRONG_WABA guard)
    const pnListRes = await gfetch(`/${data.waba_id}/phone_numbers?fields=id,display_phone_number&limit=200`);
    const pnListJson: any = await pnListRes.json().catch(() => ({}));
    const phoneBelongs =
      pnListRes.ok && Array.isArray(pnListJson?.data)
        ? pnListJson.data.some((p: any) => String(p.id) === String(data.phone_number_id))
        : false;
    if (!phoneBelongs) {
      await logStep(supabase, baseLog, "validate_phone_waba", "error", pnListJson, "PHONE_ID_WRONG_WABA");
      throw new Error(
        "PHONE_ID_WRONG_WABA: o número informado não pertence à WABA retornada pelo onboarding. Nada foi salvo.",
      );
    }
    await logStep(supabase, baseLog, "validate_phone_waba", "ok", { count: pnListJson.data.length });

    // 4) subscribe our app to WABA webhooks (best effort)
    const subRes = await gfetch(`/${data.waba_id}/subscribed_apps`, { method: "POST" });
    const subJson: any = await subRes.json().catch(() => ({}));
    const subscribeOk = subRes.ok;
    await logStep(supabase, baseLog, "subscribe_app", subscribeOk ? "ok" : "error", subJson, subscribeOk ? undefined : subJson?.error?.message);

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
        client_id: scopedClientId,
        project_id: scopedProjectId,
        workspace_id: scopedWorkspaceId,
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
        client_id: scopedClientId,
        project_id: scopedProjectId,
        workspace_id: scopedWorkspaceId,
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

    const isCoexistence = data.onboarding_mode === "coexistence";
    const coexistenceStatus: string | null = isCoexistence
      ? subscribeOk
        ? "connected"
        : "attention_required"
      : null;

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
      // Never silently fall back to the global token for ES-provisioned connections.
      use_global_token: false,
      graph_api_version: GRAPH_VERSION,
      provider: "meta_cloud",
      status: phJson?.code_verification_status === "VERIFIED" ? "ativo" : "aguardando_verificacao",
      client_id: scopedClientId,
      project_id: scopedProjectId,
      workspace_id: scopedWorkspaceId,
      visibility: caller.isAdmin ? "internal" : "workspace",
      onboarding_mode: data.onboarding_mode,
      coexistence_status: coexistenceStatus,
      embedded_signup_completed_at: new Date().toISOString(),
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

    // 6b) STANDARD only: register phone number in Cloud API (idempotent).
    // - Pré-requisito real do /register: o número já ter tido o código verificado (VERIFIED).
    //   NÃO exigimos status=CONNECTED antes — CONNECTED é justamente o resultado do /register.
    // - Se a Meta responder "already registered / already in use" (133005), tratamos como OK.
    // - PIN vem de META_ES_REGISTER_PIN; ausente = log e segue (não lança).
    if (!isCoexistence) {
      const verificationStatus = String(phJson?.code_verification_status || "").toUpperCase();
      const phoneStatus = String(phJson?.status || "").toUpperCase();
      const alreadyConnected = phoneStatus === "CONNECTED";
      const canRegister = verificationStatus === "VERIFIED";
      const pin = process.env.META_ES_REGISTER_PIN;
      if (alreadyConnected) {
        await logStep(supabase, baseLog, "register_phone", "ok", { skipped: true, reason: "already_connected", phone_status: phoneStatus });
      } else if (!canRegister) {
        await logStep(supabase, baseLog, "register_phone", "error", { code_verification_status: verificationStatus, phone_status: phoneStatus }, "Número não verificado (code_verification_status != VERIFIED) — /register não será chamado.");
      } else if (!pin) {
        await logStep(supabase, baseLog, "register_phone", "error", null, "META_ES_REGISTER_PIN não configurado — número não será auto-registrado.");
      } else {
        try {
          const regRes = await gfetch(`/${data.phone_number_id}/register`, {
            method: "POST",
            body: JSON.stringify({ messaging_product: "whatsapp", pin }),
          });
          const regJson: any = await regRes.json().catch(() => ({}));
          const errMsg: string = regJson?.error?.message || "";
          const errCode: string = String(regJson?.error?.code || "");
          const isDupe = /already .*registered|already .*in use/i.test(errMsg) || errCode === "133005";
          if (regRes.ok || isDupe) {
            await logStep(supabase, baseLog, "register_phone", "ok", { idempotent: isDupe, http: regRes.status });
          } else {
            await logStep(supabase, baseLog, "register_phone", "error", regJson, errMsg || `HTTP ${regRes.status}`);
          }
        } catch (e: any) {
          await logStep(supabase, baseLog, "register_phone", "error", null, e?.message ?? "register call failed");
        }
      }
    }


    // 7) auto-sync full WABA (best-effort) — traz eventuais outros números da mesma WABA
    try {
      const { _syncOneWabaInternal } = await import("@/lib/wa-meta-sync.functions");
      const syncStats = await _syncOneWabaInternal(supabase, {
        id: wabaRefId,
        waba_id: data.waba_id,
        business_id: businessId,
        access_token: accessToken,
        client_id: scopedClientId,
        project_id: scopedProjectId,
        workspace_id: scopedWorkspaceId,
      });
      await logStep(supabase, baseLog, "post_onboarding_sync", "ok", syncStats);
    } catch (e: any) {
      await logStep(supabase, baseLog, "post_onboarding_sync", "error", null, e?.message);
    }

    return {
      ok: true as const,
      waba_ref_id: wabaRefId,
      connection_id: connectionId,
      display_phone_number: (phJson?.display_phone_number ?? null) as string | null,
      verified_name: (phJson?.verified_name ?? null) as string | null,
      status: connPayload.status,
      onboarding_mode: data.onboarding_mode,
      coexistence_status: coexistenceStatus,
      webhook_subscribed: subscribeOk,
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

/** List the caller's workspace WhatsApp numbers (safe for the panel UI). */
export const listMyWorkspaceNumbers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await resolveCaller(context);
    if (!caller.workspaceId) return [];
    const { data, error } = await context.supabase
      .from("whatsapp_connections")
      .select("id,name,display_name,display_phone,phone_number_id,waba_id,status,quality_rating,messaging_limit,created_at")
      .eq("workspace_id", caller.workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });
