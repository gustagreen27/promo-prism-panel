// Agendamento de campanhas WhatsApp + auditoria + detecção de conflito.
// Escopo: workspace member. Todas as chamadas validam membresia.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertWorkspaceMember(supabase: any, userId: string, workspaceId: string) {
  const { data } = await supabase.rpc("is_workspace_member", { _ws: workspaceId, _user: userId });
  if (!data) throw new Error("Você não tem acesso a este workspace.");
}

async function getCampaignForUser(supabase: any, userId: string, campaignId: string) {
  const { data: camp, error } = await supabase
    .from("wa_campaigns")
    .select("*, template:whatsapp_templates(id,name,status,language), connection:whatsapp_connections(id,display_name,display_phone,status,phone_number_id,access_token)")
    .eq("id", campaignId)
    .maybeSingle();
  if (error) throw error;
  if (!camp) throw new Error("Campanha não encontrada");
  await assertWorkspaceMember(supabase, userId, camp.workspace_id);
  return camp;
}

async function audit(supabase: any, campaign: any, actorId: string, action: string, message: string, extra: Record<string, any> = {}) {
  await supabase.from("campaign_audit_log").insert({
    campaign_id: campaign.id,
    workspace_id: campaign.workspace_id,
    actor_id: actorId,
    action,
    message,
    to_data: extra,
  });
}

// ---- Feed p/ calendário: mescla wa_campaigns + calendar_events sem campaign_id ----
export const listAgendaFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspace_id: z.string().uuid(),
    from: z.string().min(1),
    to: z.string().min(1),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertWorkspaceMember(context.supabase, context.userId, data.workspace_id);
    const { data: camps } = await context.supabase
      .from("wa_campaigns")
      .select("id,name,status,scheduled_at,started_at,finished_at,total_recipients,connection:whatsapp_connections(id,display_name,display_phone),template:whatsapp_templates(id,name),timezone")
      .eq("workspace_id", data.workspace_id)
      .not("scheduled_at", "is", null)
      .gte("scheduled_at", data.from)
      .lte("scheduled_at", data.to)
      .order("scheduled_at", { ascending: true });
    const { data: events } = await context.supabase
      .from("calendar_events")
      .select("id,title,event_type,status,start_time,end_time,description,campaign_id")
      .eq("workspace_id", data.workspace_id)
      .is("campaign_id", null)
      .gte("start_time", data.from)
      .lte("start_time", data.to)
      .order("start_time", { ascending: true });
    return {
      campaigns: camps ?? [],
      events: events ?? [],
    };
  });

// ---- Detecção de conflito ----
export const checkSchedulingConflict = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspace_id: z.string().uuid(),
    connection_id: z.string().uuid(),
    scheduled_at: z.string().min(1),
    duration_min: z.number().int().min(1).max(720).optional().default(30),
    exclude_id: z.string().uuid().nullish(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertWorkspaceMember(context.supabase, context.userId, data.workspace_id);
    const { data: rows, error } = await context.supabase.rpc("wa_check_scheduling_conflict" as any, {
      _connection_id: data.connection_id,
      _scheduled_at: new Date(data.scheduled_at).toISOString(),
      _duration_min: data.duration_min ?? 30,
      _exclude_id: data.exclude_id ?? null,
    });
    if (error) throw error;
    return { conflicts: rows ?? [] };
  });

