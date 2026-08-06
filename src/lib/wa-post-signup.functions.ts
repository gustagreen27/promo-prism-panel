import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadConnectionSecure } from "@/lib/meta/wa-token-resolver.server";
import { graphJson, graphError, profileCompleteness, type ChecklistItem } from "@/lib/meta/wa-post-signup.server";

const idSchema = z.object({ connection_id: z.string().uuid() });

/** Estado ao vivo da integração recém-criada: número, webhooks, registro, perfil e templates. */
export const getPostSignupStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    const conn = await loadConnectionSecure(context.supabase, context.userId, data.connection_id);
    const token = conn.access_token;
    const appId = process.env.META_APP_ID ?? null;

    const [phone, subs, profile, templates] = await Promise.all([
      graphJson(
        token,
        `/${conn.phone_number_id}?fields=id,display_phone_number,verified_name,quality_rating,messaging_limit_tier,code_verification_status,status,name_status,platform_type`,
      ),
      conn.waba_id ? graphJson(token, `/${conn.waba_id}/subscribed_apps`) : Promise.resolve({ ok: false, status: 0, json: {} }),
      graphJson(
        token,
        `/${conn.phone_number_id}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`,
      ),
      conn.waba_id
        ? graphJson(token, `/${conn.waba_id}/message_templates?limit=200&fields=name,status`)
        : Promise.resolve({ ok: false, status: 0, json: {} }),
    ]);

    const ph = phone.json ?? {};
    const phoneStatus = String(ph?.status ?? "").toUpperCase();
    const verification = String(ph?.code_verification_status ?? "").toUpperCase();

    const apps: any[] = Array.isArray(subs.json?.data) ? subs.json.data : [];
    const subscribed = apps.some((a) =>
      appId ? String(a?.whatsapp_business_api_data?.id ?? "") === String(appId) : true,
    ) && apps.length > 0;

    const prof = profile.json?.data?.[0] ?? profile.json ?? {};
    const completeness = profileCompleteness(prof);

    const tpls: any[] = Array.isArray(templates.json?.data) ? templates.json.data : [];
    const approved = tpls.filter((t) => String(t?.status ?? "").toUpperCase() === "APPROVED").length;

    const checklist: ChecklistItem[] = [
      {
        key: "number",
        label: "Número conectado à Cloud API",
        state: phoneStatus === "CONNECTED" ? "ok" : phone.ok ? "pending" : "error",
        detail: phone.ok
          ? `${ph?.display_phone_number ?? "—"} • status ${phoneStatus || "—"} • verificação ${verification || "—"}`
          : graphError(phone.json, "Não foi possível consultar o número"),
      },
      {
        key: "webhook",
        label: "Webhooks assinados na WABA",
        state: subs.ok ? (subscribed ? "ok" : "pending") : "error",
        detail: subs.ok
          ? subscribed
            ? "Aplicativo assinado — mensagens e status chegarão automaticamente."
            : "Nenhum aplicativo assinado nesta WABA."
          : graphError(subs.json, "Falha ao consultar assinaturas"),
      },
      {
        key: "profile",
        label: "Perfil comercial preenchido",
        state: profile.ok ? (completeness.missing.length === 0 ? "ok" : "pending") : "error",
        detail: profile.ok
          ? `${completeness.filled}/${completeness.total} campos${completeness.missing.length ? ` • falta: ${completeness.missing.join(", ")}` : ""}`
          : graphError(profile.json, "Falha ao consultar o perfil"),
      },
      {
        key: "templates",
        label: "Templates de mensagem",
        state: templates.ok ? (approved > 0 ? "ok" : "pending") : "error",
        detail: templates.ok
          ? `${approved} aprovado(s) de ${tpls.length} template(s)`
          : graphError(templates.json, "Falha ao consultar templates"),
      },
    ];

    return {
      connection: {
        id: conn.id,
        display_phone: ph?.display_phone_number ?? conn.display_phone ?? null,
        verified_name: ph?.verified_name ?? conn.verified_name ?? null,
        phone_number_id: conn.phone_number_id,
        waba_id: conn.waba_id,
        quality_rating: ph?.quality_rating ?? null,
        messaging_limit_tier: ph?.messaging_limit_tier ?? null,
        platform_type: ph?.platform_type ?? null,
        status: phoneStatus || null,
        code_verification_status: verification || null,
      },
      needs_register: phoneStatus !== "CONNECTED",
      profile: {
        about: prof?.about ?? "",
        description: prof?.description ?? "",
        email: prof?.email ?? "",
        website: Array.isArray(prof?.websites) ? (prof.websites[0] ?? "") : "",
        vertical: prof?.vertical ?? "",
      },
      checklist,
    };
  });

