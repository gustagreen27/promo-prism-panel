// ============================================================================
// Personalização pública — camada 100% isolada dos dados operacionais.
// Escreve/lê SOMENTE em:
//   - campaign_public_settings
//   - public_metrics_override
//   - campaign_public_dispatches
//   - public_progress_simulation
// NUNCA toca: wa_campaigns, campaign_recipients, wa_campaign_runner, filas,
// webhooks, eventos da Meta, message_logs, wa_campaign_attempts.
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const metricKind = z.enum(["country", "city", "device", "browser"]);
const dispatchMode = z.enum(["real", "fixed", "auto"]);
const metricsMode = z.enum(["real", "replace", "merge"]);
const growthKind = z.enum(["linear", "random", "batches", "stepped", "real_plus", "manual"]);

async function assertMember(context: { supabase: any; userId: string }) {
  // requireSupabaseAuth já autentica; RLS das tabelas garante que só o membro
  // do workspace da campanha consegue mexer. Aqui apenas garantimos que há user.
  if (!context.userId) throw new Error("Unauthorized");
}

// ============================================================================
// LEITURA
// ============================================================================
export const getCampaignPublicCustomization = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ campaignId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertMember(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [settings, metrics, dispatches, sims, waRows] = await Promise.all([
      supabaseAdmin
        .from("campaign_public_settings")
        .select("*")
        .eq("campaign_id", data.campaignId)
        .maybeSingle(),
      supabaseAdmin
        .from("public_metrics_override")
        .select("*")
        .eq("campaign_id", data.campaignId)
        .order("kind", { ascending: true })
        .order("position", { ascending: true }),
      supabaseAdmin
        .from("campaign_public_dispatches")
        .select("*")
        .eq("campaign_id", data.campaignId),
      supabaseAdmin
        .from("public_progress_simulation")
        .select("*")
        .eq("campaign_id", data.campaignId),
      supabaseAdmin
        .from("wa_campaigns")
        .select("id, name, status, scheduled_at, total_recipients, sent_count, delivered_count, failed_count, progress")
        .eq("linked_campaign_id", data.campaignId)
        .order("created_at", { ascending: true }),
    ]);
    if (settings.error) throw settings.error;
    if (metrics.error) throw metrics.error;
    if (dispatches.error) throw dispatches.error;
    if (sims.error) throw sims.error;
    if (waRows.error) throw waRows.error;

    return {
      settings: settings.data ?? null,
      metrics: metrics.data ?? [],
      dispatches: dispatches.data ?? [],
      simulations: sims.data ?? [],
      waDispatches: waRows.data ?? [],
    };
  });

// ============================================================================
// SETTINGS (campanha-nível: master + métricas gerais)
// ============================================================================
const settingsPatchSchema = z.object({
  campaignId: z.string().uuid(),
  enabled: z.boolean().optional(),
  metrics_mode: metricsMode.optional(),
  custom_totals: z
    .object({
      clicks: z.number().int().min(0).nullable().optional(),
      countries_count: z.number().int().min(0).nullable().optional(),
      cities_count: z.number().int().min(0).nullable().optional(),
      devices_count: z.number().int().min(0).nullable().optional(),
    })
    .optional(),
  clicks_series: z
    .array(z.object({ date: z.string(), count: z.number().int().min(0) }))
    .optional(),
  hourly_series: z
    .array(z.object({ hour: z.string(), count: z.number().int().min(0) }))
    .optional(),
  clicks_generator: z
    .object({
      enabled: z.boolean().default(false),
      initial: z.number().int().min(0).default(0),
      rate: z.number().min(0).max(100).default(10),
      min_pct: z.number().min(0).max(100).nullable().optional(),
      max_pct: z.number().min(0).max(100).nullable().optional(),
      max_clicks: z.number().int().min(0).nullable().optional(),
      refresh_interval_sec: z.number().int().min(1).max(3600).default(10),
      growth: z.enum(["linear", "random"]).default("random"),
      use_source: z.enum(["real", "public"]).default("public"),
      replace_or_add: z.enum(["replace", "add"]).default("replace"),
    })
    .optional(),
});

export const upsertCampaignPublicSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => settingsPatchSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertMember(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { campaignId, ...patch } = data;
    const { data: existing } = await supabaseAdmin
      .from("campaign_public_settings")
      .select("campaign_id")
      .eq("campaign_id", campaignId)
      .maybeSingle();
    const payload = {
      campaign_id: campaignId,
      ...patch,
      updated_by: context.userId,
    };
    if (existing) {
      const { error } = await supabaseAdmin
        .from("campaign_public_settings")
        .update(payload as never)
        .eq("campaign_id", campaignId);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin
        .from("campaign_public_settings")
        .insert(payload as never);
      if (error) throw error;
    }
    return { ok: true };
  });

