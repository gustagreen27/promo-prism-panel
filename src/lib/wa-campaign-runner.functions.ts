// Server functions for the async campaign runner (preflight, start/pause/resume/cancel/retry, progress, timeline, report, CSV export)
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { renderMapping, fillMetaTemplate, metaVarsIn, buildContext } from "@/lib/wa-variables";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

async function logEvent(supabase: any, campaignId: string, event_type: string, message: string, actorId: string | null = null, payload: any = {}) {
  try {
    await supabase.from("campaign_timeline").insert({
      campaign_id: campaignId,
      event_type,
      message,
      actor_id: actorId,
      payload,
    });
  } catch {}
}

const idSchema = z.object({ id: z.string().uuid() });

/**
 * Preflight validation before starting a campaign.
 * Runs all business checks and returns a structured checklist.
 */
export const preflightCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabase = context.supabase;
    const checks: { key: string; label: string; ok: boolean; message?: string }[] = [];

    const { data: camp } = await supabase.from("wa_campaigns").select("*").eq("id", data.id).single();
    if (!camp) throw new Error("Campanha não encontrada");

    checks.push({ key: "client", label: "Cliente selecionado", ok: !!camp.client_id });
    checks.push({ key: "project", label: "Projeto selecionado", ok: !!camp.project_id });
    checks.push({ key: "list", label: "Lista de contatos selecionada", ok: !!camp.list_id });
    checks.push({ key: "connection", label: "Número WhatsApp selecionado", ok: !!camp.connection_id });
    checks.push({ key: "template", label: "Template selecionado", ok: !!camp.template_id });

    // Connection health
    let conn: any = null;
    if (camp.connection_id) {
      const { data: c } = await supabase.from("whatsapp_connections").select("*").eq("id", camp.connection_id).single();
      conn = c;
      checks.push({
        key: "connection_active",
        label: "Número ativo com token válido",
        ok: !!(c && c.status === "ativo" && c.access_token && c.phone_number_id),
        message: !c ? "Conexão não encontrada" : !c.access_token ? "Token ausente" : c.status !== "ativo" ? `Status: ${c.status}` : undefined,
      });
    }

    // Template approved
    if (camp.template_id) {
      const { data: t } = await supabase.from("whatsapp_templates").select("status,name").eq("id", camp.template_id).single();
      checks.push({
        key: "template_approved",
        label: "Template aprovado pela Meta",
        ok: t?.status === "approved",
        message: t ? `Status: ${t.status}` : "Template não encontrado",
      });
    }

    // Recipients built?
    const { count: recCount } = await supabase
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", data.id);
    checks.push({
      key: "recipients",
      label: `Fila de destinatários gerada (${recCount ?? 0})`,
      ok: (recCount ?? 0) > 0,
    });

    // Stock
    const { data: avail } = await supabase.rpc("wa_available_stock", {
      _client_id: camp.client_id ?? undefined,
      _project_id: camp.project_id ?? undefined,
    } as any);
    const available = Number(avail ?? 0);
    checks.push({
      key: "stock",
      label: `Estoque suficiente (${available} disponíveis, ${recCount ?? 0} necessárias)`,
      ok: available >= (recCount ?? 0) && (recCount ?? 0) > 0,
    });

    // Webhook configured (either global settings or connection-level)
    const { data: settingWebhook } = await supabase.from("settings").select("value").eq("key", "whatsapp_webhook").maybeSingle();
    const hasGlobalWebhook = !!(settingWebhook?.value as any)?.verify_token;
    const hasConnWebhook = !!conn?.verify_token;
    checks.push({
      key: "webhook",
      label: "Webhook configurado",
      ok: hasGlobalWebhook || hasConnWebhook,
    });

    return {
      ok: checks.every((c) => c.ok),
      checks,
      counts: { recipients: recCount ?? 0, stock: available },
    };
  });

export const startCampaignAsync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    // Reuse preflight
    const supabase = context.supabase;
    const { data: camp } = await supabase.from("wa_campaigns").select("*").eq("id", data.id).single();
    if (!camp) throw new Error("Campanha não encontrada");
    if (camp.status === "running") return { ok: true, alreadyRunning: true };

    // Basic guards
    if (!camp.connection_id || !camp.template_id) throw new Error("Configure número e template antes de iniciar.");

    const { count: recCount } = await supabase
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", data.id);
    if (!recCount) throw new Error("Gere a fila de destinatários antes de iniciar.");

    const { data: avail } = await supabase.rpc("wa_available_stock", {
      _client_id: camp.client_id ?? undefined,
      _project_id: camp.project_id ?? undefined,
    } as any);
    if (Number(avail ?? 0) < recCount) throw new Error(`Estoque insuficiente: ${avail ?? 0} disponíveis, ${recCount} necessárias.`);

    await supabase
      .from("wa_campaigns")
      .update({
        status: "running",
        started_at: camp.started_at ?? new Date().toISOString(),
        started_by: context.userId,
        total_recipients: recCount,
        last_error: null,
      })
      .eq("id", data.id);

    await logEvent(supabase, data.id, "started", `Campanha iniciada (${recCount} destinatários)`, context.userId, { total: recCount });

    // Trigger immediate tick (fire and forget)
    try {
      const url = new URL("/api/public/whatsapp/queue-tick", process.env.SUPABASE_URL?.replace(".supabase.co", ".lovable.app") ?? "https://project--9c7682d6-edcd-4388-a36c-36249d4d6ab8.lovable.app");
      fetch(url.toString(), { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => {});
    } catch {}

    return { ok: true };
  });

