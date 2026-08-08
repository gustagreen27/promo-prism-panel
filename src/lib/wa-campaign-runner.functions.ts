// Server functions for the async campaign runner (preflight, start/pause/resume/cancel/retry, progress, timeline, report, CSV export)
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { renderMapping, fillMetaTemplate, metaVarsIn, buildContext } from "@/lib/wa-variables";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

/**
 * Impede retomar/reprocessar enquanto a campanha estiver travada por erro
 * crítico OU enquanto o número usado continuar bloqueado pela Meta.
 */
async function assertCampaignUnlocked(supabase: any, campaignId: string) {
  const { data: camp } = await supabase
    .from("wa_campaigns")
    .select("fatal_locked, fatal_error_code, fatal_error_message, connection_id")
    .eq("id", campaignId)
    .maybeSingle();
  if (camp?.fatal_locked) {
    throw new Error(
      `Bloqueada por erro crítico ${camp.fatal_error_code ?? ""}: ${camp.fatal_error_message ?? "conta bloqueada pela Meta"}. Troque de WABA/número ou libere manualmente antes de reprocessar.`,
    );
  }
  if (camp?.connection_id) {
    const { data: conn } = await supabase
      .from("whatsapp_connections")
      .select("blocked_at, blocked_reason")
      .eq("id", camp.connection_id)
      .maybeSingle();
    if (conn?.blocked_at) {
      throw new Error(
        `Número bloqueado pela Meta: ${conn.blocked_reason ?? "restrição ativa"}. Troque o número/WABA ou desbloqueie antes de reprocessar.`,
      );
    }
  }
}

/**
 * REGRA ABSOLUTA: um disparo com cabeçalho de mídia só pode usar a mídia
 * enviada no upload da campanha. Se não houver upload persistido
 * (`_header_image_url`), o disparo é bloqueado — nunca cai para a mídia
 * aprovada do template.
 */
