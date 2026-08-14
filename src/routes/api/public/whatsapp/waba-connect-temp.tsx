import { createFileRoute } from "@tanstack/react-router";
import { isAuthorizedCronRequest, cronUnauthorized } from "@/lib/cron-auth.server";

/** Diagnóstico temporário: verifica acesso do token global a uma WABA e assina o app. */
export const Route = createFileRoute("/api/public/whatsapp/waba-connect-temp")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthorizedCronRequest(request)) return cronUnauthorized();
        const url = new URL(request.url);
        const wabaId = url.searchParams.get("waba_id") ?? "";
        const token = process.env["WHATSAPP_ACCESS_TOKEN"] ?? "";
        if (!wabaId || !token) {
          return Response.json({ error: "missing waba_id or token" }, { status: 400 });
        }
        const v = "v21.0";
        const call = async (path: string, method = "GET") => {
          const r = await fetch(`https://graph.facebook.com/${v}${path}`, {
            method,
            headers: { Authorization: `Bearer ${token}` },
          });
          return { status: r.status, body: await r.json().catch(() => null) };
        };
        const info = await call(`/${wabaId}?fields=id,name,currency,timezone_id`);
        const numbers = await call(`/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,name_status`);
        let subscribe: unknown = null;
        if (url.searchParams.get("subscribe") === "1") {
          subscribe = await call(`/${wabaId}/subscribed_apps`, "POST");
        }
        const apps = await call(`/${wabaId}/subscribed_apps`);
        return Response.json({ info, numbers, subscribe, apps });
      },
    },
  },
});
