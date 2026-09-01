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

