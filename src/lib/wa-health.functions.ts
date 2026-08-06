import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Autoriza acesso à conexão (staff interno ou membro do workspace). */
async function authorizeConnection(supabase: any, userId: string, connectionId: string) {
  const { data: conn } = await supabase
    .from("whatsapp_connections")
    .select("id, workspace_id")
    .eq("id", connectionId)
    .maybeSingle();
  if (!conn) throw new Error("Conexão não encontrada.");
  const { data: staff } = await supabase.rpc("is_internal_staff", { _user: userId });
  if (staff) return conn;
  if (!conn.workspace_id) throw new Error("Forbidden");
  const { data: member } = await supabase.rpc("is_workspace_member", { _ws: conn.workspace_id, _user: userId });
  if (!member) throw new Error("Forbidden");
  return conn;
}

/** Visão geral: números + templates com o último health_status conhecido. */
export const getHealthOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase;
    const [{ data: conns }, { data: tpls }, { data: rows }] = await Promise.all([
      db.from("whatsapp_connections")
        .select("id, name, display_phone, phone_number_id, waba_id, status, workspace_id")
        .order("created_at", { ascending: true }),
      db.from("whatsapp_templates")
        .select("id, name, language, status, category, meta_template_id, connection_id")
        .not("meta_template_id", "is", null)
        .order("name", { ascending: true }),
      db.from("wa_health_status").select("*"),
    ]);

    const byNode = new Map<string, any>();
    const byTemplate = new Map<string, any>();
    for (const r of rows ?? []) {
      byNode.set(`${r.node_kind}:${r.node_id}`, r);
      if (r.template_ref_id) byTemplate.set(r.template_ref_id, r);
    }

    return {
      numbers: (conns ?? []).map((c: any) => {
        const h = byNode.get(`PHONE_NUMBER:${c.phone_number_id}`) ?? byNode.get(`WABA:${c.waba_id}`) ?? null;
        return {
          connection_id: c.id,
          label: c.display_phone || c.name,
          phone_number_id: c.phone_number_id,
          waba_id: c.waba_id,
          connection_status: c.status,
          health: h,
        };
      }),
      templates: (tpls ?? []).map((t: any) => ({
        template_ref_id: t.id,
        name: t.name,
        language: t.language,
        category: t.category,
        meta_template_id: t.meta_template_id,
        connection_id: t.connection_id,
        approval_status: t.status,
        health: byTemplate.get(t.id) ?? byNode.get(`MESSAGE_TEMPLATE:${t.meta_template_id}`) ?? null,
      })),
    };
  });

/** Refresh manual de um nó (número ou template). */
export const refreshHealthNode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    connection_id: z.string().uuid().optional(),
    template_ref_id: z.string().uuid().optional(),
  }).refine((v) => v.connection_id || v.template_ref_id, "informe connection_id ou template_ref_id").parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { refreshConnectionHealth, refreshTemplateHealth } = await import("@/lib/meta/wa-health.server");

    if (data.template_ref_id) {
      const { data: tpl } = await context.supabase
        .from("whatsapp_templates")
        .select("id, connection_id")
        .eq("id", data.template_ref_id)
        .maybeSingle();
      if (!tpl?.connection_id) throw new Error("Template não encontrado ou sem conexão.");
      await authorizeConnection(context.supabase, context.userId, tpl.connection_id);
      return await refreshTemplateHealth(supabaseAdmin, data.template_ref_id);
    }
    await authorizeConnection(context.supabase, context.userId, data.connection_id!);
    return await refreshConnectionHealth(supabaseAdmin, data.connection_id!);
  });

/** Refresh de todos os números (e opcionalmente templates aprovados) visíveis ao usuário. */
export const refreshAllHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ include_templates: z.boolean().default(false) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { refreshConnectionHealth, refreshTemplateHealth } = await import("@/lib/meta/wa-health.server");

    const { data: conns } = await context.supabase
      .from("whatsapp_connections")
      .select("id")
      .not("phone_number_id", "is", null);

    let numbers = 0;
    let templates = 0;
    const errors: string[] = [];
    for (const c of conns ?? []) {
      try { await refreshConnectionHealth(supabaseAdmin, c.id); numbers++; }
      catch (e: any) { errors.push(`conexão ${c.id}: ${e?.message}`); }
    }

    if (data.include_templates) {
      const { data: tpls } = await context.supabase
        .from("whatsapp_templates")
        .select("id")
        .eq("status", "approved")
        .not("meta_template_id", "is", null)
        .limit(120);
      for (const t of tpls ?? []) {
        try { await refreshTemplateHealth(supabaseAdmin, t.id); templates++; }
        catch (e: any) { errors.push(`template ${t.id}: ${e?.message}`); }
      }
    }
    return { numbers, templates, errors };
  });

/** Histórico de mudanças de status (data/hora). */
export const listHealthEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    node_id: z.string().trim().max(64).optional(),
    limit: z.number().int().min(1).max(200).default(60),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("wa_health_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.node_id) q = q.eq("node_id", data.node_id);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });
