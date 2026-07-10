// Server-only queue processor for WhatsApp campaigns (async worker with lease + timeline + final report).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendTemplateMessage } from "@/lib/wa-send.server";
import { renderMapping, buildContext } from "@/lib/wa-variables";


const OPT_OUT_REGEX = /\b(parar|sair|cancelar|cancela|remover|descadastrar|n[ãa]o quero|stop|unsubscribe)\b/i;

// Temporary/transient Meta error codes eligible for retry
const RETRYABLE_CODES = new Set(["130429", "131056", "131048", "131047", "500", "502", "503", "504"]);
const MAX_ATTEMPTS = 3;
const LEASE_MS = 3 * 60 * 1000;

async function logEvent(campaignId: string, event_type: string, message: string, payload: any = {}) {
  try {
    await supabaseAdmin.from("campaign_timeline").insert({
      campaign_id: campaignId,
      event_type,
      message,
      payload,
    });
  } catch {}
}

async function acquireLease(campaignId: string): Promise<string | null> {
  const leaseId = crypto.randomUUID();
  const until = new Date(Date.now() + LEASE_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from("wa_campaigns")
    .update({ worker_lease_id: leaseId, worker_lease_until: until })
    .eq("id", campaignId)
    .or(`worker_lease_until.is.null,worker_lease_until.lt.${new Date().toISOString()}`)
    .select("id")
    .maybeSingle();
  if (error || !data) return null;
  return leaseId;
}

async function releaseLease(campaignId: string) {
  await supabaseAdmin
    .from("wa_campaigns")
    .update({ worker_lease_id: null, worker_lease_until: null })
    .eq("id", campaignId);
}

export async function finalizeCampaign(campaignId: string) {
  const { data: camp } = await supabaseAdmin
    .from("wa_campaigns")
    .select("*, client:clients(name), project:projects(name), template:whatsapp_templates(name,language), connection:whatsapp_connections(display_phone,nome_interno), waba:whatsapp_wabas(nome_interno,waba_id)")
    .eq("id", campaignId)
    .single();
  if (!camp) return;

  const { data: recs } = await supabaseAdmin
    .from("campaign_recipients")
    .select("status,error_code,failed_reason,phone,sent_at,delivered_at,read_at")
    .eq("campaign_id", campaignId);

  const rows = recs ?? [];
  const total = rows.length;
  const byStatus: Record<string, number> = {};
  const byError: Record<string, number> = {};
  for (const r of rows) {
    byStatus[r.status as string] = (byStatus[r.status as string] ?? 0) + 1;
    if (r.status === "failed") {
      const k = r.error_code || r.failed_reason || "unknown";
      byError[k] = (byError[k] ?? 0) + 1;
    }
  }
  const delivered = (byStatus.delivered || 0) + (byStatus.read || 0) + (byStatus.replied || 0);
  const read = (byStatus.read || 0) + (byStatus.replied || 0);
  const replied = byStatus.replied || 0;
  const failed = byStatus.failed || 0;
  const optout = byStatus.opt_out || 0;
  const sent = (byStatus.sent || 0) + delivered;

  const durMs = camp.started_at
    ? new Date().getTime() - new Date(camp.started_at as string).getTime()
    : 0;

  const finalStatus: "completed" | "partial" | "cancelled" =
    (byStatus.pending || 0) + (byStatus.processing || 0) > 0
      ? "cancelled"
      : failed > 0
      ? "partial"
      : "completed";

  // Libera qualquer saldo ainda reservado para esta campanha
  if ((camp as any).reservation_id) {
    await supabaseAdmin.rpc("wallet_release_reservation" as any, {
      _reservation_id: (camp as any).reservation_id,
      _qty: null,
    });
  }

  const report = {
    summary: {
      name: camp.name,
      client: (camp as any).client?.name ?? null,
      project: (camp as any).project?.name ?? null,
      template: (camp as any).template?.name ?? null,
      language: (camp as any).template?.language ?? null,
      connection: (camp as any).connection?.nome_interno ?? (camp as any).connection?.display_phone ?? null,
      waba: (camp as any).waba?.nome_interno ?? null,
      started_at: camp.started_at,
      finished_at: new Date().toISOString(),
      duration_ms: durMs,
    },
    metrics: {
      total,
      sent,
      delivered,
      read,
      replied,
      failed,
      optout,
      skipped: byStatus.skipped || 0,
      cancelled: byStatus.cancelled || 0,
      delivery_rate: total ? +((delivered / total) * 100).toFixed(2) : 0,
      read_rate: delivered ? +((read / delivered) * 100).toFixed(2) : 0,
      failure_rate: total ? +((failed / total) * 100).toFixed(2) : 0,
      response_rate: delivered ? +((replied / delivered) * 100).toFixed(2) : 0,
      optout_rate: total ? +((optout / total) * 100).toFixed(2) : 0,
    },
    financials: {
      estimated_cost: Number(camp.estimated_cost || 0),
      cost_per_delivered: delivered ? +(Number(camp.estimated_cost || 0) / delivered).toFixed(4) : 0,
      cost_per_reply: replied ? +(Number(camp.estimated_cost || 0) / replied).toFixed(4) : 0,
    },
    errors: Object.entries(byError)
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count),
  };

  await supabaseAdmin
    .from("wa_campaigns")
    .update({
      status: finalStatus,
      finished_at: new Date().toISOString(),
      final_report: report as any,
    })
    .eq("id", campaignId);

  await logEvent(campaignId, "completed", `Campanha finalizada (${finalStatus})`, { finalStatus });
  await logEvent(campaignId, "report_generated", "Relatório final gerado", { metrics: report.metrics });
}

