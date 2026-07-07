import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  connectionId: z.string().uuid(),
  templateId: z.string().uuid(),
  to: z.string().min(6),
  // body variables: { "1": "Fulano", "2": "R$ 100", ... }
  bodyParams: z.record(z.string(), z.string()).default({}),
  // button URL variables per button index (only URL buttons with {{n}} need this)
  buttonUrlParams: z.record(z.string(), z.string()).default({}),
  // header media url (only when template has IMAGE/VIDEO/DOCUMENT header)
  headerMediaUrl: z.string().url().optional().nullable(),
  // header text params ({{1}} in header text)
  headerTextParam: z.string().optional().nullable(),
  campaignId: z.string().uuid().optional(),
  recipientId: z.string().uuid().optional(),
});

export type SendGenericResponse =
  | { ok: true; metaMessageId: string; status: string; logId: string }
  | { ok: false; error: string; code?: string; logId?: string };

function explain(code?: string) {
  const c = String(code ?? "");
  if (c === "190") return "Access Token expirado ou inválido.";
  if (c === "10" || c === "200") return "Permissões insuficientes no token.";
  if (c === "100") return "Parâmetros inválidos — verifique variáveis e destino.";
  if (c === "132000" || c === "132001") return "Template inexistente ou não aprovado para este idioma.";
  if (c === "131047") return "Fora da janela de 24h ou destinatário sem opt-in.";
  return undefined;
}

