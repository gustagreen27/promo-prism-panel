import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const optUuid = z.union([z.string().uuid(), z.literal(""), z.null()])
  .transform((v) => (v ? (v as string) : null)).optional();
const num = z.union([z.number(), z.string(), z.null()])
  .transform((v) => (v == null || v === "" ? 0 : Number(v))).optional();
const optStr = (max: number) =>
  z.union([z.string().trim().max(max), z.literal(""), z.null()])
    .transform((v) => (v === "" || v == null ? null : v)).optional();

const fields = {
  client_id: optUuid,
  project_id: optUuid,
  campaign_id: optUuid,
  name: z.string().trim().min(1).max(160),
  url: optStr(500),
  status: z.enum(["ativa", "pausada", "encerrada"]).optional(),
  revenue: num,
  clicks: num,
  conversions: num,
};
const createSchema = z.object(fields);
const updateSchema = z.object({ id: z.string().uuid(), ...fields });

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

export const listUpsells = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("upsell_campaigns")
      .select("*, client:clients(id,name), project:projects(id,name)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const createUpsell = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row, error } = await context.supabase.from("upsell_campaigns").insert(data).select().single();
    if (error) throw error;
    return row;
  });

export const updateUpsell = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { id, ...patch } = data;
    const { data: row, error } = await context.supabase.from("upsell_campaigns").update(patch).eq("id", id).select().single();
    if (error) throw error;
    return row;
  });

export const deleteUpsell = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("upsell_campaigns").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
