import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/whatsapp/queue-tick")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { processCampaignTick } = await import("@/lib/wa-queue.server");
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
        return Response.json({ ok: true, results });
      },
    },
  },
});
