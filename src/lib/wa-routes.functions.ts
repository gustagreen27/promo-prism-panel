// Server functions to manage multi-route WhatsApp campaigns (routes CRUD, failover, template swap).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

const routeInput = z.object({
  connection_id: uuid,
  phone_number_id: z.string().min(1),
  waba_ref_id: uuid.nullable().optional(),
  template_id: uuid,
  template_name: z.string(),
  template_language: z.string(),
  template_category: z.string().nullable().optional(),
  priority: z.number().int().default(100),
  weight: z.number().int().min(1).default(100),
  is_primary: z.boolean().default(true),
  rate_requested: z.number().int().nullable().optional(),
  rate_effective: z.number().int().nullable().optional(),
  max_concurrency: z.number().int().nullable().optional(),
  variables_mapping: z.record(z.string(), z.any()).nullable().optional(),
  button_url_mapping: z.record(z.string(), z.any()).nullable().optional(),
});

const createInput = z.object({
  campaign_id: uuid,
  distribution_strategy: z
    .enum(["weighted", "round_robin", "primary_reserve", "template_primary_reserve", "custom"])
    .default("weighted"),
  template_failover_mode: z.enum(["manual", "auto"]).default("manual"),
  number_failover_mode: z.enum(["manual", "auto"]).default("manual"),
  routes: z.array(routeInput).min(1),
});

async function assertStaffOrWorkspace(ctx: any, campaignId: string) {
  const { supabase, userId } = ctx;
  const { data: staff } = await supabase.rpc("is_internal_staff" as any, { _user: userId });
  if (staff) return true;
  const { data: camp } = await supabase.from("wa_campaigns").select("workspace_id").eq("id", campaignId).maybeSingle();
  if (!camp?.workspace_id) throw new Error("Campanha sem workspace");
  const { data: member } = await supabase.rpc("is_workspace_member" as any, {
    _ws: camp.workspace_id, _user: userId,
  });
  if (!member) throw new Error("Sem permissão");
  return true;
}

/** Configure a campaign as multi-route and (re)create its routes. Idempotent per campaign_id. */
export const configureMultiRouteCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => createInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertStaffOrWorkspace(context, data.campaign_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: camp } = await supabaseAdmin
      .from("wa_campaigns")
      .select("id,workspace_id,status")
      .eq("id", data.campaign_id)
      .maybeSingle();
    if (!camp) throw new Error("Campanha não encontrada");

    // Wipe previous routes (only if none has already accepted messages, to avoid orphans).
    const { data: existing } = await supabaseAdmin
      .from("wa_campaign_routes")
      .select("id,accepted_count")
      .eq("campaign_id", data.campaign_id);
    const anyAccepted = (existing ?? []).some((r: any) => (r.accepted_count ?? 0) > 0);
    if (anyAccepted) throw new Error("Já existem rotas com envios aceitos; use gerenciar rotas para editar.");
    if (existing && existing.length > 0) {
      await supabaseAdmin.from("wa_campaign_routes").delete().eq("campaign_id", data.campaign_id);
    }

    const rows = data.routes.map((r) => ({
      campaign_id: data.campaign_id,
      workspace_id: camp.workspace_id,
      ...r,
      status: "active" as const,
    }));
    const { data: inserted, error } = await supabaseAdmin
      .from("wa_campaign_routes")
      .insert(rows)
      .select("id");
    if (error) throw error;

    await supabaseAdmin
      .from("wa_campaigns")
      .update({
        use_multi_route: true,
        distribution_strategy: data.distribution_strategy,
        template_failover_mode: data.template_failover_mode,
        number_failover_mode: data.number_failover_mode,
      })
      .eq("id", data.campaign_id);

    return { ok: true, route_ids: (inserted ?? []).map((r: any) => r.id) };
  });

export const listCampaignRoutes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ campaign_id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    await assertStaffOrWorkspace(context, data.campaign_id);
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("wa_campaign_routes")
      .select("*")
      .eq("campaign_id", data.campaign_id)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });

export const setRouteStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({
      route_id: uuid,
      status: z.enum(["active", "paused", "disabled"]),
      reason: z.string().nullable().optional(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: route } = await supabaseAdmin.from("wa_campaign_routes").select("campaign_id").eq("id", data.route_id).maybeSingle();
    if (!route) throw new Error("Rota não encontrada");
    await assertStaffOrWorkspace(context, route.campaign_id as string);

    const patch: any = { status: data.status };
    if (data.status === "disabled") patch.disabled_reason = data.reason ?? null;
    if (data.status === "active") patch.disabled_reason = null;
    const { error } = await supabaseAdmin.from("wa_campaign_routes").update(patch).eq("id", data.route_id);
    if (error) throw error;

    // When pausing/disabling: unlock non-dispatched recipients affine to this route.
    if (data.status !== "active") {
      await supabaseAdmin
        .from("campaign_recipients")
        .update({ locked_route_id: null, route_id: null })
        .eq("locked_route_id", data.route_id)
        .in("status", ["pending"]);
    }
    return { ok: true };
  });

