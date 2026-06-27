import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const optStr = (max: number) =>
  z
    .union([z.string().trim().max(max), z.literal(""), z.null()])
    .transform((v) => (v === "" || v == null ? null : v))
    .optional();

const optDate = z
  .union([z.string().trim().min(1), z.literal(""), z.null()])
  .transform((v) => (v === "" || v == null ? null : v))
  .optional();

const optNum = z
  .union([z.number(), z.string(), z.null()])
  .transform((v) => (v === "" || v == null ? null : Number(v)))
  .optional();

const fields = {
  name: z.string().trim().min(1).max(160),
  client_id: z.union([z.string().uuid(), z.literal(""), z.null()]).transform((v) => (v ? (v as string) : null)).optional(),
  description: optStr(2000),
  status: z.enum(["planejado", "em_andamento", "pausado", "concluido", "cancelado"]).optional(),
  start_date: optDate,
  end_date: optDate,
  contract_value: optNum,
  estimated_cost: optNum,
  responsible: optStr(120),
  notes: optStr(2000),
};

const createSchema = z.object(fields);
const updateSchema = z.object({ id: z.string().uuid(), ...fields });

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("projects")
      .select("*, client:clients(id,name)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row, error } = await context.supabase.from("projects").insert(data).select().single();
    if (error) throw error;
    return row;
  });

export const updateProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { id, ...patch } = data;
    const { data: row, error } = await context.supabase
      .from("projects")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("projects").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
