import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const optStr = (max: number) =>
  z.union([z.string().trim().max(max), z.literal(""), z.null()])
    .transform((v) => (v === "" || v == null ? null : v)).optional();

const optUuid = z.union([z.string().uuid(), z.literal(""), z.null()])
  .transform((v) => (v ? (v as string) : null)).optional();

const fields = {
  connection_id: optUuid,
  waba_ref_id: optUuid,
  name: z.string().trim().min(1).max(160),
  language: z.string().trim().min(2).max(10).default("pt_BR"),
  category: optStr(60),
  status: z.enum(["approved", "pending", "rejected", "paused", "disabled"]).default("approved"),
  header_type: optStr(20),
  header_text: optStr(1000),
  header_media_url: optStr(1000),
  body: z.string().trim().max(4000).default(""),
  footer: optStr(200),
  variables: z.any().optional(),
  variables_examples: z.any().optional(),
  buttons: z.any().optional(),
  meta_template_id: optStr(120),
};

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("whatsapp_templates")
      .select("*, connection:whatsapp_connections(id,name,display_phone), waba:whatsapp_wabas(id,nome_interno,waba_id)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const createTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object(fields).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row, error } = await context.supabase
      .from("whatsapp_templates")
      .insert(data)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const updateTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), ...fields }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { id, ...patch } = data;
    const { data: row, error } = await context.supabase
      .from("whatsapp_templates")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("whatsapp_templates").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const syncTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ connection_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: conn, error: cErr } = await context.supabase
      .from("whatsapp_connections")
      .select("id,waba_id,access_token,graph_api_version")
      .eq("id", data.connection_id)
      .single();
    if (cErr) throw cErr;
    if (!conn?.waba_id || !conn?.access_token) {
      throw new Error("Número não possui WABA ID ou Access Token configurados.");
    }
    const { syncConnectionTemplates } = await import("@/lib/wa-templates-sync.server");
    const r = await syncConnectionTemplates(context.supabase, conn);
    if (!r.ok) throw new Error(r.error || "Falha ao sincronizar");
    return { synced: r.synced, total: r.total };
  });

export const syncAllTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { syncAllConnections } = await import("@/lib/wa-templates-sync.server");
    return await syncAllConnections(context.supabase);
  });
