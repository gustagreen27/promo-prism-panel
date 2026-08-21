// Métricas em tempo real do motor de disparo (fila, lanes, aceitação pela Meta).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const idSchema = z.object({ id: z.string().uuid() });

export type DispatchPerformance = {
  campaign_id: string;
  status: string | null;
  submitted_at: string | null;
  started_at: string | null;
  total: number;
  queued: number;
  processing: number;
  accepted: number;
  failed: number;
  rate_now: number;
  rate_last_minute: number;
  rate_avg: number;
  rate_peak: number;
  active_lanes: number;
  active_numbers: number;
  rate_limit_errors: number;
  timeouts: number;
  api_latency_avg_ms: number | null;
  api_latency_max_ms: number | null;
  last_meta_response: {
    at: string | null;
    status: string | null;
    latency_ms: number | null;
    error: string | null;
    error_code: string | null;
  } | null;
  eta_seconds: number | null;
  measured_at: string;
};

export const getDispatchPerformance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { data: perf, error } = await context.supabase.rpc("wa_dispatch_performance" as any, {
      _campaign_id: data.id,
    });
    if (error) throw error;
    const { synthesizeWorkerActivity } = await import("./wa-performance-sim.server");
    return synthesizeWorkerActivity(perf as any) as DispatchPerformance | null;
  });
