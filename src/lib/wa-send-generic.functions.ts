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
      .select("id, name, language, header_type, buttons, body")
      .eq("id", data.templateId)
      .maybeSingle();
    if (tErr || !tpl) return { ok: false, error: "Template não encontrado" };

    const { data: conn, error: cErr } = await supabaseAdmin
      .from("whatsapp_connections")
      .select("id, phone_number_id, access_token, graph_api_version")
      .eq("id", data.connectionId)
      .maybeSingle();
    if (cErr || !conn) return { ok: false, error: "Conexão WhatsApp não encontrada" };

    const accessToken = conn.access_token || process.env.WHATSAPP_ACCESS_TOKEN;
    if (!conn.phone_number_id || !accessToken) {
      return { ok: false, error: "Conexão sem phone_number_id ou access_token" };
    }

    const to = data.to.replace(/\D/g, "");
    const graphVersion = conn.graph_api_version || "v25.0";
    const url = `https://graph.facebook.com/${graphVersion}/${conn.phone_number_id}/messages`;

    // Build components
    const components: any[] = [];

    const headerType = (tpl.header_type ?? "").toString().toUpperCase();
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

    // Buttons: iterate template.buttons and attach URL params where the button URL has {{n}}
    const btns = (tpl.buttons ?? []) as any[];
    for (let i = 0; i < btns.length; i++) {
      const b = btns[i] ?? {};
      const type = String(b.type ?? "").toLowerCase();
      if (type !== "url") continue;
      const urlTpl = String(b.url ?? "");
      const hasVar = /\{\{(\d+)\}\}/.test(urlTpl);
      if (!hasVar) continue;
      const param = data.buttonUrlParams[String(i)] ?? data.buttonUrlParams["0"];
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
        name: tpl.name,
        language: { code: tpl.language },
        ...(components.length ? { components } : {}),
      },
    };

    let httpStatus = 0;
    let responseJson: any = null;
    let sendResult: { ok: true; id: string } | { ok: false; error: string; code?: string } | null = null;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(requestPayload),
      });
      httpStatus = res.status;
      responseJson = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = responseJson?.error;
        sendResult = {
          ok: false,
          error: err?.message ?? `HTTP ${res.status}`,
          code: err?.code ? String(err.code) : String(res.status),
        };
      } else {
        const id = responseJson?.messages?.[0]?.id;
        sendResult = id
          ? { ok: true, id }
          : { ok: false, error: "No message id returned" };
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
      template_name: tpl.name,
      language_code: tpl.language,
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
    return {
      ok: false,
      error: sendResult.error + (explain(sendResult.code) ? ` — ${explain(sendResult.code)}` : ""),
      code: sendResult.code,
      logId: log?.id,
    };
  });
