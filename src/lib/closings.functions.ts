import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

export const listClosings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("closings")
      .select("*")
      .order("year", { ascending: false })
      .order("month", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const generateClosing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ month: z.number().min(1).max(12), year: z.number().min(2000).max(3000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    const start = new Date(data.year, data.month - 1, 1).toISOString();
    const end = new Date(data.year, data.month, 1).toISOString();

    const [{ data: revs }, { data: costs }, { data: msgs }] = await Promise.all([
      supabase.from("revenues").select("amount,status").gte("created_at", start).lt("created_at", end),
      supabase.from("costs").select("amount").gte("created_at", start).lt("created_at", end),
      supabase.from("whatsapp_messages").select("status").gte("created_at", start).lt("created_at", end),
    ]);

    const total_revenue = (revs ?? [])
      .filter((r: any) => r.status === "pago")
      .reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
    const total_cost = (costs ?? []).reduce((s: number, c: any) => s + Number(c.amount ?? 0), 0);
    const net_profit = total_revenue - total_cost;
    const margin = total_revenue > 0 ? (net_profit / total_revenue) * 100 : 0;
    const total_messages = (msgs ?? []).length;
    const delivered_messages = (msgs ?? []).filter((m: any) =>
      ["entregue", "lido", "enviado"].includes(String(m.status)),
    ).length;
    const failed_messages = (msgs ?? []).filter((m: any) =>
      ["falha", "erro", "recusada", "nao_entregue"].includes(String(m.status)),
    ).length;
    const cost_per_message = total_messages > 0 ? total_cost / total_messages : 0;

    const payload = {
      month: data.month,
      year: data.year,
      total_revenue,
      total_cost,
      net_profit,
      margin,
      total_messages,
      delivered_messages,
      failed_messages,
      cost_per_message,
      status: "fechado",
      closed_at: new Date().toISOString(),
    };

    const { data: existing } = await supabase
      .from("closings")
      .select("id")
      .eq("month", data.month)
      .eq("year", data.year)
      .maybeSingle();

    if (existing) {
      const { data: row, error } = await supabase
        .from("closings")
        .update(payload)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await supabase.from("closings").insert(payload).select().single();
    if (error) throw error;
    return row;
  });

export const deleteClosing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("closings").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
