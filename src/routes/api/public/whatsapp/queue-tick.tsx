import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/whatsapp/queue-tick")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { processCampaignTick } = await import("@/lib/wa-queue.server");

        // Promote scheduled campaigns whose time has come
        const nowIso = new Date().toISOString();
        await supabaseAdmin
          .from("wa_campaigns")
          .update({ status: "running", started_at: nowIso })
          .eq("status", "scheduled")
          .lte("scheduled_at", nowIso);

        const { data: running } = await supabaseAdmin
          .from("wa_campaigns")
          .select("id, send_rate_per_min")
          .eq("status", "running");

        const results: any[] = [];
        for (const c of running ?? []) {
          const batch = Math.min(Math.max(Number(c.send_rate_per_min) || 30, 1), 200);
          try {
            const r = await processCampaignTick(c.id, batch);
            results.push({ id: c.id, ...r });
          } catch (e: any) {
            results.push({ id: c.id, error: e?.message });
          }
        }
        return Response.json({ ok: true, processed_at: nowIso, results });
      },
    },
  },
});
