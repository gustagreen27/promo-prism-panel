import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/whatsapp/queue-tick")({
  server: {
    handlers: {
      POST: async () => {
        const startedAt = Date.now();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { processCampaignTick } = await import("@/lib/wa-queue.server");

        const nowIso = new Date().toISOString();

        // Promote scheduled campaigns whose time has come
        const { data: promoted } = await supabaseAdmin
          .from("wa_campaigns")
          .update({ status: "running", started_at: nowIso })
          .eq("status", "scheduled")
          .lte("scheduled_at", nowIso)
          .select("id, name");

        for (const p of promoted ?? []) {
          try {
            await supabaseAdmin.from("campaign_timeline").insert({
              campaign_id: (p as any).id,
              event_type: "status_change",
              message: `Promovida para running via cron (${nowIso})`,
              payload: { source: "queue-tick", from: "scheduled", to: "running" },
            });
          } catch {}
        }

        const { data: running } = await supabaseAdmin
          .from("wa_campaigns")
          .select("id, send_rate_per_min")
          .eq("status", "running");

        const results: any[] = [];
        let totalSent = 0;
        let totalFailed = 0;
        let lastError: string | null = null;

        for (const c of running ?? []) {
          const batch = Math.min(Math.max(Number(c.send_rate_per_min) || 30, 1), 200);
          const t0 = Date.now();
          try {
            const r = await processCampaignTick(c.id, batch);
            const entry: any = { id: c.id, ...r, took_ms: Date.now() - t0 };
            results.push(entry);
            if (typeof (r as any).sent === "number") totalSent += (r as any).sent;
            if (typeof (r as any).failed === "number") totalFailed += (r as any).failed;
          } catch (e: any) {
            const msg = e?.message ?? String(e);
            lastError = msg;
            results.push({ id: c.id, error: msg, took_ms: Date.now() - t0 });
          }
        }

        const duration = Date.now() - startedAt;

        try {
          await supabaseAdmin.from("wa_queue_tick_logs").insert({
            ran_at: nowIso,
            duration_ms: duration,
            promoted_count: promoted?.length ?? 0,
            processed_campaigns: running?.length ?? 0,
            total_sent: totalSent,
            total_failed: totalFailed,
            last_error: lastError,
            results,
          });
        } catch (e) {
          console.error("[queue-tick] failed to insert log", e);
        }

        console.log(
          `[queue-tick] ${nowIso} promoted=${promoted?.length ?? 0} running=${running?.length ?? 0} sent=${totalSent} failed=${totalFailed} duration=${duration}ms`,
        );

        return Response.json({
          ok: true,
          processed_at: nowIso,
          duration_ms: duration,
          promoted: promoted?.length ?? 0,
          running: running?.length ?? 0,
          sent: totalSent,
          failed: totalFailed,
          last_error: lastError,
          results,
        });
      },
    },
  },
});
