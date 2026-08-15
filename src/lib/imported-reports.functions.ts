import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

const summarySchema = z.object({
  campaign: z.string().nullable().optional(),
  boostId: z.string().nullable().optional(),
  total: z.number().nullable().optional(),
  completed: z.number().nullable().optional(),
  errors: z.number().nullable().optional(),
  completionRate: z.number().nullable().optional(),
  errorRate: z.number().nullable().optional(),
  firstStartedAt: z.string().nullable().optional(),
  firstSentAt: z.string().nullable().optional(),
  lastSentAt: z.string().nullable().optional(),
});

export const listImportedReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("imported_dispatch_reports")
      .select("id,name,boost_id,total,completed,errors,completion_rate,error_rate,first_started_at,first_sent_at,last_sent_at,created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const findImportedReportByBoost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ boostId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row } = await context.supabase
      .from("imported_dispatch_reports")
      .select("id,name,total,created_at")
      .eq("boost_id", data.boostId)
      .maybeSingle();
    return row ?? null;
  });

export const upsertImportedReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ summary: summarySchema, replace: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const s = data.summary;
    const payload = {
      name: s.campaign || "Relatório importado",
      boost_id: s.boostId ?? null,
      total: s.total ?? 0,
      completed: s.completed ?? 0,
      errors: s.errors ?? 0,
      completion_rate: s.completionRate ?? 0,
      error_rate: s.errorRate ?? 0,
      first_started_at: s.firstStartedAt ?? null,
      first_sent_at: s.firstSentAt ?? null,
      last_sent_at: s.lastSentAt ?? null,
      source: "json_import",
      created_by: context.userId,
    };

    let existing: { id: string } | null = null;
    if (s.boostId) {
      const { data: row } = await context.supabase
        .from("imported_dispatch_reports").select("id").eq("boost_id", s.boostId).maybeSingle();
      existing = row ?? null;
    }

    if (existing) {
      const { error } = await context.supabase
        .from("imported_dispatch_reports").update(payload).eq("id", existing.id);
      if (error) throw new Error(error.message);
      if (data.replace) {
        await context.supabase.from("imported_dispatch_report_records").delete().eq("report_id", existing.id);
      }
      return { id: existing.id, updated: true };
    }

    const { data: created, error } = await context.supabase
      .from("imported_dispatch_reports").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: created.id as string, updated: false };
  });

const recordSchema = z.object({
  boostItemId: z.string().nullable().optional(),
  boostId: z.string().nullable().optional(),
  leadId: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  createdAt: z.string().nullable().optional(),
  enteredAt: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  statusChangedAt: z.string().nullable().optional(),
  whatsappInstanceId: z.string().nullable().optional(),
  isPending: z.boolean().nullable().optional(),
  lastSentMessageId: z.string().nullable().optional(),
  lastSentAt: z.string().nullable().optional(),
  lastSentErrorCode: z.string().nullable().optional(),
  lastReceivedMessageId: z.string().nullable().optional(),
  lastReceivedAt: z.string().nullable().optional(),
  lastReceivedErrorCode: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  messageStatus: z.string().nullable().optional(),
}).passthrough();

export const importReportRecordsChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ reportId: z.string().uuid(), records: z.array(recordSchema).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const rows = data.records.map((r) => ({
      report_id: data.reportId,
      boost_item_id: r.boostItemId ?? null,
      lead_id: r.leadId ?? null,
      status: r.status ?? null,
      name: r.name ?? null,
      phone: r.phone ?? null,
      email: r.email ?? null,
      created_at_source: r.createdAt ?? null,
      entered_at: r.enteredAt ?? null,
      started_at: r.startedAt ?? null,
      status_changed_at: r.statusChangedAt ?? null,
      whatsapp_instance_id: r.whatsappInstanceId ?? null,
      is_pending: r.isPending ?? null,
      last_sent_message_id: r.lastSentMessageId ?? null,
      last_sent_at: r.lastSentAt ?? null,
      last_sent_error_code: r.lastSentErrorCode ?? null,
      last_received_message_id: r.lastReceivedMessageId ?? null,
      last_received_at: r.lastReceivedAt ?? null,
      last_received_error_code: r.lastReceivedErrorCode ?? null,
      error_code: r.errorCode ?? null,
      error_message: r.errorMessage ?? null,
      message_status: r.messageStatus ?? null,
      raw_data: null,
    }));

    const withId = rows.filter((r) => r.boost_item_id);
    const withoutId = rows.filter((r) => !r.boost_item_id);

    if (withId.length) {
      const { error } = await context.supabase
        .from("imported_dispatch_report_records")
        .upsert(withId, { onConflict: "report_id,boost_item_id" });
      if (error) throw new Error(error.message);
    }
    if (withoutId.length) {
      const { error } = await context.supabase.from("imported_dispatch_report_records").insert(withoutId);
      if (error) throw new Error(error.message);
    }
    return { inserted: rows.length };
  });

export const getImportedReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row, error } = await context.supabase
      .from("imported_dispatch_reports").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    return row ?? null;
  });

export const listImportedRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      reportId: z.string().uuid(),
      search: z.string().optional().nullable(),
      status: z.enum(["all", "completed", "error"]).default("all"),
      page: z.number().int().min(0).default(0),
      perPage: z.number().int().min(1).max(1000).default(50),
    }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const build = () => {
      let q = context.supabase
        .from("imported_dispatch_report_records")
        .select(
          "id,boost_item_id,lead_id,status,name,phone,email,created_at_source,entered_at,started_at,status_changed_at,whatsapp_instance_id,is_pending,last_sent_message_id,last_sent_at,last_sent_error_code,last_received_message_id,last_received_at,last_received_error_code,error_code,error_message,message_status",
          { count: "exact" },
        )
        .eq("report_id", data.reportId);
      if (data.status !== "all") q = q.eq("status", data.status);
      const term = (data.search ?? "").trim();
      if (term) {
        const safe = term.replace(/[%,()]/g, " ");
        q = q.or(
          [
            `name.ilike.%${safe}%`,
            `phone.ilike.%${safe}%`,
            `email.ilike.%${safe}%`,
            `lead_id.ilike.%${safe}%`,
            `boost_item_id.ilike.%${safe}%`,
            `last_sent_message_id.ilike.%${safe}%`,
            `last_received_message_id.ilike.%${safe}%`,
          ].join(","),
        );
      }
      return q;
    };

    const from = data.page * data.perPage;
    const { data: rows, count, error } = await build()
      .order("started_at", { ascending: true, nullsFirst: false })
      .range(from, from + data.perPage - 1);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });
