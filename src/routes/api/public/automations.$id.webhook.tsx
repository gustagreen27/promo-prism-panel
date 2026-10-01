// Gatilho "Webhook externo": POST com header x-automation-token.
// Corpo: { "phone": "5562999999999", "name"?: "...", "event_id"?: "...", "data"?: {...} }
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  phone: z.string().min(8).max(20),
  name: z.string().max(120).optional(),
  event_id: z.string().max(120).optional(),
  data: z.record(z.string(), z.any()).optional(),
});

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export const Route = createFileRoute("/api/public/automations/$id/webhook")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!/^[0-9a-f-]{36}$/i.test(params.id)) return Response.json({ error: "not_found" }, { status: 404 });
        const raw = await request.text();
        if (raw.length > 32 * 1024) return Response.json({ error: "payload_too_large" }, { status: 413 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: a } = await supabaseAdmin.from("automations").select("id, status, trigger_type, webhook_token, published_version_id").eq("id", params.id).maybeSingle();
        const token = request.headers.get("x-automation-token") ?? "";
        if (!a || !token || !safeEqual(token, a.webhook_token)) return Response.json({ error: "unauthorized" }, { status: 401 });
        if (a.status !== "active" || a.trigger_type !== "webhook" || !a.published_version_id) return Response.json({ error: "automation_not_active" }, { status: 409 });
        let parsed;
        try { parsed = Body.parse(JSON.parse(raw)); } catch { return Response.json({ error: "invalid_body" }, { status: 400 }); }
        const eng = await import("@/lib/automation-engine.server");
        const r = await eng.startRun(supabaseAdmin, {
          automationId: a.id, versionId: a.published_version_id, triggerType: "webhook",
          contactPhone: parsed.phone, triggerData: { ...(parsed.data ?? {}), name: parsed.name ?? null },
          dedupKey: parsed.event_id ? `wh:${a.id}:${parsed.event_id}` : null,
        });
        if (r.duplicate) return Response.json({ ok: true, duplicate: true });
        if (!r.runId) return Response.json({ error: r.error }, { status: 422 });
        await eng.processDueJobs(supabaseAdmin, `wh-${r.runId}`, 3000);
        return Response.json({ ok: true, run_id: r.runId });
      },
    },
  },
});