/** Swap a route's template. Only affects recipients not yet accepted by Meta. */
export const replaceRouteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({
      route_id: uuid,
      template_id: uuid,
      variables_mapping: z.record(z.string(), z.any()).nullable().optional(),
      reason: z.string().nullable().optional(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: route } = await supabaseAdmin
      .from("wa_campaign_routes")
      .select("id,campaign_id,phone_number_id,waba_ref_id,template_id,template_name")
      .eq("id", data.route_id)
      .maybeSingle();
    if (!route) throw new Error("Rota não encontrada");
    await assertStaffOrWorkspace(context, route.campaign_id as string);

    const { data: tpl } = await supabaseAdmin
      .from("whatsapp_templates")
      .select("id,name,language,status,waba_ref_id,category")
      .eq("id", data.template_id)
      .maybeSingle();
    if (!tpl) throw new Error("Template não encontrado");
    if (String(tpl.status ?? "").toUpperCase() !== "APPROVED") throw new Error(`Template não aprovado (${tpl.status})`);
    if (route.waba_ref_id && tpl.waba_ref_id && route.waba_ref_id !== tpl.waba_ref_id) {
      throw new Error("Template pertence a WABA diferente do número desta rota");
    }

    const oldTemplate = { id: route.template_id, name: route.template_name };
    const { error } = await supabaseAdmin
      .from("wa_campaign_routes")
      .update({
        template_id: tpl.id,
        template_name: tpl.name,
        template_language: tpl.language,
        template_category: tpl.category ?? null,
        variables_mapping: data.variables_mapping ?? null,
        status: "active",
        last_error_code: null,
        last_error_message: null,
        disabled_reason: null,
      })
      .eq("id", data.route_id);
    if (error) throw error;

    // Unlock affine recipients still pending so the next tick uses the new template.
    await supabaseAdmin
      .from("campaign_recipients")
      .update({ locked_route_id: null })
      .eq("locked_route_id", data.route_id)
      .in("status", ["pending"]);

    await supabaseAdmin.from("campaign_timeline").insert({
      campaign_id: route.campaign_id,
      event_type: "template_changed",
      message: `Template ${oldTemplate.name} → ${tpl.name} (rota ${route.phone_number_id})`,
      payload: {
        route_id: route.id,
        old_template: oldTemplate,
        new_template: { id: tpl.id, name: tpl.name },
        reason: data.reason ?? null,
      },
    });

    return { ok: true };
  });

/** Add a single route to an existing multi-route campaign. */
export const addRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ campaign_id: uuid, route: routeInput }).parse(data))
  .handler(async ({ data, context }) => {
    await assertStaffOrWorkspace(context, data.campaign_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: camp } = await supabaseAdmin.from("wa_campaigns").select("workspace_id,use_multi_route").eq("id", data.campaign_id).maybeSingle();
    if (!camp) throw new Error("Campanha não encontrada");
    if (!camp.use_multi_route) throw new Error("Campanha não é multi-rota");
    const { data: row, error } = await supabaseAdmin
      .from("wa_campaign_routes")
      .insert({ campaign_id: data.campaign_id, workspace_id: camp.workspace_id, ...data.route, status: "active" })
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: row!.id };
  });

/** Remove a route (kept in history via foreign-key ON DELETE SET NULL on attempts). */
export const removeRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ route_id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: route } = await supabaseAdmin.from("wa_campaign_routes").select("campaign_id,accepted_count").eq("id", data.route_id).maybeSingle();
    if (!route) throw new Error("Rota não encontrada");
    await assertStaffOrWorkspace(context, route.campaign_id as string);
    // First unlock recipients affine to this route (pending only).
    await supabaseAdmin.from("campaign_recipients").update({ locked_route_id: null, route_id: null }).eq("locked_route_id", data.route_id).eq("status", "pending");
    // Then soft-remove: set status disabled instead of delete, to preserve attempts FK.
    await supabaseAdmin.from("wa_campaign_routes").update({ status: "disabled", disabled_reason: "Removida" }).eq("id", data.route_id);
    return { ok: true };
  });

export const listCampaignAttempts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ campaign_id: uuid, limit: z.number().int().max(500).default(200) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertStaffOrWorkspace(context, data.campaign_id);
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("wa_campaign_attempts")
      .select("*")
      .eq("campaign_id", data.campaign_id)
      .order("attempted_at", { ascending: false })
      .limit(data.limit);
    if (error) throw error;
    return rows ?? [];
  });
