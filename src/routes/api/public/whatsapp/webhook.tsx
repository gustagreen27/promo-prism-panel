import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

const OPT_OUT_REGEX = /\b(parar|sair|cancelar|cancela|remover|descadastrar|n[ãa]o quero|stop|unsubscribe)\b/i;

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return false;
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const provided = signatureHeader.slice("sha256=".length);
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    const a = Buffer.from(provided, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        if (mode !== "subscribe" || !token) return new Response("forbidden", { status: 403 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
        const rawBody = await request.text();
        const sig = request.headers.get("x-hub-signature-256");
        const strict = !!process.env.META_APP_SECRET;
        const valid = verifySignature(rawBody, sig);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        if (strict && !valid) {
          await supabaseAdmin.from("whatsapp_webhook_logs").insert({
            event_type: "invalid_signature",
            payload: { has_signature: !!sig },
            error: "invalid X-Hub-Signature-256",
          });
          return new Response("invalid signature", { status: 401 });
        }

        let payload: any = {};
        try { payload = JSON.parse(rawBody); } catch {}

        await supabaseAdmin.from("whatsapp_webhook_logs").insert({
          event_type: payload?.entry?.[0]?.changes?.[0]?.field ?? "unknown",
          payload,
        });

        try {
          for (const entry of payload?.entry ?? []) {
            for (const change of entry?.changes ?? []) {
              const field: string = change?.field ?? "";
              const value = change?.value ?? {};

              // ── phone_number_name_update ─────────────────────────
              if (field === "phone_number_name_update") {
                const phoneNumberId = value?.phone_number ?? value?.phone_number_id;
                const decision: string = value?.decision ?? value?.name_status ?? ""; // APPROVED / REJECTED
                const requestedName: string | null = value?.requested_verified_name ?? value?.display_name ?? null;
                const reason: string | null = value?.rejection_reason ?? null;
                if (phoneNumberId) {
                  const { data: conn } = await supabaseAdmin
                    .from("whatsapp_connections")
                    .select("id, workspace_id, requested_display_name, current_display_name")
                    .eq("phone_number_id", phoneNumberId)
                    .maybeSingle();
                  if (conn) {
                    const patch: any = {
                      display_name_reviewed_at: new Date().toISOString(),
                      last_meta_sync_at: new Date().toISOString(),
                    };
                    let action = "DISPLAY_NAME_APPROVED";
                    if (decision === "APPROVED") {
                      patch.display_name_status = "APPROVED";
                      patch.display_name_rejection_reason = null;
                    } else if (decision === "REJECTED" || decision === "DECLINED") {
                      patch.display_name_status = "DECLINED";
                      patch.display_name_rejection_reason = reason ?? "Rejeitado pela Meta";
                      action = "DISPLAY_NAME_REJECTED";
                    }
                    await supabaseAdmin.from("whatsapp_connections").update(patch).eq("id", conn.id);
                    await supabaseAdmin.from("whatsapp_profile_audit_logs").insert({
                      workspace_id: conn.workspace_id,
                      connection_id: conn.id,
                      phone_number_id: phoneNumberId,
                      action,
                      new_value: { requested: requestedName, reason },
                      status: "success",
                    });
                  }
                }
                continue;
              }

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

              for (const s of value?.statuses ?? []) {
                const id = s?.id;
                const status = s?.status;
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
                const logPatch: any = { message_status: status };
                if (status === "failed") {
                  logPatch.failed_reason = s?.errors?.[0]?.title ?? "failed";
                  logPatch.error_code = s?.errors?.[0]?.code ? String(s.errors[0].code) : null;
                }
                await supabaseAdmin.from("message_logs").update(logPatch).eq("meta_message_id", id);
              }

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
