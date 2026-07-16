import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const optStr = (max: number) =>
  z
    .union([z.string().trim().max(max), z.literal(""), z.null()])
    .transform((v) => (v === "" || v == null ? null : v))
    .optional();

const fields = {
  name: z.string().trim().min(1).max(160),
  phone: optStr(40),
  display_phone: optStr(40),
  provider: z.string().trim().min(1).max(60).default("meta_cloud"),
  phone_number_id: optStr(80),
  waba_id: optStr(80),
  business_id: optStr(80),
  access_token: optStr(4000),
  verify_token: optStr(200),
  webhook_url: optStr(500),
  quality_rating: optStr(40),
  daily_limit: z.union([z.number(), z.string(), z.null()]).transform((v) => (v == null || v === "" ? 1000 : Number(v))).optional(),
  graph_api_version: optStr(20),
  client_id: z.union([z.string().uuid(), z.literal(""), z.null()]).transform((v) => (v ? (v as string) : null)).optional(),
  project_id: z.union([z.string().uuid(), z.literal(""), z.null()]).transform((v) => (v ? (v as string) : null)).optional(),
  status: z.enum(["ativa", "inativa", "erro"]).optional(),
};

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

export const listNumbers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("whatsapp_connections")
      .select("*, client:clients(id,name), project:projects(id,name)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const createNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object(fields).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row, error } = await context.supabase
      .from("whatsapp_connections")
      .insert(data)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const updateNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), ...fields }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { id, ...patch } = data;
    if (!patch.access_token) delete patch.access_token;
    const { data: row, error } = await context.supabase
      .from("whatsapp_connections")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("whatsapp_connections").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