/** Assina o app da Meta na WABA (idempotente). */
export const finishSubscribeWebhooks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    const conn = await loadConnectionSecure(context.supabase, context.userId, data.connection_id);
    if (!conn.waba_id) throw new Error("Esta conexão não tem WABA vinculada.");
    const res = await graphJson(conn.access_token, `/${conn.waba_id}/subscribed_apps`, { method: "POST" });
    if (!res.ok) throw new Error(graphError(res.json, "Falha ao assinar webhooks."));
    return { ok: true as const };
  });

/** Registra o número na Cloud API com PIN de verificação em duas etapas. */
export const finishRegisterNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    idSchema.extend({ pin: z.string().regex(/^\d{6}$/, "O PIN deve ter exatamente 6 dígitos.") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const conn = await loadConnectionSecure(context.supabase, context.userId, data.connection_id);
    const res = await graphJson(conn.access_token, `/${conn.phone_number_id}/register`, {
      method: "POST",
      body: JSON.stringify({ messaging_product: "whatsapp", pin: data.pin }),
    });
    const msg = graphError(res.json, "");
    const dupe = /already .*registered|already .*in use/i.test(msg) || String(res.json?.error?.code ?? "") === "133005";
    if (!res.ok && !dupe) throw new Error(msg || "Falha ao registrar o número.");
    await context.supabase.from("whatsapp_connections").update({ status: "ativo" }).eq("id", conn.id);
    return { ok: true as const, idempotent: dupe };
  });

/** Salva o perfil comercial do número. */
export const finishSaveBusinessProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    idSchema
      .extend({
        about: z.string().trim().max(139).optional(),
        description: z.string().trim().max(512).optional(),
        email: z.string().trim().max(128).optional(),
        website: z.string().trim().max(256).optional(),
        vertical: z.string().trim().max(64).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const conn = await loadConnectionSecure(context.supabase, context.userId, data.connection_id);
    const body: Record<string, any> = { messaging_product: "whatsapp" };
    if (data.about) body.about = data.about;
    if (data.description) body.description = data.description;
    if (data.email) body.email = data.email;
    if (data.website) body.websites = [data.website];
    if (data.vertical) body.vertical = data.vertical;
    const res = await graphJson(conn.access_token, `/${conn.phone_number_id}/whatsapp_business_profile`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(graphError(res.json, "Falha ao salvar o perfil comercial."));
    return { ok: true as const };
  });

/** Envia o template hello_world para validar a integração ponta a ponta. */
export const finishSendTestMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    idSchema.extend({ to: z.string().trim().regex(/^\+?\d{10,15}$/, "Informe o número com DDI e DDD.") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const conn = await loadConnectionSecure(context.supabase, context.userId, data.connection_id);
    const res = await graphJson(conn.access_token, `/${conn.phone_number_id}/messages`, {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: data.to.replace(/\D/g, ""),
        type: "template",
        template: { name: "hello_world", language: { code: "en_US" } },
      }),
    });
    if (!res.ok) throw new Error(graphError(res.json, "Falha ao enviar a mensagem de teste."));
    return { ok: true as const, message_id: res.json?.messages?.[0]?.id ?? null };
  });
