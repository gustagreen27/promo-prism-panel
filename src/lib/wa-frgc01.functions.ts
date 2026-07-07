import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  connectionId: z.string().uuid(),
  to: z.string().min(6),
  imageUrl: z.string().url(),
  mediaType: z.enum(["image", "video"]).optional(),
  nomeCliente: z.string().min(1),
  informacaoPrincipal: z.string().min(1),
  mensagemComplementar: z.string().min(1),
  textoAcao: z.string().min(1),
  urlParametro: z.string().min(1),
  campaignId: z.string().uuid().optional(),
  recipientId: z.string().uuid().optional(),
});

export type SendFrgc01Response =
  | { ok: true; metaMessageId: string; status: string; logId: string }
  | { ok: false; error: string; code?: string; hint?: string; logId?: string };

function explain(code?: string, msg?: string) {
  const c = String(code ?? "");
  const m = String(msg ?? "").toLowerCase();
  if (c === "190") return "Access Token expirado ou inválido. Renove nas Configurações do WhatsApp.";
  if (c === "10" || c === "200") return "Permissões insuficientes no token (whatsapp_business_messaging).";
  if (c === "100") return "Parâmetros inválidos — verifique phone_number_id, número destino e variáveis.";
  if (c === "132000") {
    if (m.includes("number of parameters") || m.includes("parameters does not match")) {
      return "Nº de variáveis enviadas ≠ do que o template aprovado no Meta espera. Sincronize os templates e revise o corpo.";
    }
    return "Template não encontrado no idioma enviado. Sincronize templates e confirme o idioma aprovado.";
  }
  if (c === "132001") return "Template inexistente ou não aprovado.";
  if (c === "132015") return "Template pausado por baixa qualidade — aguarde ou submeta uma nova versão.";
  if (c === "131047") return "Fora da janela de 24h ou destinatário sem opt-in.";
  return undefined;
}

export const sendFrgc01 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => InputSchema.parse(d))
  .handler(async ({ data, context }): Promise<SendFrgc01Response> => {
    const { supabase, userId } = context;

    // Only admins
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) return { ok: false, error: "Forbidden" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendWhatsAppTemplateFrgc01, buildFrgc01Payload } = await import("@/lib/wa-send.server");

    const { data: conn, error: cErr } = await supabaseAdmin
      .from("whatsapp_connections")
      .select("id, phone_number_id, access_token, graph_api_version, waba_id")
      .eq("id", data.connectionId)
      .maybeSingle();

    if (cErr || !conn) return { ok: false, error: "Conexão WhatsApp não encontrada" };
    const accessToken = conn.access_token || process.env.WHATSAPP_ACCESS_TOKEN;
    if (!conn.phone_number_id || !accessToken) {
      return { ok: false, error: "Conexão sem phone_number_id ou access_token configurados (defina em whatsapp_connections.access_token ou no secret WHATSAPP_ACCESS_TOKEN)" };
    }

    // Per-WABA template mapping (Fagner Jequié usa dsadsa_01 para imagem)
    const mediaType = data.mediaType ?? "image";
    const wabaTemplateMap: Record<string, { image: string; video: string }> = {
      "37857640713834515": { image: "dsadsa_01", video: "dsadsa_01" },
    };
    const perWaba = conn.waba_id ? wabaTemplateMap[String(conn.waba_id)] : undefined;
    const templateName = perWaba
      ? perWaba[mediaType]
      : mediaType === "video"
        ? "fdsda_01"
        : "frgc_01";

    const to = data.to.replace(/\D/g, "");

    // Descobre idioma + nº de variáveis do template real (evita erro Meta #132000).
    let languageCode = "pt_BR";
    let bodyVarCount = 4;
    let includeButton = true;
    try {
      const { data: tplRow } = await supabaseAdmin
        .from("whatsapp_templates")
        .select("language, variables, buttons, status")
        .eq("name", templateName)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (tplRow?.language) languageCode = tplRow.language as string;
      if (Array.isArray((tplRow as any)?.variables)) {
        bodyVarCount = Math.min(Math.max(((tplRow as any).variables as any[]).length, 0), 4);
      }
      const btns = (tplRow as any)?.buttons;
      if (Array.isArray(btns)) {
        includeButton = btns.some((b: any) => (b?.type ?? "").toString().toUpperCase() === "URL");
      }
    } catch {
      // Ignora — usa defaults.
    }

    const requestPayload = buildFrgc01Payload({
      phoneNumberId: conn.phone_number_id,
      accessToken: "***",
      graphVersion: conn.graph_api_version || "v25.0",
      to,
      imageUrl: data.imageUrl,
      mediaType: data.mediaType,
      nomeCliente: data.nomeCliente,
      informacaoPrincipal: data.informacaoPrincipal,
      mensagemComplementar: data.mensagemComplementar,
      textoAcao: data.textoAcao,
      urlParametro: data.urlParametro,
      templateName,
      languageCode,
      bodyVarCount,
      includeButton,
    });

    const result = await sendWhatsAppTemplateFrgc01({
      phoneNumberId: conn.phone_number_id,
      accessToken: accessToken,
      graphVersion: conn.graph_api_version || "v25.0",
      to,
      imageUrl: data.imageUrl,
      mediaType: data.mediaType,
      nomeCliente: data.nomeCliente,
      informacaoPrincipal: data.informacaoPrincipal,
      mensagemComplementar: data.mensagemComplementar,
      textoAcao: data.textoAcao,
      urlParametro: data.urlParametro,
      templateName,
      languageCode,
      bodyVarCount,
      includeButton,
    });

    const nowIso = new Date().toISOString();

    const logRow = {
      campaign_id: data.campaignId ?? null,
      recipient_id: data.recipientId ?? null,
      connection_id: conn.id,
      to_phone: to,
      template_name: templateName,

      language_code: "en",
      request_payload: requestPayload,
      response_payload: result.raw ?? null,
      meta_message_id: result.ok ? result.metaMessageId : null,
      message_status: result.ok ? result.status : "failed",
      failed_reason: result.ok ? null : result.error,
      error_code: !result.ok ? result.code ?? null : null,
      http_status: result.httpStatus ?? null,
      sent_at: result.ok ? nowIso : null,
    };

    const { data: log } = await supabaseAdmin
      .from("message_logs")
      .insert(logRow)
      .select("id")
      .single();

    if (data.recipientId) {
      if (result.ok) {
        await supabaseAdmin
          .from("campaign_recipients")
          .update({
            status: "sent",
            meta_message_id: result.metaMessageId,
            sent_at: nowIso,
          })
          .eq("id", data.recipientId);
      } else {
        await supabaseAdmin
          .from("campaign_recipients")
          .update({
            status: "failed",
            failed_at: nowIso,
            failed_reason: result.error,
            error_code: result.code ?? null,
          })
          .eq("id", data.recipientId);
      }
    }

    if (result.ok) {
      return { ok: true, metaMessageId: result.metaMessageId, status: result.status, logId: log?.id ?? "" };
    }
    return {
      ok: false,
      error: result.error,
      code: result.code,
      hint: explain(result.code),
      logId: log?.id,
    };
  });

export const getMessageLogStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ logId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("message_logs")
      .select("id, meta_message_id, message_status, failed_reason, error_code, sent_at, updated_at")
      .eq("id", data.logId)
      .maybeSingle();
    return row;
  });
