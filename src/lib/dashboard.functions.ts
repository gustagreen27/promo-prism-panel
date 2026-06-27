import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

const inputSchema = z.object({
  start: z.string(),
  end: z.string(),
});

export const getDashboardSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    const start = data.start;
    const end = data.end;

    // Revenue (paid only) within the period (by paid_date)
    const { data: revenues } = await supabase
      .from("revenues")
      .select("amount, status, paid_date, due_date, created_at")
      .gte("created_at", start)
      .lte("created_at", end);

    const totalRevenue = (revenues ?? [])
      .filter((r: any) => r.status === "pago")
      .reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);

    // Costs within period
    const { data: costs } = await supabase
      .from("costs")
      .select("amount, status, created_at")
      .gte("created_at", start)
      .lte("created_at", end);
    const totalCost = (costs ?? []).reduce((s: number, c: any) => s + Number(c.amount ?? 0), 0);

    // WhatsApp messages
    const { data: messages } = await supabase
      .from("whatsapp_messages")
      .select("status, created_at")
      .gte("created_at", start)
      .lte("created_at", end);
    const totalMessages = (messages ?? []).length;
    const delivered = (messages ?? []).filter((m: any) =>
      ["entregue", "lido", "enviado"].includes(String(m.status)),
    ).length;
    const failed = (messages ?? []).filter((m: any) =>
      ["falha", "erro", "recusada", "nao_entregue"].includes(String(m.status)),
    ).length;

    const deliveryRate = totalMessages > 0 ? (delivered / totalMessages) * 100 : null;
    const profit = totalRevenue - totalCost;
    const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : null;

    // Latest closings & revenues
    const { data: lastClosings } = await supabase
      .from("closings")
      .select("*")
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .limit(5);

    const { data: lastRevenues } = await supabase
      .from("revenues")
      .select("*, client:clients(id,name), project:projects(id,name)")
      .order("created_at", { ascending: false })
      .limit(5);

    // Monthly goal from settings
    const { data: goalSetting } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "monthly_goal")
      .maybeSingle();
    const monthlyGoal = Number((goalSetting?.value as { amount?: number } | null)?.amount ?? 0) || 0;

    // This month revenue (for goal progress)
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const { data: monthRevs } = await supabase
      .from("revenues")
      .select("amount, status, created_at")
      .gte("created_at", monthStart);
    const monthRevenue = (monthRevs ?? [])
      .filter((r: any) => r.status === "pago")
      .reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
    const goalProgress = monthlyGoal > 0 ? (monthRevenue / monthlyGoal) * 100 : 0;

    return {
      totalRevenue,
      totalCost,
      profit,
      margin,
      totalMessages,
      delivered,
      failed,
      deliveryRate,
      monthlyGoal,
      monthRevenue,
      goalProgress,
      lastClosings: lastClosings ?? [],
      lastRevenues: lastRevenues ?? [],
    };
  });