export const sendGenericTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => InputSchema.parse(d))
  .handler(async ({ data, context }): Promise<SendGenericResponse> => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) return { ok: false, error: "Forbidden" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: tpl, error: tErr } = await supabaseAdmin
      .from("whatsapp_templates")
      .select("id, connection_id, waba_ref_id, meta_template_id, name, language, header_type, buttons, body, raw")
      .eq("id", data.templateId)
      .maybeSingle();
    if (tErr || !tpl) return { ok: false, error: "Template não encontrado" };

    const { data: requestedConn, error: cErr } = await supabaseAdmin
      .from("whatsapp_connections")
      .select("id, phone_number_id, access_token, graph_api_version, waba_id, waba_ref_id")
      .eq("id", data.connectionId)
      .maybeSingle();
    if (cErr || !requestedConn) return { ok: false, error: "Conexão WhatsApp não encontrada" };

    let conn = requestedConn;
    if (tpl.waba_ref_id && requestedConn.waba_ref_id && tpl.waba_ref_id !== requestedConn.waba_ref_id) {
      const { data: sameWabaConn } = await supabaseAdmin
        .from("whatsapp_connections")
        .select("id, phone_number_id, access_token, graph_api_version, waba_id, waba_ref_id")
        .eq("waba_ref_id", tpl.waba_ref_id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (sameWabaConn) conn = sameWabaConn;
    } else if (tpl.connection_id && tpl.connection_id !== requestedConn.id && !tpl.waba_ref_id) {
      const { data: templateConn } = await supabaseAdmin
        .from("whatsapp_connections")
        .select("id, phone_number_id, access_token, graph_api_version, waba_id, waba_ref_id")
        .eq("id", tpl.connection_id)
        .maybeSingle();
      if (templateConn) conn = templateConn;
    }

    const accessToken = conn.access_token || process.env.WHATSAPP_ACCESS_TOKEN;
    if (!conn.phone_number_id || !accessToken) {
      return { ok: false, error: "Conexão sem phone_number_id ou access_token" };
    }

    const to = data.to.replace(/\D/g, "");
    const graphVersion = conn.graph_api_version || "v25.0";
    const url = `https://graph.facebook.com/${graphVersion}/${conn.phone_number_id}/messages`;

    let templateName = String(tpl.name ?? "");
    let languageCode = String(tpl.language ?? "en");
    let headerType = (tpl.header_type ?? "").toString().toUpperCase();
    let templateButtons = Array.isArray(tpl.buttons) ? (tpl.buttons as any[]) : [];

    if (conn.waba_id) {
      try {
        const metaUrl = `https://graph.facebook.com/${graphVersion}/${conn.waba_id}/message_templates?limit=200&fields=name,status,language,category,components,parameter_format`;
        const metaRes = await fetch(metaUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
        const metaJson: any = await metaRes.json().catch(() => ({}));
        const metaTemplates = Array.isArray(metaJson?.data) ? metaJson.data : [];
        const metaTemplate = metaTemplates.find((t: any) => tpl.meta_template_id && String(t.id) === String(tpl.meta_template_id))
          ?? metaTemplates.find((t: any) => String(t?.name ?? "").toLowerCase() === templateName.toLowerCase() && String(t?.status ?? "").toUpperCase() === "APPROVED")
          ?? metaTemplates.find((t: any) => String(t?.name ?? "").toLowerCase() === templateName.toLowerCase());
        if (metaTemplate) {
          templateName = String(metaTemplate.name ?? templateName);
          languageCode = String(metaTemplate.language ?? languageCode);
          const metaComponents = Array.isArray(metaTemplate.components) ? metaTemplate.components : [];
          const metaHeader = metaComponents.find((c: any) => String(c?.type ?? "").toUpperCase() === "HEADER");
          const metaButtons = metaComponents.find((c: any) => String(c?.type ?? "").toUpperCase() === "BUTTONS");
          headerType = String(metaHeader?.format ?? headerType).toUpperCase();
          templateButtons = Array.isArray(metaButtons?.buttons) ? metaButtons.buttons : templateButtons;
          await supabaseAdmin
            .from("whatsapp_templates")
            .update({
              name: templateName,
              language: languageCode,
              header_type: headerType ? headerType.toLowerCase() : null,
              buttons: templateButtons,
              raw: metaTemplate,
              last_synced_at: new Date().toISOString(),
            })
            .eq("id", tpl.id);
        }
      } catch {
        // If Meta lookup fails, keep the locally saved template and send normally.
      }
    }

    // Build components
    const components: any[] = [];

    if (headerType === "IMAGE" && data.headerMediaUrl) {
      components.push({ type: "header", parameters: [{ type: "image", image: { link: data.headerMediaUrl } }] });
    } else if (headerType === "VIDEO" && data.headerMediaUrl) {
      components.push({ type: "header", parameters: [{ type: "video", video: { link: data.headerMediaUrl } }] });
    } else if (headerType === "DOCUMENT" && data.headerMediaUrl) {
      components.push({ type: "header", parameters: [{ type: "document", document: { link: data.headerMediaUrl } }] });
    } else if (headerType === "TEXT" && data.headerTextParam) {
      components.push({ type: "header", parameters: [{ type: "text", text: data.headerTextParam }] });
    }

    const bodyKeys = Object.keys(data.bodyParams)
      .filter((k) => /^\d+$/.test(k))
      .sort((a, b) => Number(a) - Number(b));
    if (bodyKeys.length) {
      components.push({
        type: "body",
        parameters: bodyKeys.map((k) => ({ type: "text", text: String(data.bodyParams[k] ?? "") })),
      });
    }

    // Buttons: attach URL params for dynamic URL buttons. Some older local rows missed the URL,
    // so if the user supplied a parameter for a URL button we still send it.
    const btns = templateButtons;
    for (let i = 0; i < btns.length; i++) {
      const b = btns[i] ?? {};
      const type = String(b.type ?? "").toLowerCase();
      if (type !== "url") continue;
      const urlTpl = String(b.url ?? "");
      const hasVar = /\{\{(\d+)\}\}/.test(urlTpl);
      const hasExample = Array.isArray(b.example) ? b.example.length > 0 : !!b.example;
      const param = (data.buttonUrlParams[String(i)] ?? data.buttonUrlParams["0"] ?? "").trim();
      if (!param && (hasVar || hasExample || !urlTpl)) {
        return { ok: false, error: `Preencha a variável do botão "${b.text ?? `#${i + 1}`}".` };
      }
      if (!param) continue;
      components.push({
        type: "button",
        sub_type: "url",
        index: String(i),
        parameters: [{ type: "text", text: param }],
      });
    }

    const requestPayload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components.length ? { components } : {}),
      },
    };

    let httpStatus = 0;
    let responseJson: any = null;
    let sendResult: { ok: true; id: string } | { ok: false; error: string; code?: string } | null = null;
    const postToMeta = async (payload: any) => {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = json?.error;
        return {
          ok: false,
          error: err?.message ?? `HTTP ${res.status}`,
          code: err?.code ? String(err.code) : String(res.status),
          status: res.status,
          json,
        };
      }
      const id = json?.messages?.[0]?.id;
      return id
        ? { ok: true, id, status: res.status, json }
        : { ok: false, error: "No message id returned", status: res.status, json };
    };

    try {
      const result = await postToMeta(requestPayload);
      httpStatus = result.status;
      responseJson = result.json;
      if (!result.ok && result.code === "132001" && languageCode.includes("_")) {
        const retryPayload = {
          ...requestPayload,
          template: {
            ...requestPayload.template,
            language: { code: languageCode.split("_")[0] },
          },
        };
        const retry = await postToMeta(retryPayload);
        if (retry.ok) {
          requestPayload.template.language.code = retryPayload.template.language.code;
          languageCode = retryPayload.template.language.code;
          httpStatus = retry.status;
          responseJson = retry.json;
          sendResult = { ok: true, id: retry.id };
        } else {
          sendResult = { ok: false, error: result.error, code: result.code };
        }
      } else if (result.ok) {
        sendResult = { ok: true, id: result.id };
      } else {
        sendResult = { ok: false, error: result.error, code: result.code };
      }
    } catch (e: any) {
      sendResult = { ok: false, error: e?.message ?? "Network error" };
    }

    const nowIso = new Date().toISOString();
    const logRow = {
      campaign_id: data.campaignId ?? null,
      recipient_id: data.recipientId ?? null,
      connection_id: conn.id,
      to_phone: to,
      template_name: templateName,
      language_code: languageCode,
      request_payload: { ...requestPayload, _auth: "***" },
      response_payload: responseJson,
      meta_message_id: sendResult.ok ? sendResult.id : null,
      message_status: sendResult.ok ? "accepted" : "failed",
      failed_reason: sendResult.ok ? null : sendResult.error,
      error_code: sendResult.ok ? null : sendResult.code ?? null,
      http_status: httpStatus,
      sent_at: sendResult.ok ? nowIso : null,
    };
    const { data: log } = await supabaseAdmin
      .from("message_logs")
      .insert(logRow)
      .select("id")
      .single();

    if (sendResult.ok) {
      return { ok: true, metaMessageId: sendResult.id, status: "accepted", logId: log?.id ?? "" };
    }
    const explainError = (code?: string) => {
      const c = String(code ?? "");
      if (c === "190") return "Access Token expirado ou inválido.";
      if (c === "10" || c === "200") return "Permissões insuficientes no token.";
      if (c === "100") return "Parâmetros inválidos — verifique variáveis e destino.";
      if (c === "132000" || c === "132001") return "Template inexistente ou não aprovado para este idioma.";
      if (c === "131047") return "Fora da janela de 24h ou destinatário sem opt-in.";
      return undefined;
    };
    return {
      ok: false,
      error: sendResult.error + (explainError(sendResult.code) ? ` — ${explainError(sendResult.code)}` : ""),
      code: sendResult.code,
      logId: log?.id,
    };
  });
