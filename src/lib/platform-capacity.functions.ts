import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PlatformCapacity = {
  daily_capacity: number;
  daily_completed: number;
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

/** Visível para qualquer usuário autenticado — valor global único da plataforma. */
export const getPlatformCapacity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlatformCapacity | null> => {
    const { data, error } = await context.supabase
      .from("platform_capacity")
      .select("daily_capacity, daily_completed, daily_available, internal_note, updated_at")
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      daily_capacity: Number(data.daily_capacity ?? 0),
      daily_completed: Number(data.daily_completed ?? 0),
      daily_available: Number(data.daily_available ?? 0),
      internal_note: data.internal_note ?? null,
      updated_at: data.updated_at as string,
    };
  });

const intPositive = z.number().int().min(0).max(1_000_000_000);

const schema = z
  .object({
    daily_capacity: intPositive,
    daily_completed: intPositive,
    daily_available: intPositive,
    internal_note: z.string().trim().max(500).optional().nullable(),
  })
  .refine((d) => d.daily_completed <= d.daily_capacity, {
    message: "Disparos realizados não podem ultrapassar a capacidade diária",
    path: ["daily_completed"],
  })
  .refine((d) => d.daily_available <= d.daily_capacity, {
    message: "Limite disponível não pode ultrapassar a capacidade diária",
    path: ["daily_available"],
  })
  .refine((d) => d.daily_completed + d.daily_available <= d.daily_capacity, {
    message: "A soma de realizados e disponíveis não pode ultrapassar a capacidade diária",
    path: ["daily_available"],
  });

export const adminUpdatePlatformCapacity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    const { data: current } = await context.supabase
      .from("platform_capacity")
      .select("id, daily_capacity, daily_completed, daily_available, internal_note")
      .limit(1)
      .maybeSingle();

    const payload = {
      daily_capacity: data.daily_capacity,
      daily_completed: data.daily_completed,
      daily_available: data.daily_available,
      internal_note: data.internal_note ?? null,
      updated_by: context.userId,
    };

    let row;
    if (current) {
      const { data: updated, error } = await context.supabase
        .from("platform_capacity")
        .update(payload)
        .eq("id", current.id)
        .select()
        .single();
      if (error) throw error;
      row = updated;
    } else {
      const { data: inserted, error } = await context.supabase
        .from("platform_capacity")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      row = inserted;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("platform_capacity_audit").insert({
      previous: current
        ? {
            daily_capacity: Number(current.daily_capacity),
            daily_completed: Number(current.daily_completed),
            daily_available: Number(current.daily_available),
            internal_note: current.internal_note ?? null,
          }
        : null,
      next: {
        daily_capacity: data.daily_capacity,
        daily_completed: data.daily_completed,
        daily_available: data.daily_available,
        internal_note: data.internal_note ?? null,
      },
      internal_note: data.internal_note ?? null,
      changed_by: context.userId,
    });

    return row;
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
