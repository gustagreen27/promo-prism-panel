// Worker que consome wa_service_queue e envia via Meta Graph API.
// Chamado por pg_cron (a cada minuto) e também sob demanda (fire-and-forget).
// Segurança: rota /api/public/* — validada via apikey (Supabase anon).

import { createFileRoute } from "@tanstack/react-router";
import { metaEgressFetch } from "@/lib/meta/meta-egress";

const TIMEOUT_MS = 10000;

// Sai pela porta única de egress (ver meta-egress.ts).
async function fetchWithTimeout(url: string, init: RequestInit, ms = TIMEOUT_MS) {
  return await metaEgressFetch(url, { ...init, timeoutMs: ms });
}


export const Route = createFileRoute("/api/public/whatsapp/service-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => guard(request),
      GET: async ({ request }) => guard(request),
    },
  },
});

async function guard(request: Request) {
  const { isAuthorizedCronRequest, cronUnauthorized } = await import("@/lib/cron-auth.server");
  if (!isAuthorizedCronRequest(request)) return cronUnauthorized();
  return runTick();
}

async function runTick() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const nowIso = new Date().toISOString();

  // Pega até 20 itens elegíveis, priorizando pelo campo `priority` e idade.
  const { data: batch } = await supabaseAdmin
    .from("wa_service_queue")
    .select("id, workspace_id, conversation_id, connection_id, phone_number_id, contact_phone, message_id, payload, attempt, max_attempts, idempotency_key")
    .in("status", ["pending"])
    .lte("next_attempt_at", nowIso)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(20);

  const items: any[] = batch ?? [];
  if (!items.length) {
    return Response.json({ ok: true, processed: 0 });
  }

  // Reserva atômica: marca como 'processing' apenas os que ainda estão 'pending'.
  const ids = items.map((i) => i.id);
  const { data: reserved } = await supabaseAdmin
    .from("wa_service_queue")
    .update({ status: "processing", last_attempt_at: nowIso, attempt: undefined })
    .in("id", ids)
    .eq("status", "pending")
    .select("id, workspace_id, conversation_id, connection_id, phone_number_id, contact_phone, message_id, payload, attempt, max_attempts");

  const rows = reserved ?? [];
  let ok = 0;
  let failed = 0;

  for (const row of rows) {
    const attempt = (row.attempt ?? 0) + 1;
    try {
      // Busca token/versão da conexão
      const { data: conn } = await supabaseAdmin
        .from("whatsapp_connections")
        .select("access_token, graph_api_version")
        .eq("id", row.connection_id ?? "")
        .maybeSingle();
      const token = (conn as any)?.access_token || process.env.WHATSAPP_ACCESS_TOKEN;
      const version = (conn as any)?.graph_api_version || process.env.META_GRAPH_API_VERSION || "v21.0";
      if (!token) throw new Error("Sem access_token na conexão");

      const payload = row.payload ?? {};
      const body = buildMetaBody(String(row.contact_phone ?? ""), payload);
      const url = `https://graph.facebook.com/${version}/${row.phone_number_id}/messages`;

      const res = await fetchWithTimeout(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const json: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = json?.error?.message ?? `HTTP ${res.status}`;
        const errCode = json?.error?.code ? String(json.error.code) : String(res.status);
        // Se atingiu max_attempts, marca failed.
        const isFinal = attempt >= (row.max_attempts ?? 5);
        await supabaseAdmin
          .from("wa_service_queue")
          .update({
            status: isFinal ? "failed" : "pending",
            attempt,
            last_error: errMsg,
            next_attempt_at: new Date(Date.now() + Math.min(60000 * attempt, 300000)).toISOString(),
          })
          .eq("id", row.id);

        if (row.message_id) {
          await supabaseAdmin
            .from("wa_conversation_messages")
            .update({
              status: isFinal ? "failed" : "queued",
              error_code: errCode,
              error_message: errMsg,
              failed_at: isFinal ? new Date().toISOString() : null,
            })
            .eq("id", row.message_id);
        }
        failed++;
        continue;
      }

      const wamid = json?.messages?.[0]?.id ?? null;
      await supabaseAdmin
        .from("wa_service_queue")
        .update({ status: "sent", attempt, wamid })
        .eq("id", row.id);

      if (row.message_id) {
        await supabaseAdmin
          .from("wa_conversation_messages")
          .update({
            status: "sent",
            wamid,
            sent_at: new Date().toISOString(),
            error_code: null,
            error_message: null,
          })
          .eq("id", row.message_id);
      }
      ok++;
    } catch (e: any) {
      const isFinal = attempt >= (row.max_attempts ?? 5);
      await supabaseAdmin
        .from("wa_service_queue")
        .update({
          status: isFinal ? "failed" : "pending",
          attempt,
          last_error: e?.message ?? "unknown error",
          next_attempt_at: new Date(Date.now() + Math.min(60000 * attempt, 300000)).toISOString(),
        })
        .eq("id", row.id);
      if (row.message_id) {
        await supabaseAdmin
          .from("wa_conversation_messages")
          .update({
            status: isFinal ? "failed" : "queued",
            error_message: e?.message ?? "unknown error",
            failed_at: isFinal ? new Date().toISOString() : null,
          })
          .eq("id", row.message_id);
      }
      failed++;
    }
  }

  return Response.json({ ok: true, processed: rows.length, sent: ok, failed });
}

