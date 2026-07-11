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
