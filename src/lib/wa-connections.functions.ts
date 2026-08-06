import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { metaFetch } from "@/lib/meta/meta-client.server";

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
      .select("id,name,display_phone,workspace_id,waba_ref_id,waba_id,status,quality_rating,messaging_limit");
    const { data: wabas } = await context.supabase
      .from("whatsapp_wabas")
      .select("id,nome_interno,waba_id,workspace_id");

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const usage = new Map<string, number>();
    await Promise.all(
      (workspaces ?? []).map(async (w: any) => {
        const { count } = await context.supabase
          .from("whatsapp_messages")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", w.id)
          .gte("sent_at", since);
        usage.set(w.id, count ?? 0);
      }),
    );

    return (workspaces ?? []).map((w: any) => ({
      ...w,
      wabas: (wabas ?? []).filter((x: any) => x.workspace_id === w.id),
      connections: (conns ?? []).filter((c: any) => c.workspace_id === w.id),
      default_connection: (conns ?? []).find((c: any) => c.id === w.default_connection_id) ?? null,
      messages_last_24h: usage.get(w.id) ?? 0,
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

/** Assina o app da Meta na WABA desta conexão para começar a receber webhooks (statuses, replies). */
export const subscribeConnectionToApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ connection_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: conn, error } = await context.supabase
      .from("whatsapp_connections")
      .select("id,name,waba_id,access_token,use_global_token")
      .eq("id", data.connection_id)
      .maybeSingle();
    if (error) throw error;
    if (!conn) throw new Error("Conexão não encontrada.");
    if (!conn.waba_id) throw new Error("Esta conexão não tem waba_id.");

    const token = (!conn.use_global_token && conn.access_token)
      ? conn.access_token
      : process.env.WHATSAPP_ACCESS_TOKEN;
    if (!token) throw new Error("Sem token disponível para assinar (nem dedicado, nem WHATSAPP_ACCESS_TOKEN).");
    const source = (!conn.use_global_token && conn.access_token) ? "connection" : "env";

    const subscribed = await metaFetch(`/${conn.waba_id}/subscribed_apps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const listing = await metaFetch(`/${conn.waba_id}/subscribed_apps`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    return {
      ok: true,
      waba_id: conn.waba_id,
      token_source: source,
      subscribed,
      apps: (listing?.data ?? []) as Array<{
        whatsapp_business_api_data?: { id?: string; name?: string; link?: string };
      }>,
    };
  });

/**
 * Recalcula a capacidade (limite de disparos) buscando na Meta o
 * `whatsapp_business_manager_messaging_limit` de cada WABA do workspace
 * e gravando o tier em todas as conexões daquela WABA.
 */
export const recalcWorkspaceCapacity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ workspace_id: z.string().uuid().nullable().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { fetchWabaMessagingLimit } = await import("@/lib/wa-meta.server");

    let q = context.supabase
      .from("whatsapp_connections")
      .select("id,workspace_id,waba_id,access_token,use_global_token,messaging_limit");
    if (data?.workspace_id) q = q.eq("workspace_id", data.workspace_id);
    const { data: conns, error } = await q;
    if (error) throw error;

    const byWaba = new Map<string, any[]>();
    for (const c of conns ?? []) {
      if (!c.waba_id) continue;
      const k = String(c.waba_id);
      if (!byWaba.has(k)) byWaba.set(k, []);
      byWaba.get(k)!.push(c);
    }

    const results: Array<{ waba_id: string; tier: string | null; updated: number }> = [];
    await Promise.all(
      [...byWaba.entries()].map(async ([wabaId, items]) => {
        const withToken = items.find((c: any) => !c.use_global_token && c.access_token);
        const tier = await fetchWabaMessagingLimit(wabaId, withToken?.access_token ?? null);
        if (!tier) {
          results.push({ waba_id: wabaId, tier: null, updated: 0 });
          return;
        }
        const ids = items.map((c: any) => c.id);
        await context.supabase
          .from("whatsapp_connections")
          .update({ messaging_limit: String(tier), last_meta_sync_at: new Date().toISOString() })
          .in("id", ids);
        results.push({ waba_id: wabaId, tier: String(tier), updated: ids.length });
      }),
    );

    return {
      ok: true,
      wabas: results.length,
      resolved: results.filter((r) => r.tier).length,
      results,
    };
  });
