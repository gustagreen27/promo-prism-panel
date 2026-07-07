import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

export type WaQueueStatus = {
  counts: Record<string, number>;
  totals: {
    running: number;
    scheduled: number;
    paused: number;
    completed: number;
    failed: number;
    error: number;
    draft: number;
    cancelled: number;
  };
  recipients: {
    pending: number;
    processing: number;
    sent: number;
    failed: number;
  };
  last_ticks: Array<{
    id: string;
    ran_at: string;
    duration_ms: number;
    promoted_count: number;
    processed_campaigns: number;
    total_sent: number;
    total_failed: number;
    last_error: string | null;
  }>;
  campaign_errors: Array<{ id: string; name: string; status: string; last_error: string | null; updated_at: string }>;
  cron: {
    active: boolean | null;
    last_run_at: string | null;
    last_status: string | null;
  };
};

export const getWaQueueStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WaQueueStatus> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Counts by campaign status
    const { data: statusRows } = await supabaseAdmin
      .from("wa_campaigns")
      .select("status");
    const counts: Record<string, number> = {};
    for (const r of statusRows ?? []) {
      const s = String((r as any).status ?? "unknown");
      counts[s] = (counts[s] ?? 0) + 1;
    }

    // Recipient rollup across running/paused campaigns
    const { data: recRows } = await supabaseAdmin
      .from("campaign_recipients")
      .select("status");
    const recipients = { pending: 0, processing: 0, sent: 0, failed: 0 };
    for (const r of recRows ?? []) {
      const s = String((r as any).status ?? "");
      if (s === "pending") recipients.pending++;
      else if (s === "processing") recipients.processing++;
      else if (s === "sent" || s === "delivered" || s === "read" || s === "replied") recipients.sent++;
      else if (s === "failed") recipients.failed++;
    }

    // Last tick logs
    const { data: ticks } = await supabaseAdmin
      .from("wa_queue_tick_logs")
      .select("id, ran_at, duration_ms, promoted_count, processed_campaigns, total_sent, total_failed, last_error")
      .order("ran_at", { ascending: false })
      .limit(20);

    // Campaigns with recent errors
    const { data: errored } = await supabaseAdmin
      .from("wa_campaigns")
      .select("id, name, status, last_error, updated_at")
      .not("last_error", "is", null)
      .order("updated_at", { ascending: false })
      .limit(10);

    // Cron info via RPC-safe query using admin client
    let cron: WaQueueStatus["cron"] = { active: null, last_run_at: null, last_status: null };
    try {
      const { data: cronData } = await supabaseAdmin.rpc("get_wa_queue_cron_status" as any);
      if (cronData) cron = cronData as any;
    } catch {
      // ignore - RPC optional
    }

    return {
      counts,
      totals: {
        running: counts["running"] ?? 0,
        scheduled: counts["scheduled"] ?? 0,
        paused: counts["paused"] ?? 0,
        completed: counts["completed"] ?? 0,
        failed: counts["failed"] ?? 0,
        error: counts["error"] ?? 0,
        draft: counts["draft"] ?? 0,
        cancelled: counts["cancelled"] ?? 0,
      },
      recipients,
      last_ticks: (ticks ?? []) as any,
      campaign_errors: (errored ?? []) as any,
      cron,
    };
  });
