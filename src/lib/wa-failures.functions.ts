/**
 * Motivos de falha, dead-letters e supressão global — leitura/gestão server-side.
 * Todas as consultas são paginadas/agregadas no Postgres (bases de 100k+).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { describeErrorCode } from "@/lib/wa/error-classifier";

async function assertStaff(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("is_internal_staff", { _user: ctx.userId });
  if (!data) {
    const { data: admin } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
    if (!admin) throw new Error("Forbidden");
  }
}

/** Top motivos de falha de uma campanha (agregado no banco). */
export const campaignFailureReasons = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaign_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const [reasonsRes, dlRes] = await Promise.all([
      context.supabase.rpc("wa_campaign_failure_reasons", { _campaign_id: data.campaign_id }),
      context.supabase
        .from("message_dead_letters")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", data.campaign_id),
    ]);
    if (reasonsRes.error) throw reasonsRes.error;
    const rows = (reasonsRes.data ?? []) as Array<{
      error_code: string;
      sample_reason: string | null;
      total: number;
      pct: number;
    }>;
    return {
      reasons: rows.map((r) => ({
        error_code: r.error_code,
        title: describeErrorCode(r.error_code),
        sample_reason: r.sample_reason,
        total: Number(r.total),
        pct: Number(r.pct),
      })),
      dead_letters: dlRes.count ?? 0,
    };
  });

/** Destinatários afetados por um código de erro — server-side, paginado. */
export const listFailedRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        campaign_id: z.string().uuid(),
        error_code: z.string().optional(),
        page: z.number().int().min(0).default(0),
        page_size: z.number().int().min(1).max(100).default(25),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const from = data.page * data.page_size;
    let q = context.supabase
      .from("campaign_recipients")
      .select(
        "id,phone,contact_name,attempt,error_code,failed_reason,failed_at,last_attempt_at,route_id,locked_route_id",
        { count: "exact" },
      )
      .eq("campaign_id", data.campaign_id)
      .eq("status", "failed")
      .order("failed_at", { ascending: false })
      .range(from, from + data.page_size - 1);

    if (data.error_code) {
      q = data.error_code === "desconhecido" ? q.is("error_code", null) : q.eq("error_code", data.error_code);
    }
    const { data: rows, count, error } = await q;
    if (error) throw error;
    return {
      rows: (rows ?? []).map((r: any) => ({ ...r, title: describeErrorCode(r.error_code) })),
      total: count ?? 0,
      page: data.page,
      page_size: data.page_size,
    };
  });

/** Dead-letters da campanha (auditoria). */
export const listDeadLetters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        campaign_id: z.string().uuid(),
        page: z.number().int().min(0).default(0),
        page_size: z.number().int().min(1).max(100).default(25),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const from = data.page * data.page_size;
    const { data: rows, count, error } = await context.supabase
      .from("message_dead_letters")
      .select("*", { count: "exact" })
      .eq("campaign_id", data.campaign_id)
      .order("created_at", { ascending: false })
      .range(from, from + data.page_size - 1);
    if (error) throw error;
    return { rows: rows ?? [], total: count ?? 0, page: data.page, page_size: data.page_size };
  });

/** Conferência da base ANTES do disparo. */
export const audiencePreflight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ list_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { data: res, error } = await context.supabase.rpc("wa_audience_preflight", { _list_id: data.list_id });
    if (error) throw error;
    return (res ?? {}) as {
      imported: number;
      invalid_phone: number;
      duplicates_removed: number;
      contact_opt_out: number;
      global_opt_out: number;
      suppressed: number;
      eligible: number;
    };
  });

// ================= SUPRESSÃO GLOBAL =================

export const listSuppressions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        search: z.string().optional(),
        reason: z.string().optional(),
        kind: z.enum(["all", "permanent", "temporary"]).default("all"),
        page: z.number().int().min(0).default(0),
        page_size: z.number().int().min(1).max(100).default(25),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const from = data.page * data.page_size;
    let q = context.supabase
      .from("recipient_suppression")
      .select("*", { count: "exact" })
      .order("last_seen_at", { ascending: false })
      .range(from, from + data.page_size - 1);

    const digits = (data.search ?? "").replace(/\D/g, "");
    if (digits) q = q.like("phone_normalized", `%${digits}%`);
    if (data.reason && data.reason !== "all") q = q.eq("reason", data.reason);
    if (data.kind === "permanent") q = q.eq("permanent", true);
    if (data.kind === "temporary") q = q.eq("permanent", false);

    const { data: rows, count, error } = await q;
    if (error) throw error;
    return { rows: rows ?? [], total: count ?? 0, page: data.page, page_size: data.page_size };
  });

export const addSuppression = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        phone: z.string().min(8),
        reason: z.enum(["manual_block", "opt_out", "invalid_number", "repeated_hard_failure"]).default("manual_block"),
        permanent: z.boolean().default(true),
        ttl_days: z.number().int().min(1).max(3650).optional(),
        note: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const phone = data.phone.replace(/\D/g, "");
    if (!phone) throw new Error("Telefone inválido");
    const { data: existing } = await context.supabase
      .from("recipient_suppression")
      .select("id,failure_count")
      .eq("phone_normalized", phone)
      .eq("scope", "global")
      .maybeSingle();

    const payload = {
      phone_normalized: phone,
      scope: "global",
      reason: data.reason,
      note: data.note ?? null,
      permanent: data.permanent,
      expires_at:
        data.permanent || !data.ttl_days
          ? null
          : new Date(Date.now() + data.ttl_days * 86400_000).toISOString(),
      last_seen_at: new Date().toISOString(),
      created_by: context.userId,
    };

    const { error } = existing
      ? await context.supabase.from("recipient_suppression").update(payload).eq("id", existing.id)
      : await context.supabase.from("recipient_suppression").insert(payload);
    if (error) throw error;
    return { ok: true, phone };
  });

export const removeSuppression = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { error } = await context.supabase.from("recipient_suppression").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/** Histórico de falhas definitivas de um telefone (auditoria da supressão). */
export const suppressionHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ phone: z.string().min(4) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const phone = data.phone.replace(/\D/g, "");
    const { data: rows, error } = await context.supabase
      .from("message_dead_letters")
      .select("id,campaign_id,error_code,error_title,error_message,attempts,last_attempt_at,phone_number_id,created_at")
      .eq("phone_normalized", phone)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return { rows: rows ?? [] };
  });
