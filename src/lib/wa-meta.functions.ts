import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { metaEgressFetch } from "@/lib/meta/meta-egress";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

async function logAction(supabase: any, action: string, payload: any) {
  try {
    await supabase.from("whatsapp_webhook_logs").insert({
      event_type: `admin.${action}`,
      payload,
      processed: true,
    });
  } catch { /* best-effort */ }
}

/** Envia template para aprovação na Meta */
export const submitTemplateForApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ template_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    const { data: tpl, error: tErr } = await context.supabase
      .from("whatsapp_templates")
      .select("*, waba:whatsapp_wabas(id,waba_id,nome_interno,access_token)")
      .eq("id", data.template_id)
      .single();
    if (tErr) throw tErr;
    if (!tpl?.waba?.waba_id) throw new Error("Template sem WABA vinculada. Selecione uma WABA antes de enviar para aprovação.");

    const cat = String(tpl.category || "").toUpperCase();
    if (!["MARKETING", "UTILITY", "AUTHENTICATION"].includes(cat)) {
      throw new Error("Categoria inválida. Selecione MARKETING, UTILITY ou AUTHENTICATION.");
    }

    const { buildTemplateComponents, submitTemplateToMeta, uploadHeaderHandle } = await import("@/lib/wa-meta.server");

    // Mídia de cabeçalho: a Meta exige um handle da Resumable Upload API,
    // não uma URL (erro "Invalid parameter" subcode 2388273).
    let headerMediaHandle: string | null = null;
    const ht = String(tpl.header_type || "").toLowerCase();
    if (["image", "video", "document"].includes(ht) && tpl.header_media_url) {
      const url = String(tpl.header_media_url).trim();
      headerMediaHandle = /^https?:\/\//i.test(url)
        ? await uploadHeaderHandle({ mediaUrl: url, accessToken: tpl.waba.access_token ?? null })
        : url;
    }

    let components;
    try {
      components = buildTemplateComponents({ ...tpl, header_media_handle: headerMediaHandle });
    } catch (e: any) {
      throw new Error(e?.message ?? "Falha ao montar componentes do template.");
    }


    const result = await submitTemplateToMeta({
      wabaId: tpl.waba.waba_id,
      name: tpl.name,
      category: cat as any,
      language: tpl.language,
      components,
      parameterFormat: (components as any).parameterFormat,
      accessToken: tpl.waba.access_token ?? null,
    });


    await logAction(context.supabase, "submit_template", { template_id: tpl.id, result });

    if (!result.ok) {
      await context.supabase.from("whatsapp_templates").update({
        rejection_reason: result.error,
        history: [
          ...(Array.isArray(tpl.history) ? tpl.history : []),
          { at: new Date().toISOString(), action: "submit_failed", detail: result.error },
        ],
      }).eq("id", tpl.id);
      throw new Error(result.error);
    }

    const statusMap: Record<string, string> = {
      APPROVED: "approved", PENDING: "pending", REJECTED: "rejected", PAUSED: "paused", DISABLED: "disabled",
    };

    await context.supabase.from("whatsapp_templates").update({
      meta_template_id: result.data.id,
      status: (statusMap[result.data.status] || "pending") as any,
      submitted_at: new Date().toISOString(),
      rejection_reason: null,
      history: [
        ...(Array.isArray(tpl.history) ? tpl.history : []),
        { at: new Date().toISOString(), action: "submitted", detail: result.data },
      ],
    }).eq("id", tpl.id);

    return { ok: true, meta_id: result.data.id, status: result.data.status };
  });

