import { createFileRoute } from "@tanstack/react-router";

const OPTOUT_REGEX = /\b(sair|parar|cancelar|remover|descadastrar|n[aã]o\s*quero|stop|unsubscribe)\b/i;

export const Route = createFileRoute("/api/public/whatsapp-webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        const expected = process.env.WHATSAPP_VERIFY_TOKEN;
        if (mode === "subscribe" && token && expected && token === expected) {
          return new Response(challenge ?? "", { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const raw = await request.text();
        let payload: any = {};
        try { payload = JSON.parse(raw); } catch { /* keep raw */ }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Sempre grava log bruto
        try {
          await supabaseAdmin.from("whatsapp_webhook_logs").insert({
            event_type: payload?.entry?.[0]?.changes?.[0]?.field ?? "unknown",
            payload,
            processed: false,
          });
        } catch { /* keep going */ }

        try {
          for (const entry of payload?.entry ?? []) {
            for (const change of entry?.changes ?? []) {
              const value = change?.value ?? {};

              // 1) Status updates
              for (const st of value.statuses ?? []) {
                const metaId = st.id;
                const status = String(st.status || "").toLowerCase();
                const nowIso = new Date().toISOString();
                const patch: Record<string, any> = {};
                if (status === "sent") patch.sent_at = nowIso;
                if (status === "delivered") { patch.status = "delivered"; patch.delivered_at = nowIso; }
                if (status === "read") { patch.status = "read"; patch.read_at = nowIso; }
                if (status === "failed") {
                  patch.status = "failed";
                  patch.failed_at = nowIso;
                  patch.failed_reason = st.errors?.[0]?.title ?? st.errors?.[0]?.message ?? "failed";
                  patch.error_code = st.errors?.[0]?.code ? String(st.errors[0].code) : null;
                }
                if (Object.keys(patch).length && metaId) {
                  await supabaseAdmin.from("campaign_recipients").update(patch).eq("meta_message_id", metaId);
                  await supabaseAdmin.from("message_logs").update({
                    message_status: status,
                    delivered_at: patch.delivered_at ?? null,
                    read_at: patch.read_at ?? null,
                    failed_reason: patch.failed_reason ?? null,
                  }).eq("meta_message_id", metaId);
                }
              }

              // 2) Inbound messages (replies + opt-out)
              const connection = await supabaseAdmin
                .from("whatsapp_connections").select("id,client_id")
                .eq("phone_number_id", value?.metadata?.phone_number_id ?? "").maybeSingle();

              for (const msg of value.messages ?? []) {
                const from = String(msg.from || "");
                const body: string = msg?.text?.body ?? msg?.button?.text ?? msg?.interactive?.button_reply?.title ?? "";

                await supabaseAdmin.from("whatsapp_inbox").insert({
                  connection_id: connection?.data?.id ?? null,
                  phone: from,
                  direction: "in",
                  message_type: msg.type ?? "text",
                  body,
                  meta_message_id: msg.id,
                  status: "received",
                  raw: msg,
                });

                // Marca reply na campanha se houver contexto
                if (msg?.context?.id) {
                  await supabaseAdmin.from("campaign_recipients").update({
                    status: "replied", replied_at: new Date().toISOString(),
                  }).eq("meta_message_id", msg.context.id);
                }

                // Opt-out automático
                if (body && OPTOUT_REGEX.test(body)) {
                  await supabaseAdmin.from("opt_outs").insert({
                    phone: from,
                    client_id: connection?.data?.client_id ?? null,
                    reason: `Auto: "${body.slice(0, 80)}"`,
                  });
                }
              }
            }
          }
        } catch (e: any) {
          try {
            await supabaseAdmin.from("whatsapp_webhook_logs").insert({
              event_type: "processing_error", payload, processed: false, error: String(e?.message ?? e),
            });
          } catch { /* noop */ }
        }

        return new Response("EVENT_RECEIVED", { status: 200 });
      },
    },
  },
});