// ---- Reagendar ----
export const rescheduleCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    campaign_id: z.string().uuid(),
    scheduled_at: z.string().min(1),
    timezone: z.string().optional(),
    force: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const camp = await getCampaignForUser(context.supabase, context.userId, data.campaign_id);
    const when = new Date(data.scheduled_at);
    if (Number.isNaN(when.getTime())) throw new Error("Data/hora inválida");
    if (when.getTime() < Date.now() - 60_000) throw new Error("A data/hora precisa ser futura");
    if (!data.force && camp.connection_id) {
      const { data: conflicts } = await context.supabase.rpc("wa_check_scheduling_conflict" as any, {
        _connection_id: camp.connection_id,
        _scheduled_at: when.toISOString(),
        _duration_min: 30,
        _exclude_id: camp.id,
      });
      if (conflicts && conflicts.length > 0) {
        const first = conflicts[0] as any;
        throw new Error(`Conflito com "${first.name}" às ${new Date(first.scheduled_at).toLocaleString("pt-BR")}. Reenvie com force=true para forçar.`);
      }
    }
    const patch: any = { scheduled_at: when.toISOString(), status: "scheduled" };
    if (data.timezone) patch.timezone = data.timezone;
    const { error } = await context.supabase.from("wa_campaigns").update(patch).eq("id", camp.id);
    if (error) throw error;
    await audit(context.supabase, camp, context.userId, "rescheduled", `Reagendada para ${when.toLocaleString("pt-BR")}`, { new_scheduled_at: when.toISOString() });
    // sincroniza google (fire-and-forget)
    void (async () => {
      try {
        const { syncCampaignToGoogleInternal } = await import("./google-calendar.functions");
        await syncCampaignToGoogleInternal(camp.workspace_id, camp.id);
      } catch { /* ignore */ }
    })();
    return { ok: true };
  });

// ---- Pausar / Retomar / Cancelar ----
export const pauseCampaignWs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaign_id: z.string().uuid(), reason: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const camp = await getCampaignForUser(context.supabase, context.userId, data.campaign_id);
    if (!["running", "scheduled"].includes(camp.status)) throw new Error("Só é possível pausar campanhas em execução ou agendadas.");
    await context.supabase.from("wa_campaigns").update({
      status: "paused", paused_at: new Date().toISOString(), paused_by: context.userId, pause_reason: data.reason ?? "user_paused",
    }).eq("id", camp.id);
    await audit(context.supabase, camp, context.userId, "paused", "Campanha pausada", { reason: data.reason });
    return { ok: true };
  });

export const resumeCampaignWs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaign_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const camp = await getCampaignForUser(context.supabase, context.userId, data.campaign_id);
    if (camp.status !== "paused") throw new Error("Somente campanhas pausadas podem ser retomadas.");
    const nextStatus = camp.started_at ? "running" : "scheduled";
    await context.supabase.from("wa_campaigns").update({
      status: nextStatus, paused_at: null, pause_reason: null, resumed_at: new Date().toISOString(),
    }).eq("id", camp.id);
    await audit(context.supabase, camp, context.userId, "resumed", "Campanha retomada", {});
    return { ok: true };
  });

export const cancelCampaignWs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaign_id: z.string().uuid(), reason: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const camp = await getCampaignForUser(context.supabase, context.userId, data.campaign_id);
    if (["completed", "cancelled"].includes(camp.status)) throw new Error("Campanha já encerrada.");
    await context.supabase.from("wa_campaigns").update({
      status: "cancelled", canceled_at: new Date().toISOString(), canceled_by: context.userId, finished_at: new Date().toISOString(),
    }).eq("id", camp.id);
    await context.supabase.from("campaign_recipients").update({ status: "cancelled" })
      .eq("campaign_id", camp.id).eq("status", "pending");
    await audit(context.supabase, camp, context.userId, "cancelled", "Campanha cancelada", { reason: data.reason });
    void (async () => {
      try {
        const { deleteCampaignFromGoogleInternal } = await import("./google-calendar.functions");
        await deleteCampaignFromGoogleInternal(camp.workspace_id, camp.id);
      } catch { /* ignore */ }
    })();
    return { ok: true };
  });