/** Consulta status atual do template na Meta e sincroniza */
export const refreshTemplateStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ template_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: tpl, error } = await context.supabase
      .from("whatsapp_templates")
      .select("*, waba:whatsapp_wabas(waba_id,access_token)")
      .eq("id", data.template_id)
      .single();
    if (error) throw error;
    if (!tpl?.waba?.waba_id) throw new Error("Template sem WABA vinculada.");

    const { fetchTemplateStatusFromMeta } = await import("@/lib/wa-meta.server");
    const result = await fetchTemplateStatusFromMeta({
      wabaId: tpl.waba.waba_id, name: tpl.name, language: tpl.language,
      accessToken: tpl.waba.access_token ?? null,
    });

    await logAction(context.supabase, "refresh_template", { template_id: tpl.id, result });
    if (!result.ok) throw new Error(result.error);

    const statusMap: Record<string, string> = {
      APPROVED: "approved", PENDING: "pending", REJECTED: "rejected", PAUSED: "paused", DISABLED: "disabled",
    };
    const newStatus = statusMap[result.data.status] || "pending";
    const isFinal = ["approved", "rejected"].includes(newStatus);
    await context.supabase.from("whatsapp_templates").update({
      meta_template_id: result.data.id,
      status: newStatus as any,
      rejection_reason: result.data.rejected_reason ?? null,
      reviewed_at: isFinal ? new Date().toISOString() : tpl.reviewed_at,
    }).eq("id", tpl.id);

    return { ok: true, status: newStatus };
  });

/** Envia mensagem de teste 1:1 */
export const sendTestTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    connection_id: z.string().uuid(),
    to: z.string().trim().min(8).max(20),
    template_name: z.string().trim().min(1),
    language: z.string().trim().min(2).default("pt_BR"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: conn, error } = await context.supabase
      .from("whatsapp_connections")
      .select("phone_number_id,graph_api_version")
      .eq("id", data.connection_id).single();
    if (error) throw error;
    if (!conn?.phone_number_id) throw new Error("Número sem phone_number_id.");

    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!token) throw new Error("WHATSAPP_ACCESS_TOKEN não configurado.");
    const ver = conn.graph_api_version || "v21.0";
    const to = data.to.replace(/\D/g, "");
    const res = await metaEgressFetch(`https://graph.facebook.com/${ver}/${conn.phone_number_id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        messaging_product: "whatsapp", to, type: "template",
        template: { name: data.template_name, language: { code: data.language } },
      }),
    });
    const json: any = await res.json().catch(() => ({}));
    await logAction(context.supabase, "test_send", { data, response: json });
    if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
    return { ok: true, meta_message_id: json?.messages?.[0]?.id };
  });

/** Importa números de uma WABA da Meta */
export const importWabaNumbers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ waba_ref_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: waba, error } = await context.supabase
      .from("whatsapp_wabas").select("id,waba_id,business_id,client_id,project_id").eq("id", data.waba_ref_id).single();
    if (error) throw error;
    if (!waba?.waba_id) throw new Error("WABA sem waba_id.");

    const { fetchWabaPhoneNumbers } = await import("@/lib/wa-meta.server");
    const nums = await fetchWabaPhoneNumbers(waba.waba_id);

    let upserted = 0;
    for (const n of nums) {
      const payload = {
        waba_ref_id: waba.id,
        waba_id: waba.waba_id,
        business_id: waba.business_id,
        client_id: waba.client_id,
        project_id: waba.project_id,
        phone_number_id: n.id,
        display_phone: n.display_phone_number,
        display_name: n.verified_name,
        nome_interno: n.verified_name || n.display_phone_number,
        name: n.verified_name || n.display_phone_number,
        phone: (n.display_phone_number || "").replace(/\D/g, ""),
        provider: "cloud",
        quality_rating: n.quality_rating,
        messaging_limit: n.messaging_limit_tier,
        status: "active",
      };
      const { error: upErr } = await context.supabase
        .from("whatsapp_connections")
        .upsert(payload, { onConflict: "phone_number_id" });
      if (!upErr) upserted++;
    }
    await logAction(context.supabase, "import_numbers", { waba_id: waba.id, count: upserted });
    return { imported: upserted, total: nums.length };
  });
