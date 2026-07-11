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

    checks.push({ key: "client", label: "Cliente opcional no modo admin", ok: true, message: camp.client_id ? undefined : "Sem trava para administrador" });
    checks.push({ key: "project", label: "Projeto opcional no modo admin", ok: true, message: camp.project_id ? undefined : "Sem trava para administrador" });
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
        ok: !!(c && ["ativo", "active", "connected"].includes(String(c.status ?? "").toLowerCase()) && c.access_token && c.phone_number_id),
        message: !c ? "Conexão não encontrada" : !c.access_token ? "Token ausente" : !["ativo", "active", "connected"].includes(String(c.status ?? "").toLowerCase()) ? `Status: ${c.status}` : undefined,
      });
    }

    // Template approved
    if (camp.template_id) {
      const { data: t } = await supabase.from("whatsapp_templates").select("status,name").eq("id", camp.template_id).single();
      checks.push({
        key: "template_approved",
        label: "Template aprovado pela Meta",
        ok: String(t?.status ?? "").toLowerCase() === "approved",
        message: t ? `Status: ${t.status}` : "Template não encontrado",
      });
    }

    // Botões URL dinâmicos: exige parâmetro salvo para cada botão com {{n}}.
    if (camp.template_id) {
      const { data: tpl } = await supabase
        .from("whatsapp_templates")
        .select("buttons")
        .eq("id", camp.template_id)
        .single();
      const btns = (Array.isArray(tpl?.buttons) ? tpl.buttons : []) as any[];
      const btnMap = (camp.button_url_mapping as Record<string, string> | null) ?? {};
      const missing: string[] = [];
      btns.forEach((b: any, idx: number) => {
        if (String(b?.type).toUpperCase() !== "URL") return;
        const url = typeof b?.url === "string" ? b.url : "";
        if (!url.includes("{{")) return;
        const firstVar = url.match(/\{\{(\d+)\}\}/)?.[1] ?? "1";
        const value = (btnMap[String(idx)] ?? btnMap[firstVar] ?? "").trim();
        if (!value) missing.push(`{{${firstVar}}} do botão "${b?.text ?? `#${idx}`}"`);
      });
      checks.push({
        key: "button_params",
        label: "Parâmetros dos botões URL preenchidos",
        ok: missing.length === 0,
        message: missing.length ? `Preencha: ${missing.join(", ")}` : undefined,
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

    // Admin dispatch has no stock/cost lock.
    const available = recCount ?? 0;
    checks.push({
      key: "stock",
      label: "Estoque/custo liberado para administrador",
      ok: (recCount ?? 0) > 0,
      message: "Sem desconto de saldo ou estoque",
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

    // Admin async dispatch bypasses stock check.


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

/**
 * Swap number/template + variable mappings on a campaign.
 *
 * Multi-route: when the campaign is multi-route the patch is applied to the
 *   selected route (`route_id`) in `wa_campaign_routes`. Mappings are stored
 *   per-route (variables_mapping / button_url_mapping columns). The legacy
 *   mirror on `wa_campaigns.template_variables` / `variables_mapping` is
 *   only written when the campaign is legacy OR has exactly one active route
 *   (so other active routes aren't clobbered).
 *
 * Legacy: patch is applied to `wa_campaigns` directly.
 *
 * All validations (connection active, template APPROVED, WABA match, mapping
 * completeness) run BEFORE any UPDATE — no partial state on failure.
 *
 * Recipient safety: only recipients with meta_message_id IS NULL and status
 * in (pending, retrying) — and, when scoped to a route, locked_route_id =
 * that route — are eligible. Recipients already accepted/sent/delivered/read
 * are never touched. Transient retryable errors (131000/130429/timeout)
 * preserve locked_route_id; only route-swappable errors
 * (132015/132016/132001, rota/número indisponível) are unlocked.
 *
 * Resume mode:
 *   - "route"    → set only the route to active; leave campaign as-is.
 *   - "campaign" → resume the campaign (clear pause_reason, status=running).
 *   - "auto"     → resume the route; also resume the campaign only when it
 *                  was paused due to "no_active_route" and at least one
 *                  route is now eligible. Manual pauses are respected.
 *   - "none"     → no resume.
 */
export const swapCampaignRouteAndResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    route_id: z.string().uuid().optional().nullable(),
    connection_id: z.string().uuid().optional().nullable(),
    template_id: z.string().uuid().optional().nullable(),
    variables_mapping: z.record(z.string(), z.string()).optional(),
    button_url_mapping: z.record(z.string(), z.string()).optional(),
    retry_failed: z.boolean().optional().default(true),
    resume_mode: z.enum(["route", "campaign", "auto", "none"]).optional().default("auto"),
    reason: z.string().optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabase = context.supabase;

    const { data: camp, error: campErr } = await supabase
      .from("wa_campaigns").select("*").eq("id", data.id).single();
    if (campErr || !camp) throw new Error("Campanha não encontrada");

    const isMulti = !!(camp as any).use_multi_route;

    // ---- 1) Resolve target row (route in multi, campaign in legacy) ----
    let route: any = null;
    if (isMulti) {
      if (data.route_id) {
        const { data: r } = await supabase
          .from("wa_campaign_routes").select("*").eq("id", data.route_id).eq("campaign_id", data.id).maybeSingle();
        if (!r) throw new Error("Rota não encontrada");
        route = r;
      } else {
        // Fallback: only allow implicit route selection when there is exactly one route.
        const { data: rows } = await supabase
          .from("wa_campaign_routes").select("*").eq("campaign_id", data.id);
        if (!rows || rows.length === 0) throw new Error("Campanha multi-rota sem rotas");
        if (rows.length > 1) throw new Error("Informe route_id: campanha possui múltiplas rotas");
        route = rows[0];
      }
    }

    const currentConnId = route ? route.connection_id : (camp as any).connection_id;
    const currentTplId = route ? route.template_id : (camp as any).template_id;
    const currentWaba = route ? route.waba_ref_id : (camp as any).waba_ref_id;

    // ---- 2) Validate connection (if changed) ----
    let newConn: any = null;
    if (data.connection_id && data.connection_id !== currentConnId) {
      const { data: conn } = await supabase
        .from("whatsapp_connections")
        .select("id,status,access_token,phone_number_id,waba_ref_id")
        .eq("id", data.connection_id).maybeSingle();
      if (!conn) throw new Error("Número não encontrado");
      const active = ["ativo", "active", "connected"].includes(String(conn.status ?? "").toLowerCase());
      if (!active || !conn.access_token || !conn.phone_number_id) {
        throw new Error("Número selecionado não está ativo ou sem token válido");
      }
      newConn = conn;
    }

    const effectiveWaba = newConn?.waba_ref_id ?? currentWaba;

    // ---- 3) Validate template (if changed) ----
    let newTpl: any = null;
    if (data.template_id && data.template_id !== currentTplId) {
      const { data: tpl } = await supabase
        .from("whatsapp_templates")
        .select("id,name,language,status,waba_ref_id,category,body,buttons,header_type,header_text")
        .eq("id", data.template_id).maybeSingle();
      if (!tpl) throw new Error("Template não encontrado");
      const st = String(tpl.status ?? "").toUpperCase();
      if (st && st !== "APPROVED" && st !== "ACTIVE") {
        throw new Error(`Template não está aprovado (status: ${tpl.status})`);
      }
      if (tpl.waba_ref_id && effectiveWaba && tpl.waba_ref_id !== effectiveWaba) {
        throw new Error("Template não pertence à WABA do número selecionado");
      }
      newTpl = tpl;
    }

    // ---- 4) Validate mapping completeness against the FINAL template ----
    const finalTplId = newTpl?.id ?? currentTplId;
    const { data: finalTpl } = finalTplId
      ? await supabase.from("whatsapp_templates")
          .select("id,name,language,status,body,buttons,header_type,header_text")
          .eq("id", finalTplId).maybeSingle()
      : { data: null };

    const bodyVars = data.variables_mapping ?? {};
    const btnVars = data.button_url_mapping ?? {};

    if (finalTpl) {
      // Body {{n}} must have a mapping when the caller sends any mapping OR when
      // the template requires vars. If the user did not send variables_mapping,
      // preserve the previous mapping (route or campaign scope).
      const requiredBody = metaVarsIn(String(finalTpl.body ?? ""));
      const previousBody: Record<string, string> = data.variables_mapping
        ? bodyVars
        : ((route?.variables_mapping ?? (camp as any).variables_mapping ?? (camp as any).template_variables ?? {}) as any);
      const missingBody = requiredBody.filter((n) => !String(previousBody?.[String(n)] ?? "").trim());
      if (missingBody.length) {
        throw new Error(`Preencha as variáveis do corpo: ${missingBody.map((n) => `{{${n}}}`).join(", ")}`);
      }

      // URL buttons — index-aware mapping.
      const btns = (Array.isArray(finalTpl.buttons) ? finalTpl.buttons : []) as any[];
      const previousBtn: Record<string, string> = data.button_url_mapping
        ? btnVars
        : ((route?.button_url_mapping ?? (camp as any).button_url_mapping ?? {}) as any);
      const missingBtn: string[] = [];
      btns.forEach((b: any, idx: number) => {
        if (String(b?.type ?? "").toUpperCase() !== "URL") return;
        const url = String(b?.url ?? "");
        if (!url.includes("{{")) return;
        const first = url.match(/\{\{(\w+)\}\}/)?.[1] ?? "1";
        const v = String(previousBtn?.[String(idx)] ?? previousBtn?.[first] ?? "").trim();
        if (!v) missingBtn.push(`botão "${b?.text ?? `#${idx}`}"`);
      });
      if (missingBtn.length) {
        throw new Error(`Preencha os parâmetros dos ${missingBtn.join(", ")}`);
      }

      // Media header (image/video/document) requires a resolvable media_id or URL.
      const ht = String(finalTpl.header_type ?? "").toUpperCase();
      if (["IMAGE", "VIDEO", "DOCUMENT"].includes(ht)) {
        const headerVal = String(previousBody?._header_image_url ?? previousBody?._header_url ?? "").trim();
        if (!headerVal) {
          throw new Error(`Template exige mídia no cabeçalho (${ht}); informe _header_image_url no mapping`);
        }
      }
    }

    // ---- 5) Build patches (nothing written yet) ----
    const routePatch: Record<string, any> = {};
    const campPatch: Record<string, any> = {};

    if (newConn) {
      if (route) {
        routePatch.connection_id = newConn.id;
        routePatch.phone_number_id = newConn.phone_number_id;
        if (newConn.waba_ref_id) routePatch.waba_ref_id = newConn.waba_ref_id;
      } else {
        campPatch.connection_id = newConn.id;
        if (newConn.waba_ref_id) campPatch.waba_ref_id = newConn.waba_ref_id;
      }
    }
    if (newTpl) {
      if (route) {
        routePatch.template_id = newTpl.id;
        routePatch.template_name = newTpl.name;
        routePatch.template_language = newTpl.language;
        routePatch.template_category = newTpl.category ?? null;
      } else {
        campPatch.template_id = newTpl.id;
      }
    }
    if (data.variables_mapping) {
      if (route) routePatch.variables_mapping = data.variables_mapping;
      else {
        campPatch.variables_mapping = data.variables_mapping;
        campPatch.template_variables = data.variables_mapping; // legacy mirror
      }
    }
    if (data.button_url_mapping) {
      if (route) routePatch.button_url_mapping = data.button_url_mapping;
      else campPatch.button_url_mapping = data.button_url_mapping;
    }

    // ---- 6) Compute mirror rule for multi-route (only when 1 active route) ----
    if (isMulti && route && (data.variables_mapping || data.button_url_mapping)) {
      const { count: activeCount } = await supabase
        .from("wa_campaign_routes")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", data.id)
        .eq("status", "active");
      if ((activeCount ?? 0) <= 1) {
        if (data.variables_mapping) {
          campPatch.variables_mapping = data.variables_mapping;
          campPatch.template_variables = data.variables_mapping;
        }
        if (data.button_url_mapping) campPatch.button_url_mapping = data.button_url_mapping;
      }
    }

    // ---- 7) Snapshot BEFORE any write, for audit ----
    const auditBefore = route
      ? {
          route_id: route.id,
          phone_number_id: route.phone_number_id,
          template_id: route.template_id,
          template_name: route.template_name,
          variables_mapping: route.variables_mapping,
          button_url_mapping: route.button_url_mapping,
        }
      : {
          connection_id: (camp as any).connection_id,
          template_id: (camp as any).template_id,
          variables_mapping: (camp as any).variables_mapping,
          button_url_mapping: (camp as any).button_url_mapping,
        };

    // ---- 8) Apply patches (each guarded — throw on error, subsequent steps skipped) ----
    if (route && Object.keys(routePatch).length > 0) {
      routePatch.status = "active";
      routePatch.last_error_code = null;
      routePatch.last_error_message = null;
      routePatch.disabled_reason = null;
      const { error } = await supabase.from("wa_campaign_routes").update(routePatch).eq("id", route.id);
      if (error) throw error;
    }
    if (Object.keys(campPatch).length > 0) {
      const { error } = await supabase.from("wa_campaigns").update(campPatch).eq("id", data.id);
      if (error) throw error;
    }

    // ---- 9) Recipient unlock (only route-swappable ones) ----
    // Only touches: pending / retrying, meta_message_id IS NULL, no accepted state.
    const SWAPPABLE_CODES = ["132015", "132016", "132001", "132000", "132007", "132012", "190", "131057", "131037", "131045", "131031"];
    let affectedPending = 0;
    if (data.retry_failed) {
      let q = supabase
        .from("campaign_recipients")
        .update({ status: "pending", failed_at: null, next_attempt_at: null, locked_route_id: null })
        .eq("campaign_id", data.id)
        .in("status", ["failed", "retrying"])
        .is("meta_message_id", null);
      if (route) q = q.eq("locked_route_id", route.id);
      // Only route-swappable errors OR null error_code (unknown → treat as swappable when user asked).
      q = q.or(`error_code.in.(${SWAPPABLE_CODES.join(",")}),error_code.is.null`);
      const { data: reset } = await q.select("id");
      affectedPending = reset?.length ?? 0;
    }
    // Always unlock pending recipients affine to this route so they pick up the new template/number.
    if (route) {
      await supabase
        .from("campaign_recipients")
        .update({ locked_route_id: null })
        .eq("campaign_id", data.id)
        .eq("locked_route_id", route.id)
        .eq("status", "pending")
        .is("meta_message_id", null);
    }

    // ---- 10) Immutable audit event ----
    const auditAfter = route
      ? {
          route_id: route.id,
          phone_number_id: routePatch.phone_number_id ?? route.phone_number_id,
          template_id: routePatch.template_id ?? route.template_id,
          template_name: routePatch.template_name ?? route.template_name,
          variables_mapping: routePatch.variables_mapping ?? route.variables_mapping,
          button_url_mapping: routePatch.button_url_mapping ?? route.button_url_mapping,
        }
      : {
          connection_id: campPatch.connection_id ?? (camp as any).connection_id,
          template_id: campPatch.template_id ?? (camp as any).template_id,
          variables_mapping: campPatch.variables_mapping ?? (camp as any).variables_mapping,
          button_url_mapping: campPatch.button_url_mapping ?? (camp as any).button_url_mapping,
        };
    await logEvent(
      supabase, data.id, "route_swapped",
      route ? `Rota ${route.id} atualizada` : "Rota da campanha atualizada",
      context.userId,
      {
        scope: route ? "route" : "campaign",
        before: auditBefore,
        after: auditAfter,
        changed_by: context.userId,
        reason: data.reason ?? null,
        affected_pending_recipients: affectedPending,
      },
    );

    // ---- 11) Resume ----
    const mode = data.resume_mode;
    let resumed: "route" | "campaign" | "none" = "none";
    if (mode !== "none") {
      const pauseReason = (camp as any).pause_reason;
      const wasManual = pauseReason && String(pauseReason).toLowerCase().startsWith("manual");
      const shouldResumeCampaign =
        mode === "campaign" ||
        (mode === "auto" && !wasManual && (camp.status === "paused" || camp.status === "error") &&
          (pauseReason === "no_active_route" || pauseReason == null));

      if (shouldResumeCampaign) {
        await supabase
          .from("wa_campaigns")
          .update({
            status: "running",
            resumed_at: new Date().toISOString(),
            pause_reason: null,
            paused_at: null,
            finished_at: null,
            last_error: null,
          })
          .eq("id", data.id);
        await logEvent(supabase, data.id, "resumed", "Campanha retomada após troca de rota", context.userId);
        resumed = "campaign";
      } else if (route) {
        resumed = "route";
      }
    }

    return {
      ok: true,
      scope: route ? "route" : "campaign",
      route_id: route?.id ?? null,
      resumed,
      affected_pending_recipients: affectedPending,
    };
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

/**
 * Destrava campanha presa: libera lease, reenfileira "processing" órfãos
 * (sem meta_message_id) para "pending", retoma status quando estiver
 * paused/error e dispara um tick imediato. Usa apenas dados reais.
 */
export const unstickCampaignAsync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;

    const { data: camp, error: campErr } = await supabase
      .from("wa_campaigns")
      .select("id,status,worker_lease_until,total_recipients")
      .eq("id", data.id)
      .single();
    if (campErr) throw campErr;
    if (!camp) throw new Error("Campanha não encontrada");

    // 1) Libera lease
    await supabase
      .from("wa_campaigns")
      .update({ worker_lease_id: null, worker_lease_until: null })
      .eq("id", data.id);

    // 2) Reseta "processing" sem confirmação para "pending"
    const { data: resetRows, error: resetErr } = await supabase
      .from("campaign_recipients")
      .update({ status: "pending", failed_reason: null, error_code: null })
      .eq("campaign_id", data.id)
      .eq("status", "processing")
      .is("meta_message_id", null)
      .select("id");
    if (resetErr) throw resetErr;
    const reenqueued = resetRows?.length ?? 0;

    // 3) Conta pendentes reais e decide status
    const { count: pendingCount } = await supabase
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", data.id)
      .eq("status", "pending");

    let newStatus: string | null = null;
    if ((pendingCount ?? 0) > 0 && ["paused", "error", "completed", "partial"].includes(camp.status as string)) {
      newStatus = "running";
      await supabase
        .from("wa_campaigns")
        .update({
          status: "running",
          pause_reason: null,
          paused_at: null,
          finished_at: null,
          last_error: null,
          resumed_at: new Date().toISOString(),
        })
        .eq("id", data.id);
    }

    // 4) Recalcula progresso a partir dos dados reais
    await supabase.rpc("wa_recalc_campaign_progress" as any, { _campaign_id: data.id });

    await logEvent(
      supabase,
      data.id,
      "unstuck",
      `Campanha destravada (reenfileirados: ${reenqueued}, pendentes: ${pendingCount ?? 0}${newStatus ? `, status → ${newStatus}` : ""})`,
      context.userId,
      { reenqueued, pending: pendingCount ?? 0, new_status: newStatus },
    );

    // 5) Dispara tick imediato (fire and forget)
    try {
      const url = new URL(
        "/api/public/whatsapp/queue-tick",
        process.env.SUPABASE_URL?.replace(".supabase.co", ".lovable.app") ??
          "https://project--9c7682d6-edcd-4388-a36c-36249d4d6ab8.lovable.app",
      );
      fetch(url.toString(), { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => {});
    } catch {}

    return { ok: true, reenqueued, pending: pendingCount ?? 0, status: newStatus ?? camp.status };
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

    const stored = ((camp.progress as any) ?? {}) as Record<string, unknown>;
    const num = (key: string) => Number(stored[key] ?? 0) || 0;
    const total = Number(stored.total ?? camp.total_recipients ?? 0) || 0;
    const pending = num("pending");
    const processing = num("processing");
    const accepted = num("accepted");
    const deliveredBase = num("delivered");
    const readBase = num("read");
    const replied = num("replied");
    const delivered = deliveredBase + readBase + replied;
    const read = readBase + replied;
    const sent = num("sent");
    const processed = Number(stored.processed ?? (total - pending - processing)) || 0;
    const liveProgress = {
      total,
      pending,
      processing,
      accepted,
      sent,
      delivered,
      read,
      replied,
      failed: num("failed"),
      opt_out: num("opt_out"),
      cancelled: num("cancelled"),
      skipped: num("skipped"),
      processed,
      percent: total > 0 ? Number(((processed / total) * 100).toFixed(2)) : 0,
    };
    const p = liveProgress;
    const remaining = (p.pending ?? 0) + (p.processing ?? 0);
    const speed = Number(camp.avg_speed_per_min ?? 0);
    const etaMinutes = speed > 0 ? Math.ceil(remaining / speed) : null;

    return { ...camp, total_recipients: total || camp.total_recipients, progress: liveProgress, eta_minutes: etaMinutes };
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
    const PAGE = 1000;
    const requestedLimit = data.limit && data.limit > 0 ? Math.floor(data.limit) : null;
    const rows: any[] = [];

    for (let from = 0; ; from += PAGE) {
      const to = requestedLimit ? Math.min(from + PAGE - 1, requestedLimit - 1) : from + PAGE - 1;
      let q = context.supabase
        .from("campaign_recipients")
        .select("id,phone,status,attempt,sent_at,delivered_at,read_at,replied_at,failed_at,failed_reason,error_code,meta_message_id,contact:contacts(name)")
        .eq("campaign_id", data.id)
        .order("created_at", { ascending: true })
        .range(from, to);
      if (data.status) q = q.eq("status", data.status as any);
      const { data: page, error } = await q;
      if (error) throw error;
      rows.push(...(page ?? []));
      if (!page || page.length < PAGE || (requestedLimit && rows.length >= requestedLimit)) break;
    }

    return requestedLimit ? rows.slice(0, requestedLimit) : rows;
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

/**
 * Render the message body/header/buttons per recipient using the campaign's variable mappings.
 * Used by the campaign detail screen to preview the exact text each contact will receive before sending.
 */
export const getRecipientPreviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    limit: z.number().int().min(1).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabase = context.supabase;

    const { data: camp } = await supabase.from("wa_campaigns").select("*").eq("id", data.id).single();
    if (!camp) throw new Error("Campanha não encontrada");

    const [tplRes, clientRes, projectRes, respRes] = await Promise.all([
      camp.template_id ? supabase.from("whatsapp_templates").select("*").eq("id", camp.template_id).single() : Promise.resolve({ data: null }),
      camp.client_id ? supabase.from("clients").select("*").eq("id", camp.client_id).single() : Promise.resolve({ data: null }),
      camp.project_id ? supabase.from("projects").select("*").eq("id", camp.project_id).single() : Promise.resolve({ data: null }),
      camp.responsavel_id ? supabase.from("profiles").select("*").eq("id", camp.responsavel_id).single() : Promise.resolve({ data: null }),
    ]);
    const tpl = (tplRes as any).data;
    if (!tpl) throw new Error("Template não encontrado");

    const PAGE = 1000;
    const requestedLimit = data.limit && data.limit > 0 ? Math.floor(data.limit) : null;
    const recs: any[] = [];
    for (let from = 0; ; from += PAGE) {
      const to = requestedLimit ? Math.min(from + PAGE - 1, requestedLimit - 1) : from + PAGE - 1;
      const { data: page, error } = await supabase
        .from("campaign_recipients")
        .select("id,phone,status,contact:contacts(id,name,email,phone,metadata)")
        .eq("campaign_id", data.id)
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw error;
      recs.push(...(page ?? []));
      if (!page || page.length < PAGE || (requestedLimit && recs.length >= requestedLimit)) break;
    }

    const varsMap = ((camp.variables_mapping ?? camp.template_variables) as any) ?? {};
    const btnMap = (camp.button_url_mapping as any) ?? {};
    const bodyVars = metaVarsIn(tpl.body ?? "");
    const btns = (Array.isArray(tpl.buttons) ? tpl.buttons : []) as any[];

    const result = recs.map((r: any) => {
      const ctx = buildContext({
        contact: r.contact ?? { phone: r.phone },
        client: (clientRes as any).data,
        project: (projectRes as any).data,
        responsavel: (respRes as any).data,
        campaign: camp,
      });
      const resolved: Record<number, string> = {};
      const warnings: string[] = [];
      for (const n of bodyVars) {
        const mapping = varsMap[String(n)] ?? "";
        const v = renderMapping(mapping, ctx);
        resolved[n] = v;
        if (!v || !v.trim()) warnings.push(`{{${n}}} vazio`);
      }
      const buttons: { text: string; url: string }[] = [];
      for (const raw of btns) {
        const b: any = raw ?? {};
        if ((b.type || "").toString().toLowerCase() === "url" && b.url) {
          const urlVars = metaVarsIn(String(b.url));
          const urlResolved: Record<number, string> = {};
          for (const n of urlVars) {
            urlResolved[n] = renderMapping(btnMap[String(n)] ?? "", ctx);
          }
          buttons.push({ text: String(b.text ?? ""), url: fillMetaTemplate(String(b.url), urlResolved) });
        } else if (b.text) {
          buttons.push({ text: String(b.text), url: "" });
        }
      }
      return {
        recipient_id: r.id,
        phone: r.phone,
        name: r.contact?.name ?? null,
        status: r.status,
        body: fillMetaTemplate(tpl.body ?? "", resolved),
        header: tpl.header_text ?? null,
        footer: tpl.footer ?? null,
        buttons,
        warnings,
      };
    });

    return {
      template: { name: tpl.name, language: tpl.language, status: tpl.status },
      previews: result,
    };
  });
