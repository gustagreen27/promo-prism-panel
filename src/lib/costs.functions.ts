import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const optStr = (max: number) =>
  z.union([z.string().trim().max(max), z.literal(""), z.null()])
    .transform((v) => (v === "" || v == null ? null : v)).optional();
const optDate = z.union([z.string().trim().min(1), z.literal(""), z.null()])
  .transform((v) => (v === "" || v == null ? null : v)).optional();
const optUuid = z.union([z.string().uuid(), z.literal(""), z.null()])
  .transform((v) => (v ? (v as string) : null)).optional();
const num = z.union([z.number(), z.string()]).transform((v) => Number(v));
const participants = z.array(z.enum(["gustavo", "cayo"])).optional().default([]);

const fields = {
  client_id: optUuid,
  project_id: optUuid,
  category: z.string().trim().min(1).max(80),
  supplier: optStr(160),
  description: z.string().trim().min(1).max(240),
  amount: num,
  due_date: optDate,
  paid_date: optDate,
  status: z.enum(["pendente", "pago", "atrasado", "cancelado"]).optional(),
  is_recurring: z.boolean().optional(),
  recurrence_type: optStr(40),
  notes: optStr(2000),
  participants,
};
const createSchema = z.object(fields);
const updateSchema = z.object({ id: z.string().uuid(), ...fields });

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

export const listCosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("costs")
      .select("*, client:clients(id,name), project:projects(id,name)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const createCost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row, error } = await context.supabase.from("costs").insert(data).select().single();
    if (error) throw error;
    return row;
  });

export const updateCost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { id, ...patch } = data;
    const { data: row, error } = await context.supabase.from("costs").update(patch).eq("id", id).select().single();
    if (error) throw error;
    return row;
  });

export const deleteCost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("costs").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
