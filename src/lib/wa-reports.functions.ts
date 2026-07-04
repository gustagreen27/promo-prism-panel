import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

const filters = z.object({
  waba_ref_id: z.string().uuid().optional().nullable(),
  connection_id: z.string().uuid().optional().nullable(),
  client_id: z.string().uuid().optional().nullable(),
  project_id: z.string().uuid().optional().nullable(),
  template_id: z.string().uuid().optional().nullable(),
  campaign_id: z.string().uuid().optional().nullable(),
  from: z.string().optional().nullable(),
  to: z.string().optional().nullable(),
});

export const whatsappReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => filters.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    let campQ = context.supabase.from("wa_campaigns").select("id");
    if (data.waba_ref_id) campQ = campQ.eq("waba_ref_id", data.waba_ref_id);
    if (data.connection_id) campQ = campQ.eq("connection_id", data.connection_id);
    if (data.client_id) campQ = campQ.eq("client_id", data.client_id);
    if (data.project_id) campQ = campQ.eq("project_id", data.project_id);
    if (data.template_id) campQ = campQ.eq("template_id", data.template_id);
    if (data.campaign_id) campQ = campQ.eq("id", data.campaign_id);
    const { data: camps } = await campQ;
    const campIds = (camps ?? []).map((c: any) => c.id);

    if (!campIds.length) {
      return { sent: 0, delivered: 0, read: 0, failed: 0, replied: 0, opt_outs: 0, cost: 0, revenue: 0, profit: 0, delivery_rate: 0, read_rate: 0 };
    }

    let recQ = context.supabase.from("campaign_recipients")
      .select("status,sent_at,delivered_at,read_at,replied_at,failed_at")
      .in("campaign_id", campIds);
    if (data.from) recQ = recQ.gte("created_at", data.from);
    if (data.to) recQ = recQ.lte("created_at", data.to);
    const { data: recs = [] } = await recQ;

    const rows = recs as any[];
    const sent = rows.filter((r) => r.sent_at).length;
    const delivered = rows.filter((r) => r.delivered_at).length;
    const read = rows.filter((r) => r.read_at).length;
    const failed = rows.filter((r) => r.failed_at || r.status === "failed").length;
    const replied = rows.filter((r) => r.replied_at || r.status === "replied").length;

    const { count: optOuts } = await context.supabase.from("opt_outs").select("*", { count: "exact", head: true });

    let cost = 0, revenue = 0;
    try {
      const { data: costs } = await (context.supabase.from("costs") as any).select("amount").in("wa_campaign_id", campIds);
      cost = (costs ?? []).reduce((a: number, r: any) => a + Number(r.amount || 0), 0);
    } catch { /* coluna pode não existir */ }
    try {
      const { data: revs } = await (context.supabase.from("revenues") as any).select("amount").in("wa_campaign_id", campIds);
      revenue = (revs ?? []).reduce((a: number, r: any) => a + Number(r.amount || 0), 0);
    } catch { /* idem */ }



    return {
      sent, delivered, read, failed, replied,
      opt_outs: optOuts ?? 0,
      cost, revenue, profit: revenue - cost,
      delivery_rate: sent ? +(delivered / sent * 100).toFixed(2) : 0,
      read_rate: delivered ? +(read / delivered * 100).toFixed(2) : 0,
    };
  });
