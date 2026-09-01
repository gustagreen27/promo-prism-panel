import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PlatformCapacityAutomation = {
  auto_enabled: boolean;
  auto_start_time: string;
  auto_end_time: string;
  auto_interval_minutes: number;
  auto_min_step: number;
  auto_max_step: number;
  auto_target_completed: number;
  auto_last_run_at: string | null;
};

export type PlatformCapacity = PlatformCapacityAutomation & {
  daily_capacity: number;
  daily_completed: number;
  /** Sempre calculado: max(capacidade - realizados, 0). Nunca editável. */
  daily_available: number;
  internal_note: string | null;
  updated_at: string;
};

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const [{ data: a }, { data: s }] = await Promise.all([
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" }),
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "super_admin" }),
  ]);
  if (!a && !s) throw new Error("Forbidden");
}

const SELECT =
  "id, daily_capacity, daily_completed, daily_available, internal_note, updated_at, auto_enabled, auto_start_time, auto_end_time, auto_interval_minutes, auto_min_step, auto_max_step, auto_target_completed, auto_last_run_at";

function mapRow(data: any): PlatformCapacity {
  const capacity = Number(data.daily_capacity ?? 0);
  const completed = Number(data.daily_completed ?? 0);
  return {
    daily_capacity: capacity,
    daily_completed: completed,
    daily_available: Math.max(capacity - completed, 0),
    internal_note: data.internal_note ?? null,
    updated_at: data.updated_at as string,
    auto_enabled: !!data.auto_enabled,
    auto_start_time: String(data.auto_start_time ?? "08:00:00").slice(0, 5),
    auto_end_time: String(data.auto_end_time ?? "22:00:00").slice(0, 5),
    auto_interval_minutes: Number(data.auto_interval_minutes ?? 15),
    auto_min_step: Number(data.auto_min_step ?? 0),
    auto_max_step: Number(data.auto_max_step ?? 0),
    auto_target_completed: Number(data.auto_target_completed ?? 0),
    auto_last_run_at: (data.auto_last_run_at as string) ?? null,
  };
}

/** Visível para qualquer usuário autenticado — valor global único da plataforma. */
export const getPlatformCapacity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlatformCapacity | null> => {
    const { data, error } = await context.supabase
      .from("platform_capacity")
      .select(SELECT)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return mapRow(data);
  });

const intPositive = z.number().int().min(0).max(1_000_000_000);

// daily_available NUNCA é aceito aqui — é derivado no banco.
const schema = z
  .object({
    daily_capacity: intPositive.min(1, "A capacidade diária deve ser maior que zero"),
    daily_completed: intPositive,
    internal_note: z.string().trim().max(500).optional().nullable(),
  })
  .refine((d) => d.daily_completed <= d.daily_capacity, {
    message: "Total disparado hoje não pode ultrapassar a capacidade diária",
    path: ["daily_completed"],
  });

export const adminUpdatePlatformCapacity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    const { data: current } = await context.supabase
      .from("platform_capacity")
      .select(SELECT)
      .limit(1)
      .maybeSingle();

    const payload = {
      daily_capacity: data.daily_capacity,
      daily_completed: data.daily_completed,
      internal_note: data.internal_note ?? null,
      updated_by: context.userId,
    };

    let row;
    if (current) {
      const { data: updated, error } = await context.supabase
        .from("platform_capacity")
        .update(payload)
        .eq("id", current.id)
        .select(SELECT)
        .single();
      if (error) throw error;
      row = updated;
    } else {
      const { data: inserted, error } = await context.supabase
        .from("platform_capacity")
        .insert(payload)
        .select(SELECT)
        .single();
      if (error) throw error;
      row = inserted;
    }

    const snap = (c: any) => ({
      daily_capacity: Number(c.daily_capacity),
      daily_completed: Number(c.daily_completed),
      daily_available: Math.max(Number(c.daily_capacity) - Number(c.daily_completed), 0),
      internal_note: c.internal_note ?? null,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("platform_capacity_audit").insert({
      previous: current ? snap(current) : null,
      next: {
        daily_capacity: data.daily_capacity,
        daily_completed: data.daily_completed,
        daily_available: Math.max(data.daily_capacity - data.daily_completed, 0),
        internal_note: data.internal_note ?? null,
      },
      internal_note: data.internal_note ?? null,
      changed_by: context.userId,
    });

    return mapRow(row);
  });

const timeStr = z.string().regex(/^\d{2}:\d{2}$/, "Horário inválido");

const autoSchema = z
  .object({
    auto_enabled: z.boolean(),
    auto_start_time: timeStr,
    auto_end_time: timeStr,
    auto_interval_minutes: z.number().int().min(1).max(1440),
    auto_min_step: intPositive,
    auto_max_step: intPositive,
    auto_target_completed: intPositive,
  })
  .refine((d) => d.auto_max_step >= d.auto_min_step, {
    message: "A quantidade máxima deve ser maior ou igual à mínima",
    path: ["auto_max_step"],
  });

export const adminUpdateCapacityAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => autoSchema.parse(d))
  .handler(async ({ data, context }): Promise<PlatformCapacity> => {
    await assertAdmin(context);
    const { data: current } = await context.supabase
      .from("platform_capacity")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (!current) throw new Error("Configure a capacidade diária antes de ativar a automação");

    const { data: row, error } = await context.supabase
      .from("platform_capacity")
      .update({ ...data, updated_by: context.userId })
      .eq("id", current.id)
      .select(SELECT)
      .single();
    if (error) throw error;
    return mapRow(row);
  });

/** Executa manualmente um ciclo da automação (mesma rotina usada pelo cron). */
export const adminRunCapacityAutomationNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("platform_capacity_auto_tick");
    if (error) throw error;
    return data as { ran: boolean; reason?: string; added?: number };
  });

export const adminListPlatformCapacityAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("platform_capacity_audit")
      .select("id, previous, next, internal_note, changed_by, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;

    const rows = data ?? [];
    const ids = [...new Set(rows.map((r: any) => r.changed_by).filter(Boolean))];
    let names: Record<string, string> = {};
    if (ids.length) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      names = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p.full_name || p.email || p.id]));
    }
    return rows.map((r: any) => ({ ...r, changed_by_name: r.changed_by ? names[r.changed_by] ?? null : null }));
  });