async function assertCampaignUploadMedia(supabase: any, campaignId: string) {
  const { data: camp } = await supabase
    .from("wa_campaigns")
    .select("template_id, template_variables, variables_mapping")
    .eq("id", campaignId)
    .maybeSingle();
  if (!camp?.template_id) return;

  const { data: tpl } = await supabase
    .from("whatsapp_templates")
    .select("header_type")
    .eq("id", camp.template_id)
    .maybeSingle();
  const headerType = String(tpl?.header_type ?? "").toLowerCase();
  if (!["image", "video", "document"].includes(headerType)) return;

  const vars = {
    ...((camp.variables_mapping as Record<string, any>) ?? {}),
    ...((camp.template_variables as Record<string, any>) ?? {}),
  };
  const media = String(vars._header_image_url ?? "").trim();
  if (!media) {
    const msg =
      "Disparo bloqueado: o template tem cabeçalho de mídia e não há upload persistido na campanha. Envie o arquivo no assistente — a mídia do template nunca é usada.";
    await supabase.from("wa_campaigns").update({ last_error: msg }).eq("id", campaignId);
    await logEvent(supabase, campaignId, "preflight_failed", msg, null, {
      reason: "missing_campaign_upload_media",
      header_type: headerType,
    });
    throw new Error(msg);
  }
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

const PROJECT_ID = "9c7682d6-edcd-4388-a36c-36249d4d6ab8";

function getRequestBaseUrl() {
  const host = getRequestHeader("host");
  if (!host) return null;
  const proto = getRequestHeader("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function triggerQueueTick(source = "manual", baseUrl?: string | null) {
  try {
    const url = new URL(
      "/api/public/whatsapp/queue-tick",
      baseUrl ?? `https://project--${PROJECT_ID}.lovable.app`,
    );
    fetch(url.toString(), {
      method: "POST",
      headers: { "content-type": "application/json", "x-tick-source": source },
      body: "{}",
    }).catch(() => {});
  } catch {}
}

/**
 * Check if a phone_number_id is registered on WhatsApp Cloud API by calling Meta Graph.
 * Returns { ok, status?, display_phone_number?, reason? } — reason is user-facing (pt-BR).
 */
async function checkPhoneNumberRegistration(phone_number_id: string, access_token: string): Promise<{
  ok: boolean;
  status?: string;
  display_phone_number?: string;
  code?: number | string;
  reason?: string;
}> {
  try {
    const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(phone_number_id)}?fields=id,display_phone_number,verified_name,code_verification_status,name_status,status,platform_type,quality_rating`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) {
      const err = j?.error ?? {};
      const code = err.code ?? r.status;
      const sub = err.error_subcode;
      const msg = err.message ?? `HTTP ${r.status}`;
      // 133010 = Account not registered
      if (code === 133010 || sub === 133010 || /not\s+registered/i.test(msg)) {
        return { ok: false, code: 133010, reason: `(#133010) Account not registered — registre o número (POST /register) no gerenciador Meta antes de disparar.` };
      }
      if (code === 190 || /access token/i.test(msg)) {
        return { ok: false, code, reason: `Token de acesso inválido/expirado (${msg})` };
      }
      if (code === 100 || r.status === 404) {
        return { ok: false, code, reason: `Phone Number ID inexistente ou sem permissão (${msg})` };
      }
      return { ok: false, code, reason: `Meta: (#${code}) ${msg}` };
    }
    const status = String(j?.status ?? "").toUpperCase();
    // Meta returns status like "CONNECTED"; some numbers omit it but are still usable.
    if (status && status !== "CONNECTED" && status !== "REGISTERED" && status !== "ACTIVE") {
      return { ok: false, status, display_phone_number: j?.display_phone_number, reason: `Status Meta: ${status} (número não pronto para disparo)` };
    }
    return { ok: true, status: status || "CONNECTED", display_phone_number: j?.display_phone_number };
  } catch (e: any) {
    return { ok: false, reason: `Falha ao consultar Meta: ${e?.message ?? String(e)}` };
  }
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

    // Meta API: verify phone number is registered on WhatsApp Cloud API
    if (conn?.phone_number_id) {
      const effToken = conn.use_global_token ? process.env.WHATSAPP_ACCESS_TOKEN : conn.access_token;
      if (!effToken) {
        checks.push({ key: "phone_registered", label: "Número registrado na WhatsApp Cloud API", ok: false, message: "Sem token de acesso disponível para validar" });
      } else {
        const reg = await checkPhoneNumberRegistration(conn.phone_number_id, effToken);
        checks.push({
          key: "phone_registered",
          label: "Número registrado na WhatsApp Cloud API",
          ok: reg.ok,
          message: reg.ok
            ? `Status: ${reg.status ?? "REGISTERED"}${reg.display_phone_number ? ` · ${reg.display_phone_number}` : ""}`
            : reg.reason,
        });
      }
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

    await assertCampaignUploadMedia(supabase, data.id);

    // Verify phone number is registered on Meta before dispatching (avoids #133010 mid-run).
    const { data: connRow } = await supabase
      .from("whatsapp_connections")
      .select("access_token,phone_number_id,use_global_token")
      .eq("id", camp.connection_id)
      .single();
    if (!connRow?.phone_number_id) {
      throw new Error("Conexão sem Phone Number ID.");
    }
    const effToken = connRow.use_global_token ? process.env.WHATSAPP_ACCESS_TOKEN : connRow.access_token;
    if (!effToken) {
      throw new Error("Conexão sem token de acesso (nem global nem por conexão).");
    }
    const reg = await checkPhoneNumberRegistration(connRow.phone_number_id, effToken);
    if (!reg.ok) {
      // If token is invalid, flag connection for reconnection.
      if (reg.code === 190 || /token/i.test(reg.reason ?? "")) {
        await supabase.from("whatsapp_connections").update({ meta_sync_status: "invalid_token", status: "inativa" }).eq("id", camp.connection_id);
      }
      await supabase.from("wa_campaigns").update({ last_error: reg.reason ?? "Número não registrado" }).eq("id", data.id);
      await logEvent(supabase, data.id, "preflight_failed", `Validação Meta falhou: ${reg.reason}`, context.userId, { phone_number_id: connRow.phone_number_id, reason: reg.reason, code: reg.code });
      throw new Error(reg.reason ?? "Número não registrado na WhatsApp Cloud API");
    }

    // Admin async dispatch bypasses stock check.



    // Submissão imediata (modelo Infobip): a campanha inteira é aceita agora,
    // marcada com um bulk_id, e os workers paralelos consomem a fila em
    // background. O painel não espera o processamento.
    const bulkId = (camp as any).bulk_id ?? crypto.randomUUID();
    const rps = Math.max(1, Number((camp as any).rate_per_second ?? 80));
    const lanes = Math.max(1, Math.min(12, Math.ceil(rps / 20)));

    await supabase
      .from("wa_campaigns")
      .update({
        status: "running",
        started_at: camp.started_at ?? new Date().toISOString(),
        started_by: context.userId,
        total_recipients: recCount,
        last_error: null,
        bulk_id: bulkId,
        submitted_at: new Date().toISOString(),
        worker_lanes: lanes,
      } as any)
      .eq("id", data.id);

    await logEvent(
      supabase,
      data.id,
      "submitted",
      `Campanha submetida com sucesso — ${recCount} destinatários enfileirados (${lanes} workers paralelos)`,
      context.userId,
      { total: recCount, bulk_id: bulkId, worker_lanes: lanes },
    );

    // Dispara os workers imediatamente (fire and forget)
    triggerQueueTick("manual-start", getRequestBaseUrl());

    return { ok: true, bulkId, queued: recCount, workerLanes: lanes };

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
    await assertCampaignUnlocked(context.supabase, data.id);

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
    await assertCampaignUnlocked(context.supabase, data.id);

    const { data: updated, error } = await context.supabase
      .from("campaign_recipients")
      .update({
        status: "pending",
        failed_at: null,
        failed_reason: null,
        error_code: null,
        attempt: 0,
        next_attempt_at: null,
        last_attempt_at: null,
      })
      .eq("campaign_id", data.id)
      .eq("status", "failed")
      .select("id");
    if (error) throw error;
    const count = updated?.length ?? 0;
    await logEvent(context.supabase, data.id, "retry", `${count} falhas reenfileiradas`, context.userId);
    // Retoma a campanha em qualquer estado terminal/pausado — o usuário
    // pediu explicitamente para reprocessar, então limpamos lease/pausa
    // e devolvemos para "running" para o tick pegar imediatamente.
    const { error: campErr } = await context.supabase
      .from("wa_campaigns")
      .update({
        status: "running",
        finished_at: null,
        paused_at: null,
        pause_reason: null,
        last_error: null,
        worker_lease_id: null,
        worker_lease_until: null,
        resumed_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .in("status", ["completed", "partial", "error", "paused"]);
    if (campErr) throw campErr;
    await context.supabase.rpc("wa_recalc_campaign_progress" as any, { _campaign_id: data.id });

    triggerQueueTick("manual-retry", getRequestBaseUrl());

    return { ok: true, count };
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
    triggerQueueTick("manual-unstick", getRequestBaseUrl());

    return { ok: true, reenqueued, pending: pendingCount ?? 0, status: newStatus ?? camp.status };
  });



export const getCampaignProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: camp, error } = await context.supabase
      .from("wa_campaigns")
      .select("id,status,progress,last_error,last_sent_at,avg_speed_per_min,started_at,finished_at,total_recipients,scheduled_at,linked_campaign_id")
      .eq("id", data.id)
      .single();
    if (error) throw error;

    let clicks = 0;
    const { data: clickRows } = await context.supabase.rpc("wa_count_dispatch_clicks" as any, {
      _campaign_ids: [data.id],
      _from: null,
      _to: null,
    });
    clicks = Number(((clickRows ?? []) as any[])[0]?.clicks ?? 0) || 0;



    const stored = ((camp.progress as any) ?? {}) as Record<string, unknown>;
    const num = (key: string) => Number(stored[key] ?? 0) || 0;
    const total = Number(stored.total ?? camp.total_recipients ?? 0) || 0;
    const pending = num("pending");
    const processing = num("processing");
    const accepted = num("accepted");
    // progress json (wa_recalc_campaign_progress) já entrega os totais acumulados:
    //   sent = accepted+sent+delivered+read+replied
    //   delivered = delivered+read+replied
    //   read = read+replied
    // Não re-somar aqui, senão delivered fica maior que sent.
    const replied = num("replied");
    const delivered = num("delivered");
    const read = num("read");
    const sentRaw = num("sent");
    // Sanidade: entregues nunca pode passar de enviadas.
    const sent = Math.max(sentRaw, delivered);
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

    return { ...camp, total_recipients: total || camp.total_recipients, progress: liveProgress, eta_minutes: etaMinutes, clicks };
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
    // Cap defensivo: sem limite explícito, no máximo 2000 (evita varrer 1M em campanhas grandes).
    const HARD_CAP = 2000;
    const requestedLimit = data.limit && data.limit > 0
      ? Math.min(Math.floor(data.limit), 200000)
      : HARD_CAP;
    const PAGE = 1000;
    const rows: any[] = [];

    for (let from = 0; from < requestedLimit; from += PAGE) {
      const to = Math.min(from + PAGE - 1, requestedLimit - 1);
      let q = context.supabase
        .from("campaign_recipients")
        // Usa coluna denormalizada contact_name — evita LEFT JOIN LATERAL contacts (Frente 1).
        .select("id,phone,status,attempt,sent_at,delivered_at,read_at,replied_at,failed_at,failed_reason,error_code,meta_message_id,contact_name")
        .eq("campaign_id", data.id)
        .order("created_at", { ascending: true })
        .range(from, to);
      if (data.status) q = q.eq("status", data.status as any);
      const { data: page, error } = await q;
      if (error) throw error;
      // Compat: telas ainda leem r.contact?.name.
      for (const r of page ?? []) rows.push({ ...r, contact: { name: (r as any).contact_name ?? null } });
      if (!page || page.length < PAGE) break;
    }

    return rows;
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