export const clearAllPublicOverrides = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaignId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await Promise.all([
      supabaseAdmin.from("campaign_public_settings").delete().eq("campaign_id", data.campaignId),
      supabaseAdmin.from("public_metrics_override").delete().eq("campaign_id", data.campaignId),
      supabaseAdmin.from("campaign_public_dispatches").delete().eq("campaign_id", data.campaignId),
      supabaseAdmin.from("public_progress_simulation").delete().eq("campaign_id", data.campaignId),
    ]);
    return { ok: true };
  });

// ============================================================================
// METRIC OVERRIDES (países/cidades/dispositivos/navegadores)
// ============================================================================
export const upsertMetricOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        campaignId: z.string().uuid(),
        kind: metricKind,
        label: z.string().trim().min(1).max(120),
        count: z.number().int().min(0).max(1_000_000_000),
        position: z.number().int().min(0).max(1000).default(0),
        percent: z.number().min(0).max(100).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("public_metrics_override")
        .update({
          label: data.label,
          count: data.count,
          position: data.position,
          percent: data.percent ?? null,
        } as never)
        .eq("id", data.id);
      if (error) throw error;
      return { ok: true, id: data.id };
    }
    const { data: inserted, error } = await supabaseAdmin
      .from("public_metrics_override")
      .insert({
        campaign_id: data.campaignId,
        kind: data.kind,
        label: data.label,
        count: data.count,
        position: data.position,
        percent: data.percent ?? null,
      } as never)
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: (inserted as { id: string }).id };
  });

export const deleteMetricOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("public_metrics_override")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const reorderMetricOverrides = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).max(200) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await Promise.all(
      data.ids.map((id, idx) =>
        supabaseAdmin
          .from("public_metrics_override")
          .update({ position: idx } as never)
          .eq("id", id),
      ),
    );
    return { ok: true };
  });

// ============================================================================
// DISPATCH OVERRIDES (por wa_campaign)
// ============================================================================
const dispatchPatchSchema = z.object({
  waCampaignId: z.string().uuid(),
  campaignId: z.string().uuid(),
  enabled: z.boolean().optional(),
  mode: dispatchMode.optional(),
  public_name: z.string().trim().max(160).nullable().optional(),
  public_status: z.string().trim().max(60).nullable().optional(),
  fixed: z
    .object({
      total: z.number().int().min(0).nullable().optional(),
      sent: z.number().int().min(0).nullable().optional(),
      delivered: z.number().int().min(0).nullable().optional(),
      failed: z.number().int().min(0).nullable().optional(),
      percent: z.number().min(0).max(100).nullable().optional(),
      started_at: z.string().nullable().optional(),
      eta_at: z.string().nullable().optional(),
      speed_label: z.string().trim().max(80).nullable().optional(),
      updated_at: z.string().nullable().optional(),
    })
    .optional(),
});

export const upsertPublicDispatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => dispatchPatchSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { waCampaignId, campaignId, ...rest } = data;
    const { data: existing } = await supabaseAdmin
      .from("campaign_public_dispatches")
      .select("wa_campaign_id")
      .eq("wa_campaign_id", waCampaignId)
      .maybeSingle();
    const payload = {
      wa_campaign_id: waCampaignId,
      campaign_id: campaignId,
      ...rest,
      updated_by: context.userId,
    };
    if (existing) {
      const { error } = await supabaseAdmin
        .from("campaign_public_dispatches")
        .update(payload as never)
        .eq("wa_campaign_id", waCampaignId);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin
        .from("campaign_public_dispatches")
        .insert(payload as never);
      if (error) throw error;
    }
    return { ok: true };
  });

// ============================================================================
// SIMULATION (progressão automática por dispatch)
// ============================================================================
const simulationPatchSchema = z.object({
  waCampaignId: z.string().uuid(),
  campaignId: z.string().uuid(),
  start_at: z.string().nullable().optional(),
  end_at: z.string().nullable().optional(),
  duration_sec: z.number().int().min(0).nullable().optional(),
  refresh_interval_sec: z.number().int().min(1).max(3600).optional(),
  sent_start: z.number().int().min(0).optional(),
  sent_end: z.number().int().min(0).optional(),
  delivered_ratio: z.number().min(0).max(1).nullable().optional(),
  failed_ratio: z.number().min(0).max(1).nullable().optional(),
  delivered_start: z.number().int().min(0).nullable().optional(),
  delivered_end: z.number().int().min(0).nullable().optional(),
  failed_start: z.number().int().min(0).nullable().optional(),
  failed_end: z.number().int().min(0).nullable().optional(),
  percent_start: z.number().min(0).max(100).nullable().optional(),
  percent_end: z.number().min(0).max(100).nullable().optional(),
  growth: growthKind.optional(),
  growth_params: z.record(z.string(), z.unknown()).optional(),
  pauses: z
    .array(
      z.object({
        after_sent: z.number().int().min(0),
        duration_sec: z.number().int().min(0),
        status_label: z.string().trim().max(60).nullable().optional(),
        recalc_eta: z.boolean().default(false),
      }),
    )
    .optional(),
  status_label: z.string().trim().max(60).nullable().optional(),
});

