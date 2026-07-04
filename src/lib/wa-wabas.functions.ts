import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

const optStr = (max: number) =>
  z.union([z.string().trim().max(max), z.literal(""), z.null()])
    .transform((v) => (v === "" || v == null ? null : v)).optional();

const optUuid = z.union([z.string().uuid(), z.literal(""), z.null()])
  .transform((v) => (v ? (v as string) : null)).optional();

const wabaFields = {
  nome_interno: z.string().trim().min(1).max(120),
  client_id: optUuid,
  project_id: optUuid,
  business_id: optStr(64),
  waba_id: z.string().trim().min(1).max(64),
  status: z.enum(["ativo", "inativo", "suspenso"]).default("ativo"),
  observacoes: optStr(2000),
};

export const listWabas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("whatsapp_wabas")
      .select("*, client:clients(id,name), project:projects(id,name)")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const ids = (data ?? []).map((w: any) => w.id);
    if (!ids.length) return [];

    const [{ data: nums }, { data: tpls }, { data: camps }] = await Promise.all([
      context.supabase.from("whatsapp_connections").select("waba_ref_id").in("waba_ref_id", ids),
      context.supabase.from("whatsapp_templates").select("waba_ref_id").in("waba_ref_id", ids),
      context.supabase.from("wa_campaigns").select("waba_ref_id").in("waba_ref_id", ids),
    ]);

    const count = (rows: any[] | null, id: string) =>
      (rows ?? []).filter((r) => r.waba_ref_id === id).length;

    return data!.map((w: any) => ({
      ...w,
      numbers_count: count(nums, w.id),
      templates_count: count(tpls, w.id),
      campaigns_count: count(camps, w.id),
    }));
  });

export const createWaba = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object(wabaFields).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row, error } = await context.supabase
      .from("whatsapp_wabas").insert(data).select().single();
    if (error) throw error;
    return row;
  });

export const updateWaba = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), ...wabaFields }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { id, ...patch } = data;
    const { data: row, error } = await context.supabase
      .from("whatsapp_wabas").update(patch).eq("id", id).select().single();
    if (error) throw error;
    return row;
  });

export const deleteWaba = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("whatsapp_wabas").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const getWabaChildren = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const [numbers, templates, campaigns] = await Promise.all([
      context.supabase.from("whatsapp_connections")
        .select("id,name,display_phone,phone_number_id,status,quality_rating")
        .eq("waba_ref_id", data.id),
      context.supabase.from("whatsapp_templates")
        .select("id,name,language,category,status")
        .eq("waba_ref_id", data.id),
      context.supabase.from("wa_campaigns")
        .select("id,name,status,total_recipients,sent_count,created_at")
        .eq("waba_ref_id", data.id).order("created_at", { ascending: false }),
    ]);
    return {
      numbers: numbers.data ?? [],
      templates: templates.data ?? [],
      campaigns: campaigns.data ?? [],
    };
  });
