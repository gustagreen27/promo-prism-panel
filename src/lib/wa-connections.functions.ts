import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { metaFetch, META_GRAPH_VERSION } from "@/lib/meta/meta-client.server";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

export const listWorkspaceConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data: workspaces, error } = await context.supabase
      .from("workspaces")
      .select("id,name,slug,plan,status,meta_business_id,meta_business_name,default_connection_id")
      .order("created_at", { ascending: true });
    if (error) throw error;

    const { data: conns } = await context.supabase
      .from("whatsapp_connections")
      .select("id,name,display_phone,workspace_id,waba_ref_id,waba_id,status,quality_rating");
    const { data: wabas } = await context.supabase
      .from("whatsapp_wabas")
      .select("id,nome_interno,waba_id,workspace_id");

    return (workspaces ?? []).map((w: any) => ({
      ...w,
      wabas: (wabas ?? []).filter((x: any) => x.workspace_id === w.id),
      connections: (conns ?? []).filter((c: any) => c.workspace_id === w.id),
      default_connection: (conns ?? []).find((c: any) => c.id === w.default_connection_id) ?? null,
    }));
  });

export const setWorkspaceBusinessId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspace_id: z.string().uuid(),
    meta_business_id: z.string().trim().max(64).nullable(),
    meta_business_name: z.string().trim().max(120).nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("workspaces").update({
      meta_business_id: data.meta_business_id,
      meta_business_name: data.meta_business_name ?? null,
    }).eq("id", data.workspace_id);
    if (error) throw error;
    return { ok: true };
  });

export const setWorkspaceDefaultConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspace_id: z.string().uuid(),
    connection_id: z.string().uuid().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("workspaces")
      .update({ default_connection_id: data.connection_id }).eq("id", data.workspace_id);
    if (error) throw error;
    return { ok: true };
  });

export const bindConnectionToWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    connection_id: z.string().uuid(),
    workspace_id: z.string().uuid().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("whatsapp_connections")
      .update({ workspace_id: data.workspace_id }).eq("id", data.connection_id);
    if (error) throw error;
    return { ok: true };
  });