export const upsertPublicSimulation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => simulationPatchSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { waCampaignId, campaignId, ...rest } = data;
    const { data: existing } = await supabaseAdmin
      .from("public_progress_simulation")
      .select("wa_campaign_id")
      .eq("wa_campaign_id", waCampaignId)
      .maybeSingle();
    const payload = { wa_campaign_id: waCampaignId, campaign_id: campaignId, ...rest };
    if (existing) {
      const { error } = await supabaseAdmin
        .from("public_progress_simulation")
        .update(payload as never)
        .eq("wa_campaign_id", waCampaignId);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin
        .from("public_progress_simulation")
        .insert(payload as never);
      if (error) throw error;
    }
    return { ok: true };
  });

export const controlPublicSimulation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        waCampaignId: z.string().uuid(),
        action: z.enum(["start", "pause", "resume", "restart", "sync_real", "disable"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();

    if (data.action === "disable") {
      await supabaseAdmin
        .from("public_progress_simulation")
        .delete()
        .eq("wa_campaign_id", data.waCampaignId);
      return { ok: true };
    }

    const { data: row, error } = await supabaseAdmin
      .from("public_progress_simulation")
      .select("*")
      .eq("wa_campaign_id", data.waCampaignId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Simulação não configurada");

    const rt = ((row as any).runtime ?? { active: false }) as {
      active?: boolean;
      started_at?: string | null;
      paused_at?: string | null;
      accumulated_pause_ms?: number;
    };

    if (data.action === "start" || data.action === "restart") {
      rt.active = true;
      rt.started_at = nowIso;
      rt.paused_at = null;
      rt.accumulated_pause_ms = 0;
    } else if (data.action === "pause") {
      if (rt.active && !rt.paused_at) rt.paused_at = nowIso;
    } else if (data.action === "resume") {
      if (rt.paused_at) {
        const delta = Date.now() - new Date(rt.paused_at).getTime();
        rt.accumulated_pause_ms = (rt.accumulated_pause_ms ?? 0) + Math.max(0, delta);
        rt.paused_at = null;
        rt.active = true;
      }
    } else if (data.action === "sync_real") {
      // Copia números reais para valores fixos SEM tocar em wa_campaigns.
      const { data: wa } = await supabaseAdmin
        .from("wa_campaigns")
        .select("total_recipients, sent_count, delivered_count, failed_count")
        .eq("id", data.waCampaignId)
        .maybeSingle();
      if (wa) {
        const total = (wa as any).total_recipients ?? 0;
        await supabaseAdmin
          .from("public_progress_simulation")
          .update({
            sent_start: (wa as any).sent_count ?? 0,
            sent_end: total,
            delivered_start: (wa as any).delivered_count ?? 0,
            failed_start: (wa as any).failed_count ?? 0,
          } as never)
          .eq("wa_campaign_id", data.waCampaignId);
      }
    }

    const { error: uErr } = await supabaseAdmin
      .from("public_progress_simulation")
      .update({ runtime: rt } as never)
      .eq("wa_campaign_id", data.waCampaignId);
    if (uErr) throw uErr;
    return { ok: true };
  });

export const duplicatePublicDispatchConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ fromWaId: z.string().uuid(), toWaId: z.string().uuid() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: src } = await supabaseAdmin
      .from("campaign_public_dispatches")
      .select("*")
      .eq("wa_campaign_id", data.fromWaId)
      .maybeSingle();
    if (src) {
      const { wa_campaign_id: _w, created_at: _c, updated_at: _u, ...rest } = src as any;
      await supabaseAdmin
        .from("campaign_public_dispatches")
        .upsert({ ...rest, wa_campaign_id: data.toWaId } as never, { onConflict: "wa_campaign_id" });
    }
    const { data: srcSim } = await supabaseAdmin
      .from("public_progress_simulation")
      .select("*")
      .eq("wa_campaign_id", data.fromWaId)
      .maybeSingle();
    if (srcSim) {
      const { wa_campaign_id: _w, created_at: _c, updated_at: _u, runtime: _rt, ...rest } = srcSim as any;
      await supabaseAdmin
        .from("public_progress_simulation")
        .upsert(
          { ...rest, wa_campaign_id: data.toWaId, runtime: { active: false } } as never,
          { onConflict: "wa_campaign_id" },
        );
    }
    return { ok: true };
  });
