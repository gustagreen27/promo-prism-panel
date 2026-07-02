import { createFileRoute } from "@tanstack/react-router";

const OPT_OUT_REGEX = /\b(parar|sair|cancelar|cancela|remover|descadastrar|n[ãa]o quero|stop|unsubscribe)\b/i;

export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      // Meta verification
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        if (mode !== "subscribe" || !token) return new Response("forbidden", { status: 403 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // 1) Token global salvo em settings.whatsapp_webhook.verify_token
        const { data: setting } = await supabaseAdmin
          .from("settings")
          .select("value")
          .eq("key", "whatsapp_webhook")
          .maybeSingle();
        const globalToken = (setting?.value as { verify_token?: string } | null)?.verify_token;
        if (globalToken && globalToken === token) {
          return new Response(challenge ?? "", {
            status: 200,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }

        // 2) Token por conexão em whatsapp_connections.verify_token
        const { data: conns } = await supabaseAdmin
          .from("whatsapp_connections")
          .select("id")
          .eq("verify_token", token)
          .limit(1);
        if (conns && conns.length > 0) {
          return new Response(challenge ?? "", {
            status: 200,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }

        return new Response("invalid token", { status: 403 });
      },
      POST: async ({ request }) => {
        const text = await request.text();
        let payload: any = {};
        try { payload = JSON.parse(text); } catch {}
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        await supabaseAdmin.from("whatsapp_webhook_logs").insert({
          event_type: payload?.entry?.[0]?.changes?.[0]?.field ?? "unknown",
          payload,
        });

        try {
          for (const entry of payload?.entry ?? []) {
            for (const change of entry?.changes ?? []) {
              const value = change?.value ?? {};
              const phoneNumberId = value?.metadata?.phone_number_id;
              let connectionId: string | null = null;
              if (phoneNumberId) {
                const { data: conn } = await supabaseAdmin
                  .from("whatsapp_connections")
                  .select("id")
                  .eq("phone_number_id", phoneNumberId)
                  .maybeSingle();
                connectionId = conn?.id ?? null;
              }

              // Statuses
              for (const s of value?.statuses ?? []) {
                const id = s?.id;
                const status = s?.status; // sent | delivered | read | failed
                if (!id || !status) continue;
                const patch: any = {};
                if (status === "sent") patch.sent_at = new Date().toISOString();
                if (status === "delivered") { patch.status = "delivered"; patch.delivered_at = new Date().toISOString(); }
                if (status === "read") { patch.status = "read"; patch.read_at = new Date().toISOString(); }
                if (status === "failed") {
                  patch.status = "failed";
                  patch.failed_at = new Date().toISOString();
                  patch.failed_reason = s?.errors?.[0]?.title ?? "failed";
                  patch.error_code = s?.errors?.[0]?.code ? String(s.errors[0].code) : null;
                }
                if (Object.keys(patch).length) {
                  await supabaseAdmin.from("campaign_recipients").update(patch).eq("meta_message_id", id);
                }
              }

              // Inbound messages
              for (const m of value?.messages ?? []) {
                const from = m?.from;
                const body = m?.text?.body ?? "";
                await supabaseAdmin.from("whatsapp_inbox").insert({
                  connection_id: connectionId,
                  phone: from,
                  direction: "in",
                  message_type: m?.type ?? "text",
                  body,
                  meta_message_id: m?.id ?? null,
                  raw: m,
                });
                // Mark as replied if matches a recipient
                if (from) {
                  await supabaseAdmin
                    .from("campaign_recipients")
                    .update({ status: "replied", replied_at: new Date().toISOString() })
                    .eq("phone", from)
                    .in("status", ["sent", "delivered", "read"]);
                  await supabaseAdmin
                    .from("contacts")
                    .update({ last_interaction_at: new Date().toISOString() })
                    .eq("phone", from);
                }
                // Auto opt-out
                if (body && OPT_OUT_REGEX.test(body) && from) {
                  await supabaseAdmin
                    .from("opt_outs")
                    .upsert({ phone: from, reason: "keyword" }, { onConflict: "phone" });
                  await supabaseAdmin
                    .from("contacts")
                    .update({ opt_out: true, opt_out_at: new Date().toISOString() })
                    .eq("phone", from);
                }
              }
            }
          }
        } catch (e: any) {
          await supabaseAdmin.from("whatsapp_webhook_logs").insert({
            event_type: "error",
            payload: { error: e?.message },
            error: e?.message,
          });
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