export const pauseCampaignAsync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await context.supabase
      .from("wa_campaigns")
      .update({ status: "paused", paused_at: new Date().toISOString(), paused_by: context.userId })
      .eq("id", data.id);
    await logEvent(context.supabase, data.id, "paused", "Campanha pausada", context.userId);
    return { ok: true };
  });

export const resumeCampaignAsync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await context.supabase
      .from("wa_campaigns")
      .update({ status: "running", resumed_at: new Date().toISOString() })
      .eq("id", data.id);
    await logEvent(context.supabase, data.id, "resumed", "Campanha retomada", context.userId);
    return { ok: true };
  });

export const cancelCampaignAsync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await context.supabase
      .from("campaign_recipients")
      .update({ status: "cancelled" })
      .eq("campaign_id", data.id)
      .eq("status", "pending");
    await context.supabase
      .from("wa_campaigns")
      .update({
        status: "cancelled",
        canceled_at: new Date().toISOString(),
        canceled_by: context.userId,
        finished_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    await logEvent(context.supabase, data.id, "cancelled", "Campanha cancelada", context.userId);
    return { ok: true };
  });

export const retryFailedRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: updated, error } = await context.supabase
      .from("campaign_recipients")
      .update({ status: "pending", failed_at: null, failed_reason: null, error_code: null })
      .eq("campaign_id", data.id)
      .eq("status", "failed")
      .select("id");
    if (error) throw error;
    await logEvent(context.supabase, data.id, "retry", `${updated?.length ?? 0} falhas reenfileiradas`, context.userId);
    // If campaign was completed/partial, put it running again
    await context.supabase
      .from("wa_campaigns")
      .update({ status: "running", finished_at: null })
      .eq("id", data.id)
      .in("status", ["completed", "partial", "error"]);
    return { ok: true, count: updated?.length ?? 0 };
  });

export const getCampaignProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: camp, error } = await context.supabase
      .from("wa_campaigns")
      .select("id,status,progress,last_error,last_sent_at,avg_speed_per_min,started_at,finished_at,total_recipients,scheduled_at")
      .eq("id", data.id)
      .single();
    if (error) throw error;

    const p = (camp.progress as any) ?? {};
    const remaining = (p.pending ?? 0) + (p.processing ?? 0);
    const speed = Number(camp.avg_speed_per_min ?? 0);
    const etaMinutes = speed > 0 ? Math.ceil(remaining / speed) : null;

    return { ...camp, eta_minutes: etaMinutes };
  });

export const getCampaignTimeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), limit: z.number().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: rows } = await context.supabase
      .from("campaign_timeline")
      .select("*, actor:profiles(email)")
      .eq("campaign_id", data.id)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 200);
    return rows ?? [];
  });

export const getCampaignRecipients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: z.string().optional(), limit: z.number().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let q = context.supabase
      .from("campaign_recipients")
      .select("id,phone,status,attempt,sent_at,delivered_at,read_at,replied_at,failed_at,failed_reason,error_code,meta_message_id,contact:contacts(name)")
      .eq("campaign_id", data.id)
      .order("created_at", { ascending: true })
      .limit(data.limit ?? 1000);
    if (data.status) q = q.eq("status", data.status as any);
    const { data: rows } = await q;
    return rows ?? [];
  });

export const getCampaignFinalReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: camp } = await context.supabase
      .from("wa_campaigns")
      .select("id,status,final_report,started_at,finished_at,name")
      .eq("id", data.id)
      .single();
    return camp;
  });

export const getCampaignErrors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: rows } = await context.supabase
      .from("campaign_recipients")
      .select("error_code,failed_reason,phone")
      .eq("campaign_id", data.id)
      .eq("status", "failed");
    const groups = new Map<string, { code: string; reason: string; count: number; samples: string[] }>();
    for (const r of rows ?? []) {
      const key = (r.error_code || r.failed_reason || "unknown") as string;
      const g = groups.get(key) ?? { code: r.error_code ?? "", reason: r.failed_reason ?? "", count: 0, samples: [] };
      g.count += 1;
      if (g.samples.length < 5) g.samples.push(r.phone);
      groups.set(key, g);
    }
    return Array.from(groups.values()).sort((a, b) => b.count - a.count);
  });

export const duplicateCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: camp } = await context.supabase.from("wa_campaigns").select("*").eq("id", data.id).single();
    if (!camp) throw new Error("Campanha não encontrada");
    const {
      id, created_at, updated_at, started_at, finished_at, paused_at, resumed_at, canceled_at,
      started_by, paused_by, canceled_by, progress, last_error, last_sent_at, avg_speed_per_min,
      final_report, worker_lease_until, worker_lease_id, sent_count, delivered_count, read_count,
      failed_count, replied_count, ...rest
    } = camp as any;
    const { data: created, error } = await context.supabase
      .from("wa_campaigns")
      .insert({
        ...rest,
        name: `${camp.name} (cópia)`,
        status: "draft",
        created_by: context.userId,
        total_recipients: 0,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: created.id };
  });