function buildMetaBody(to: string, payload: any): Record<string, any> {
  const base: Record<string, any> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
  };
  if (payload?.context_wamid) base.context = { message_id: payload.context_wamid };

  if (payload?.kind === "text") {
    return { ...base, type: "text", text: { body: payload.body, preview_url: false } };
  }
  if (payload?.kind === "media") {
    const t = payload.media_type as string;
    const media: any = {};
    if (payload.link) media.link = payload.link;
    if (payload.caption && (t === "image" || t === "video" || t === "document")) media.caption = payload.caption;
    if (payload.filename && t === "document") media.filename = payload.filename;
    return { ...base, type: t, [t]: media };
  }
  if (payload?.kind === "interactive_buttons") {
    const interactive: any = {
      type: "button",
      body: { text: payload.body },
      action: {
        buttons: (payload.buttons ?? []).slice(0, 3).map((b: any) => ({
          type: "reply",
          reply: { id: String(b.id), title: String(b.title).slice(0, 20) },
        })),
      },
    };
    if (payload.header) interactive.header = { type: "text", text: String(payload.header).slice(0, 60) };
    if (payload.footer) interactive.footer = { text: String(payload.footer).slice(0, 60) };
    return { ...base, type: "interactive", interactive };
  }
  if (payload?.kind === "interactive_list") {
    const interactive: any = {
      type: "list",
      body: { text: payload.body },
      action: {
        button: String(payload.button ?? "Ver opções").slice(0, 20),
        sections: (payload.sections ?? []).slice(0, 10).map((s: any) => ({
          title: s.title ? String(s.title).slice(0, 24) : undefined,
          rows: (s.rows ?? []).slice(0, 10).map((r: any) => ({
            id: String(r.id),
            title: String(r.title).slice(0, 24),
            description: r.description ? String(r.description).slice(0, 72) : undefined,
          })),
        })),
      },
    };
    if (payload.header) interactive.header = { type: "text", text: String(payload.header).slice(0, 60) };
    if (payload.footer) interactive.footer = { text: String(payload.footer).slice(0, 60) };
    return { ...base, type: "interactive", interactive };
  }
  if (payload?.kind === "interactive_cta_url") {
    const interactive: any = {
      type: "cta_url",
      body: { text: payload.body },
      action: {
        name: "cta_url",
        parameters: {
          display_text: String(payload.display_text ?? "Abrir").slice(0, 20),
          url: String(payload.url ?? ""),
        },
      },
    };
    if (payload.header) interactive.header = { type: "text", text: String(payload.header).slice(0, 60) };
    if (payload.footer) interactive.footer = { text: String(payload.footer).slice(0, 60) };
    return { ...base, type: "interactive", interactive };
  }

  if (payload?.kind === "template") {
    return {
      ...base,
      type: "template",
      template: {
        name: payload.template_name,
        language: { code: payload.template_language ?? "pt_BR" },
      },
    };
  }
  throw new Error(`Payload não suportado: ${payload?.kind}`);
}