function isInQuietHours(nowISO: string, startHM: string | null, endHM: string | null, tz: string): boolean {
  if (!startHM || !endHM) return false;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(nowISO));
    const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    const cur = hh * 60 + mm;
    const [sh, sm] = startHM.split(":").map(Number);
    const [eh, em] = endHM.split(":").map(Number);
    const s = sh * 60 + sm;
    const e = eh * 60 + em;
    if (s === e) return false;
    if (s < e) return cur >= s && cur < e;
    // overnight window (e.g. 22:00 -> 08:00)
    return cur >= s || cur < e;
  } catch {
    return false;
  }
}

async function countSentSince(campaignId: string, sinceISO: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .gte("sent_at", sinceISO);
  return count ?? 0;
}

async function markPaused(campaignId: string, reason: string, message: string) {
  await supabaseAdmin
    .from("wa_campaigns")
    .update({ status: "paused", paused_at: new Date().toISOString(), pause_reason: reason })
    .eq("id", campaignId);
  await logEvent(campaignId, "auto_paused", message, { reason });
}

export async function processCampaignTick(
  campaignId: string,
  batchSize?: number,
): Promise<{ processed: number; done: boolean; skipped?: boolean; reason?: string }> {
  const lease = await acquireLease(campaignId);
  if (!lease) return { processed: 0, done: false, skipped: true };

  try {
    const { data: camp } = await supabaseAdmin
      .from("wa_campaigns")
      .select("*")
      .eq("id", campaignId)
      .single();
    if (!camp) return { processed: 0, done: true };

    // pause/cancel guard
    if (camp.status === "paused") return { processed: 0, done: false };
    if (camp.status === "cancelled") {
      await supabaseAdmin
        .from("campaign_recipients")
        .update({ status: "cancelled" })
        .eq("campaign_id", campaignId)
        .eq("status", "pending");
      return { processed: 0, done: true };
    }
    if (camp.status !== "running") return { processed: 0, done: true };

    if (!camp.connection_id || !camp.template_id) {
      await supabaseAdmin
        .from("wa_campaigns")
        .update({ status: "error", last_error: "Conexão ou template ausente" })
        .eq("id", campaignId);
      await logEvent(campaignId, "error", "Conexão ou template ausente");
      return { processed: 0, done: true };
    }

    // Load connection + template
    const { data: conn } = await supabaseAdmin
      .from("whatsapp_connections")
      .select("*")
      .eq("id", camp.connection_id)
      .single();
    const { data: tpl } = await supabaseAdmin
      .from("whatsapp_templates")
      .select("*")
      .eq("id", camp.template_id)
      .single();
    if (!conn?.phone_number_id || !conn?.access_token || !tpl) {
      await supabaseAdmin
        .from("wa_campaigns")
        .update({ status: "error", last_error: "Número ou template inválido" })
        .eq("id", campaignId);
      await logEvent(campaignId, "error", "Número ou template inválido");
      return { processed: 0, done: true };
    }
    // Load client / project / responsavel once for token context
    const [clientRes, projectRes, respRes] = await Promise.all([
      camp.client_id ? supabaseAdmin.from("clients").select("*").eq("id", camp.client_id).maybeSingle() : Promise.resolve({ data: null } as any),
      camp.project_id ? supabaseAdmin.from("projects").select("*").eq("id", camp.project_id).maybeSingle() : Promise.resolve({ data: null } as any),
      (camp as any).responsavel_id ? supabaseAdmin.from("profiles").select("*").eq("id", (camp as any).responsavel_id).maybeSingle() : Promise.resolve({ data: null } as any),
    ]);
    const clientRow = (clientRes as any).data ?? null;
    const projectRow = (projectRes as any).data ?? null;
    const responsavelRow = (respRes as any).data ?? null;


    // Quiet hours: skip tick, keep status=running (will retry next tick)
    if (isInQuietHours(new Date().toISOString(), camp.quiet_hours_start as any, camp.quiet_hours_end as any, (camp as any).timezone || "America/Sao_Paulo")) {
      await supabaseAdmin
        .from("wa_campaigns")
        .update({ pause_reason: "quiet_hours" })
        .eq("id", campaignId);
      return { processed: 0, done: false, reason: "quiet_hours" };
    }

    // Hourly / daily quota check
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const maxHour = (camp as any).max_per_hour as number | null;
    const maxDay = (camp as any).max_per_day as number | null;
    let cap = Number.POSITIVE_INFINITY;
    if (maxHour && maxHour > 0) {
      const sentHour = await countSentSince(campaignId, hourAgo);
      cap = Math.min(cap, Math.max(maxHour - sentHour, 0));
    }
    if (maxDay && maxDay > 0) {
      const sentDay = await countSentSince(campaignId, dayAgo);
      cap = Math.min(cap, Math.max(maxDay - sentDay, 0));
    }
    if (cap <= 0) {
      await supabaseAdmin
        .from("wa_campaigns")
        .update({ pause_reason: "quota_reached" })
        .eq("id", campaignId);
      return { processed: 0, done: false, reason: "quota_reached" };
    }

    // Effective batch = min(param, campaign.batch_size, rate/min, remaining cap)
    const cfgBatch = Math.max(1, (camp as any).batch_size ?? 25);
    const rateMin = Math.max(1, camp.send_rate_per_min ?? cfgBatch);
    const eff = Math.min(batchSize ?? cfgBatch, cfgBatch, rateMin, cap);

    const { data: recipients } = await supabaseAdmin
      .from("campaign_recipients")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("status", "pending")
      .limit(eff);

    if (!recipients || recipients.length === 0) {
      const { count: processing } = await supabaseAdmin
        .from("campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("status", "processing");
      if (!processing) {
        await finalizeCampaign(campaignId);
        return { processed: 0, done: true };
      }
      return { processed: 0, done: false };
    }

    // Mark processing
    await supabaseAdmin
      .from("campaign_recipients")
      .update({ status: "processing", last_attempt_at: new Date().toISOString() })
      .in("id", recipients.map((r: any) => r.id));

    // Clear any previous pause_reason since we're actively processing
    if ((camp as any).pause_reason) {
      await supabaseAdmin.from("wa_campaigns").update({ pause_reason: null }).eq("id", campaignId);
    }


    let sent = 0;
    let failed = 0;
    let lastError: string | null = null;

    for (const r of recipients) {
      // Opt-out check
      const { data: oo } = await supabaseAdmin
        .from("opt_outs")
        .select("id")
        .eq("phone", r.phone)
        .maybeSingle();
      if (oo) {
        await supabaseAdmin
          .from("campaign_recipients")
          .update({ status: "opt_out", failed_reason: "Contato em opt-out" })
          .eq("id", r.id);
        if ((camp as any).reservation_id) {
          await supabaseAdmin.rpc("wallet_release_reservation" as any, {
            _reservation_id: (camp as any).reservation_id,
            _qty: 1,
          });
        }
        continue;
      }

      const campVars = (camp.template_variables as Record<string, string> | null) || {};
      const recVars = (r.variables as Record<string, string> | null) || {};
      const mergedVars = { ...campVars, ...recVars };

      // Load contact for this recipient to build the token context
      let contactRow: any = null;
      if ((r as any).contact_id) {
        const { data: c } = await supabaseAdmin.from("contacts").select("*").eq("id", (r as any).contact_id).maybeSingle();
        contactRow = c;
      }
      if (!contactRow) {
        const { data: c } = await supabaseAdmin.from("contacts").select("*").eq("phone", r.phone).maybeSingle();
        contactRow = c;
      }
      const ctx = buildContext({
        contact: contactRow ?? { phone: r.phone },
        client: clientRow,
        project: projectRow,
        campaign: camp,
        responsavel: responsavelRow,
      });

      // Render mapping strings (e.g. "{nome} como você está?") into final text per recipient.
      const renderedVars: Record<string, string> = {};
      for (const [k, v] of Object.entries(mergedVars)) {
        if (k.startsWith("_")) { renderedVars[k] = String(v ?? ""); continue; }
        renderedVars[k] = renderMapping(String(v ?? ""), ctx);
      }

      const headerImageOverride = renderedVars._header_image_url || null;
      const rawButtonUrlParam = renderedVars._button_url_param || null;
      const buttonUrlParam = rawButtonUrlParam ? renderMapping(rawButtonUrlParam, ctx) : null;
      const buttonIndexRaw = renderedVars._button_index;
      const buttonIndex = buttonIndexRaw != null && buttonIndexRaw !== "" ? Number(buttonIndexRaw) : 0;

      const resolvedHeaderType = headerImageOverride ? "image" : tpl.header_type;
      const resolvedHeaderValue = headerImageOverride ?? tpl.header_text;


      const result = await sendTemplateMessage({
        phoneNumberId: conn.phone_number_id!,
        accessToken: conn.access_token!,
        graphVersion: conn.graph_api_version || "v21.0",
        to: r.phone.replace(/\D/g, ""),
        templateName: tpl.name,
        languageCode: tpl.language || "pt_BR",
        variables: renderedVars,
        headerType: resolvedHeaderType,
        headerValue: resolvedHeaderValue,
        buttonUrlParam,
        buttonIndex,
      });

      const attempts = (r.attempt ?? 0) + 1;
      if (result.ok) {
        // Só considera "accepted" quando a Meta retornou wamid + message_status="accepted".
        // Se vier wamid mas sem message_status, marcamos "sent" (id existe, status desconhecido).
        // Sem wamid nunca chega aqui (result.ok=false).
        const metaStatus = (result.messageStatus || "").toLowerCase();
        const wamid = result.wamid;
        if (!wamid) {
          // Blindagem extra: sem wamid não é envio confirmado.
          failed++;
          lastError = "Meta não retornou wamid";
          await supabaseAdmin
            .from("campaign_recipients")
            .update({
              status: "failed",
              failed_at: new Date().toISOString(),
              failed_reason: "Meta não retornou wamid",
              error_code: "no_wamid",
              attempt: attempts,
            })
            .eq("id", r.id);
          await logEvent(campaignId, "send_no_wamid", `Sem wamid para ${r.phone}`, {
            recipient_id: r.id,
            http_status: (result as any).httpStatus,
            raw: result.raw,
          });
          continue;
        }

        const finalRecipientStatus: "accepted" | "sent" =
          metaStatus === "accepted" ? "accepted" : "sent";

        sent++;
        await supabaseAdmin
          .from("campaign_recipients")
          .update({
            status: finalRecipientStatus,
            meta_message_id: wamid,
            sent_at: new Date().toISOString(),
            attempt: attempts,
          })
          .eq("id", r.id);
        await logEvent(
          campaignId,
          "send_accepted",
          `Meta aceitou envio para ${r.phone} (wamid=${wamid}, message_status=${metaStatus || "n/d"})`,
          {
            recipient_id: r.id,
            wamid,
            message_status: metaStatus || null,
            http_status: (result as any).httpStatus,
          },
        );
        // Cobrança: consome 1 unidade da reserva de saldo em R$ (novo modelo).
        // Fallback: se a campanha ainda usa estoque legado, desconta do estoque.
        if ((camp as any).reservation_id) {
          await supabaseAdmin.rpc("wallet_consume_reservation" as any, {
            _reservation_id: (camp as any).reservation_id,
            _recipient_id: r.id,
          });
        } else {
          await supabaseAdmin.rpc("wa_consume_stock" as any, {
            _client_id: camp.client_id,
            _project_id: camp.project_id,
            _qty: 1,
          });
        }
      } else {
        const isNetworkError =
          result.code === "network_error" ||
          /failed to fetch|fetch failed|network|econnreset|etimedout|enetunreach|socket hang up/i.test(
            result.error || "",
          );

        if (isNetworkError) {
          // Não conta como falha do destinatário: volta para pending e pausa a campanha por 1 minuto.
          await supabaseAdmin
            .from("campaign_recipients")
            .update({
              status: "pending",
              failed_reason: null,
              error_code: null,
              last_attempt_at: new Date().toISOString(),
            })
            .eq("id", r.id);

          // Reverte os demais recipients ainda em "processing" para pending
          const remainingIds = recipients
            .slice(recipients.indexOf(r) + 1)
            .map((x: any) => x.id);
          if (remainingIds.length) {
            await supabaseAdmin
              .from("campaign_recipients")
              .update({ status: "pending" })
              .in("id", remainingIds);
          }

          const resumeAt = new Date(Date.now() + 60_000).toISOString();
          await supabaseAdmin
            .from("wa_campaigns")
            .update({
              status: "paused",
              paused_at: new Date().toISOString(),
              pause_reason: "network_error",
              scheduled_at: resumeAt,
              last_error: result.error,
            })
            .eq("id", campaignId);
          await logEvent(
            campaignId,
            "auto_paused",
            `Pausada por 1 min após erro de rede: ${result.error}`,
            { reason: "network_error", resume_at: resumeAt },
          );
          lastError = result.error;
          break;
        }

        failed++;
        lastError = result.error;
        const isRetryable = result.code ? RETRYABLE_CODES.has(String(result.code)) : false;
        const shouldRetry = isRetryable && attempts < MAX_ATTEMPTS;
        await supabaseAdmin
          .from("campaign_recipients")
          .update({
            status: shouldRetry ? "pending" : "failed",
            failed_at: shouldRetry ? null : new Date().toISOString(),
            failed_reason: result.error,
            error_code: result.code,
            attempt: attempts,
          })
          .eq("id", r.id);
        // Falha permanente: libera 1 unidade da reserva
        if (!shouldRetry && (camp as any).reservation_id) {
          await supabaseAdmin.rpc("wallet_release_reservation" as any, {
            _reservation_id: (camp as any).reservation_id,
            _qty: 1,
          });
        }
      }

      // Jitter delay between sends (in-lote)
      const jitter = Math.max(0, (camp as any).jitter_ms ?? 0);
      if (jitter > 0) {
        const wait = Math.floor(Math.random() * jitter);
        if (wait > 0) await new Promise((res) => setTimeout(res, wait));
      }
    }

    // Auto-pause on failure-rate threshold
    const threshold = (camp as any).abort_on_failure_rate as number | null;
    const minProc = (camp as any).min_processed_for_abort ?? 50;
    if (threshold && threshold > 0) {
      const { data: agg } = await supabaseAdmin
        .from("campaign_recipients")
        .select("status")
        .eq("campaign_id", campaignId);
      const rows = agg ?? [];
      const processedTotal = rows.filter((r: any) => !["pending", "processing"].includes(r.status)).length;
      const failedTotal = rows.filter((r: any) => r.status === "failed").length;
      if (processedTotal >= minProc && failedTotal / processedTotal >= threshold) {
        await markPaused(
          campaignId,
          "failure_rate",
          `Auto-pausada: taxa de falha ${(100 * failedTotal / processedTotal).toFixed(1)}% ≥ ${(100 * threshold).toFixed(0)}%`,
        );
        return { processed: sent + failed, done: false, reason: "failure_rate" };
      }
    }

    // Update speed / last_sent / last_error on campaign
    const startedAt = camp.started_at ? new Date(camp.started_at as string).getTime() : null;
    let speed: number | null = null;
    if (startedAt) {
      const { count: doneCount } = await supabaseAdmin
        .from("campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .not("status", "in", "(pending,processing)");
      const mins = Math.max((Date.now() - startedAt) / 60000, 0.1);
      speed = +(((doneCount ?? 0) / mins).toFixed(2));
    }
    await supabaseAdmin
      .from("wa_campaigns")
      .update({
        last_sent_at: sent > 0 ? new Date().toISOString() : camp.last_sent_at,
        last_error: lastError ?? camp.last_error,
        avg_speed_per_min: speed,
      })
      .eq("id", campaignId);

    // Check if done
    const { count: pending } = await supabaseAdmin
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .in("status", ["pending", "processing"]);
    if (!pending) {
      await finalizeCampaign(campaignId);
      return { processed: sent + failed, done: true };
    }

    return { processed: sent + failed, done: false };
  } finally {
    await releaseLease(campaignId);
  }
}

export { OPT_OUT_REGEX };