// ---- Duplicar campanha ----
export const duplicateCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    campaign_id: z.string().uuid(),
    new_name: z.string().optional(),
    new_scheduled_at: z.string().optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const camp = await getCampaignForUser(context.supabase, context.userId, data.campaign_id);
    const scheduled = data.new_scheduled_at ? new Date(data.new_scheduled_at) : null;
    const insertRow: any = {
      workspace_id: camp.workspace_id,
      name: data.new_name ?? `${camp.name} (cópia)`,
      client_id: camp.client_id,
      project_id: camp.project_id,
      connection_id: camp.connection_id,
      template_id: camp.template_id,
      template_variables: camp.template_variables,
      variables_mapping: camp.variables_mapping,
      button_url_mapping: camp.button_url_mapping,
      list_id: camp.list_id,
      tag_filters: camp.tag_filters,
      send_rate_per_min: camp.send_rate_per_min,
      batch_size: camp.batch_size,
      jitter_ms: camp.jitter_ms,
      max_per_hour: camp.max_per_hour,
      max_per_day: camp.max_per_day,
      quiet_hours_start: camp.quiet_hours_start,
      quiet_hours_end: camp.quiet_hours_end,
      timezone: camp.timezone,
      status: scheduled ? "scheduled" : "draft",
      scheduled_at: scheduled?.toISOString() ?? null,
      approval_mode: camp.approval_mode,
      approval_status: camp.approval_mode === "manual" ? "pending" : "not_required",
      created_by: context.userId,
    };
    const { data: created, error } = await context.supabase.from("wa_campaigns").insert(insertRow).select().single();
    if (error) throw error;
    await audit(context.supabase, created, context.userId, "duplicated", `Duplicada de "${camp.name}"`, { source_id: camp.id });
    return { campaign: created };
  });

// ---- Auditoria ----
export const getCampaignAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaign_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const camp = await getCampaignForUser(context.supabase, context.userId, data.campaign_id);
    const { data: rows } = await context.supabase
      .from("campaign_audit_log")
      .select("*, actor:profiles(id,full_name,email)")
      .eq("campaign_id", camp.id)
      .order("created_at", { ascending: false });
    return rows ?? [];
  });

// ---- Próximos disparos (para dashboard) ----
export const listUpcomingCampaigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspace_id: z.string().uuid(), limit: z.number().int().min(1).max(20).optional().default(5) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertWorkspaceMember(context.supabase, context.userId, data.workspace_id);
    const { data: rows } = await context.supabase
      .from("wa_campaigns")
      .select("id,name,status,scheduled_at,total_recipients,connection:whatsapp_connections(display_name,display_phone),template:whatsapp_templates(name)")
      .eq("workspace_id", data.workspace_id)
      .in("status", ["scheduled", "running", "paused"])
      .not("scheduled_at", "is", null)
      .gte("scheduled_at", new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(data.limit);
    return rows ?? [];
  });

// ---- Histórico com filtros ----
export const searchCampaignHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workspace_id: z.string().uuid(),
    from: z.string().optional().nullable(),
    to: z.string().optional().nullable(),
    status: z.string().optional().nullable(),
    connection_id: z.string().uuid().optional().nullable(),
    template_id: z.string().uuid().optional().nullable(),
    created_by: z.string().uuid().optional().nullable(),
    query: z.string().optional().nullable(),
    limit: z.number().int().min(1).max(200).optional().default(50),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertWorkspaceMember(context.supabase, context.userId, data.workspace_id);
    let q = context.supabase
      .from("wa_campaigns")
      .select("id,name,status,scheduled_at,started_at,finished_at,total_recipients,sent_count,failed_count,created_at,created_by,connection:whatsapp_connections(id,display_name,display_phone),template:whatsapp_templates(id,name),author:profiles!wa_campaigns_created_by_fkey(id,full_name,email)")
      .eq("workspace_id", data.workspace_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status as any);
    if (data.connection_id) q = q.eq("connection_id", data.connection_id);
    if (data.template_id) q = q.eq("template_id", data.template_id);
    if (data.created_by) q = q.eq("created_by", data.created_by);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    if (data.query) q = q.ilike("name", `%${data.query}%`);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });
