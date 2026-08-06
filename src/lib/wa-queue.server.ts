// Server-only queue processor for WhatsApp campaigns (async worker with lease + timeline + final report).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendTemplateMessage } from "@/lib/wa-send.server";
import { renderMapping, buildContext } from "@/lib/wa-variables";
import { GRAPH_VERSION, resolveGraphVersion } from "@/lib/meta/graph-version";

// ---------------------------------------------------------------------------
// Dependency-injection surface (Fase 2, harness end-to-end)
// - `transport` substitui apenas a chamada HTTP à Meta (sendTemplateMessage).
// - `clock`     substitui now/sleep para futuros testes de tempo virtual.
// - `instrumentation` captura latências e granted dos 3 RPCs quentes do hot loop
//   (wa_try_consume_tokens, wa_acquire_slots, wa_release_slots) para o harness.
// Defaults preservam 100% do comportamento de produção; nenhum call-site atual
// precisa ser alterado.
// ---------------------------------------------------------------------------
export type WaTransport = {
  sendTemplateMessage: typeof sendTemplateMessage;
};
export type WaClock = {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
};
export type WaRpcSample = {
  rpc: "wa_try_consume_tokens" | "wa_acquire_slots" | "wa_release_slots";
  ms: number;
  requested?: number;
  granted?: number;
};
export type WaInstrumentation = {
  onRpc?: (sample: WaRpcSample) => void;
};
export type WaTickOptions = {
  transport?: WaTransport;
  clock?: WaClock;
  instrumentation?: WaInstrumentation;
  /** Índice da trilha paralela (lane) deste worker. */
  lane?: number;
  /** Tempo máximo de execução desta lane (ms). */
  maxRuntimeMs?: number;
};


const REAL_CLOCK: WaClock = {
  now: () => Date.now(),
  sleep: (ms: number) => new Promise((res) => setTimeout(res, ms)),
};
const REAL_TRANSPORT: WaTransport = { sendTemplateMessage };



const OPT_OUT_REGEX = /\b(parar|sair|cancelar|cancela|remover|descadastrar|n[ãa]o quero|stop|unsubscribe)\b/i;

// Temporary/transient Meta error codes eligible for retry
// Temporary/transient Meta error codes eligible for retry
// 131000 = "Something went wrong" (transient generic error, isolado por recipient)
// 131016 = Service overloaded; 131026 = Message undeliverable (retry tenta re-rota); 368 = temporarily blocked
const RETRYABLE_CODES = new Set([
  "130429", "131000", "131016", "131026", "131056", "131048", "131047",
  "368", "500", "502", "503", "504",
]);
const MAX_ATTEMPTS = 5;
// Lease bem curto: o processamento é seguro por reserva atômica com SKIP LOCKED,
// então o próximo tick pode entrar em poucos segundos sem duplicar destinatário.
// Antes 30s fazia o efeito indesejado de "bloco, pausa, bloco" quando o runtime
// encerrava antes do finally liberar o lease.
const LEASE_MS = 5 * 1000;
const PROCESSING_STALE_MS = 20 * 1000;
// Ticks curtos + self-chain contínuo. Evita a arquitetura “um blocão por minuto”
// e limita o blast radius de qualquer request travada.
const MAX_TICK_RUNTIME_MS = 10 * 1000;
// Rate limiter defaults (used to bootstrap wa_rate_limits on first call).
// The real values live in wa_rate_limits per phone_number_id and are shared
// by every campaign using the same número.
// Padrão = RAJADA: quando a campanha não define rate_per_second, usamos o teto
// do próprio número (bucket global) — ou seja, envia tudo o mais rápido possível
// e depois é só coletar os webhooks. Um valor explícito (inclusive baixo) é
// sempre respeitado (usamos ?? e não ||).
const DEFAULT_RATE_PER_SECOND = 80;
const DEFAULT_MAX_CONCURRENCY = 15;
// Systemic-error thresholds — pause the campaign only when the whole path is broken,
// individual errors go through retry-with-backoff instead.
const SYSTEMIC_NETWORK_STREAK = 10;
const SYSTEMIC_RATE_LIMIT_STREAK = 6;

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

// ---------------------------------------------------------------------------
// Lease por LANE (trilha de trabalho), não por campanha.
// Modelo Infobip: N workers paralelos consomem a mesma fila da campanha ao
// mesmo tempo. A exclusão real de duplicidade vem do SKIP LOCKED na reserva
// de destinatários; a lane só evita que a MESMA trilha rode duas vezes.
// ---------------------------------------------------------------------------
const LANE_LEASE_SECONDS = 25;

async function acquireLease(campaignId: string, lane: number): Promise<string | null> {
  const holder = `${lane}-${crypto.randomUUID()}`;
  const { data, error } = await supabaseAdmin.rpc("wa_lane_acquire" as any, {
    _campaign_id: campaignId,
    _lane: lane,
    _holder: holder,
    _seconds: LANE_LEASE_SECONDS,
  });
  if (error || !data) return null;
  return holder;
}

async function releaseLease(campaignId: string, lane: number, holder: string) {
  await supabaseAdmin.rpc("wa_lane_release" as any, {
    _campaign_id: campaignId,
    _lane: lane,
    _holder: holder,
  });
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

async function resetStaleProcessing(campaignId: string) {
  const cutoff = new Date(Date.now() - PROCESSING_STALE_MS).toISOString();
  const { data } = await supabaseAdmin
    .from("campaign_recipients")
    .update({ status: "pending", failed_reason: null, error_code: null })
    .eq("campaign_id", campaignId)
    .eq("status", "processing")
    .is("meta_message_id", null)
    .lt("last_attempt_at", cutoff)
    .select("id");

  const count = data?.length ?? 0;
  if (count > 0) {
    await logEvent(campaignId, "processing_reset", `${count} destinatário(s) destravado(s) para reenfileirar`, { count });
  }
}

function addDispatchTrackingToButtonParam(value: string, templateUrl: string, campaignId: string, recipientId: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  const hashAt = trimmed.indexOf("#");
  const beforeHash = hashAt >= 0 ? trimmed.slice(0, hashAt) : trimmed;
  const hash = hashAt >= 0 ? trimmed.slice(hashAt) : "";
  const templateBeforeHash = templateUrl.split("#")[0] ?? templateUrl;
  const firstPlaceholderAt = templateBeforeHash.search(/\{\{\d+\}\}/);
  const queryAt = templateBeforeHash.indexOf("?");
  const placeholderIsQueryValue = queryAt >= 0 && firstPlaceholderAt > queryAt;
  const sep = placeholderIsQueryValue || beforeHash.includes("?") ? "&" : "?";
  return `${beforeHash}${sep}wac=${encodeURIComponent(campaignId)}&r=${encodeURIComponent(recipientId)}${hash}`;
}

export async function processCampaignTick(
  campaignId: string,
  reservationBudget?: number,
  opts?: WaTickOptions,
): Promise<{ processed: number; done: boolean; skipped?: boolean; reason?: string }> {
  const clock = opts?.clock ?? REAL_CLOCK;
  const transport = opts?.transport ?? REAL_TRANSPORT;
  const onRpc = opts?.instrumentation?.onRpc;
  const lane = Math.max(0, Number(opts?.lane ?? 0));

  const lease = await acquireLease(campaignId, lane);
  if (!lease) return { processed: 0, done: false, skipped: true };
  let campaignLeaseReleased = false;

  const releaseCampaignLeaseOnce = async () => {
    if (campaignLeaseReleased) return;
    campaignLeaseReleased = true;
    await releaseLease(campaignId, lane, lease);
  };


  try {
    const { data: camp } = await supabaseAdmin
      .from("wa_campaigns")
      .select("*")
      .eq("id", campaignId)
      .single();
    if (!camp) return { processed: 0, done: true };
    const { data: adminCreator } = camp.created_by
      ? await supabaseAdmin
          .from("user_roles")
          .select("id")
          .eq("user_id", camp.created_by)
          .eq("role", "admin")
          .maybeSingle()
      : { data: null };
    const isAdminDispatch = !!adminCreator;

    // pause/cancel guard
    if (camp.status === "paused") return { processed: 0, done: false };

    // Scheduled pause (configurada no wizard, Passo 02): aguarda até scheduled_pause_until
    {
      const spUntil = (camp as any).scheduled_pause_until as string | null;
      if ((camp as any).scheduled_pause_enabled && spUntil && new Date(spUntil).getTime() > Date.now()) {
        await supabaseAdmin
          .from("wa_campaigns")
          .update({ pause_reason: "scheduled_pause" })
          .eq("id", campaignId);
        return { processed: 0, done: false, reason: "scheduled_pause" };
      }
    }
    if (camp.status === "cancelled") {
      await supabaseAdmin
        .from("campaign_recipients")
        .update({ status: "cancelled" })
        .eq("campaign_id", campaignId)
        .eq("status", "pending");
      return { processed: 0, done: true };
    }
    if (camp.status !== "running") return { processed: 0, done: true };

    await resetStaleProcessing(campaignId);

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
    // Token: quando a conexão está marcada para usar token global,
    // ignorar qualquer token salvo na conexão (pode estar antigo/expirado).
    if (conn) {
      const globalToken = process.env.WHATSAPP_ACCESS_TOKEN;
      if ((conn as any).use_global_token) {
        (conn as any).access_token = globalToken ?? null;
      } else if (!conn.access_token && globalToken) {
        (conn as any).access_token = globalToken;
      }
    }
    if (!conn?.phone_number_id || !conn?.access_token || !tpl) {
      const missing: string[] = [];
      if (!conn) missing.push("conexão não encontrada");
      else {
        if (!conn.phone_number_id) missing.push("phone_number_id ausente");
        if (!conn.access_token) missing.push("access_token ausente (sem token global)");
      }
      if (!tpl) missing.push("template não encontrado");
      const msg = `Número ou template inválido: ${missing.join(", ")}`;
      await supabaseAdmin
        .from("wa_campaigns")
        .update({ status: "error", last_error: msg })
        .eq("id", campaignId);
      await logEvent(campaignId, "error", msg);
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

    // ------------------------------------------------------------------
    // Progressive reservation + rate-limited dispatch
    // ------------------------------------------------------------------
    // - Reservamos recipients em blocos pequenos (max_concurrency * 2, teto 50)
    //   e só pegamos o próximo quando a fila local cai abaixo de max_concurrency.
    //   Isso evita centenas de rows presas em 'processing' e devolução massiva
    //   ao final do tick.
    // - Rate/concorrência são globais por phone_number_id (wa_rate_limits) —
    //   o token bucket compartilha o teto entre campanhas do mesmo número.
    // - Apenas 1 tick por campanha roda em paralelo (garantido pelo lease
    //   persistente worker_lease_id/until em acquireLease()).
    // - Ignoramos os campos legados batch_size / parallelism / send_rate_per_min /
    //   batch_pause_ms — a velocidade real vem do token bucket + concorrência.
    const phoneNumberId = conn.phone_number_id!;
    // --------------------------------------------------------------------
    // Rate limiter: bucket GLOBAL do número + permit LOCAL da campanha
    // --------------------------------------------------------------------
    // O bucket em wa_rate_limits representa a capacidade do NÚMERO (compartilhada
    // entre todas as campanhas do mesmo phone_number_id). O seu rate NÃO pode ser
    // sobrescrito pelo rate da campanha em curso ("última campanha vence").
    //
    // Regra:
    //   phoneBucketRate = min(global_rate_per_second, maximum_rate_per_second)
    //   campaignPermitRate = campaign.rate_per_second (limite local, por campanha)
    //   effectiveRate = min(campaignPermitRate, phoneBucketRate)
    //
    // Para despachar 1 envio o scheduler precisa:
    //   1 permit do bucket global (compartilhado, atômico no Postgres)
    //   1 permit do bucket local da campanha (in-process token bucket)
    //   1 vaga de concorrência
    const numberMaxRate = Math.max(1, Number((conn as any).maximum_rate_per_second ?? 80));
    const numberGlobalRate = Math.max(1, Number((conn as any).global_rate_per_second ?? numberMaxRate));
    let phoneBucketRate = Math.min(numberGlobalRate, numberMaxRate);
    // Throttle adaptativo POR NÚMERO: se este número levou 130429/timeout há
    // pouco, ele (e só ele) trabalha com rate reduzido até expirar.
    try {
      const { data: rl } = await supabaseAdmin
        .from("wa_rate_limits")
        .select("throttle_rate,throttle_until")
        .eq("phone_number_id", conn.phone_number_id!)
        .maybeSingle();
      const thrUntil = (rl as any)?.throttle_until ? new Date((rl as any).throttle_until).getTime() : 0;
      const thrRate = Number((rl as any)?.throttle_rate ?? 0);
      if (thrRate > 0 && thrUntil > Date.now()) {
        phoneBucketRate = Math.max(1, Math.min(phoneBucketRate, thrRate));
      }
    } catch { /* throttle é best-effort */ }
    const campRateRaw = (camp as any).rate_per_second;
    // Sem taxa definida na campanha => modo rajada no teto do número.
    const rawCampRate =
      campRateRaw == null
        ? Math.max(phoneBucketRate, DEFAULT_RATE_PER_SECOND)
        : Math.max(1, Number(campRateRaw));
    // Rate efetivo desta campanha = min(campanha, bucket global do número).
    const effectiveRate = Math.min(rawCampRate, phoneBucketRate);
    // Número de trilhas paralelas desta campanha (workers simultâneos).
    const laneCount = Math.max(1, Number((camp as any).worker_lanes ?? 4));

    // Para manter N requisições reais por segundo, a concorrência precisa cobrir
    // a latência da Graph API. Ex.: 80/s com timeout de ~8s precisa de ~640+
    // requisições em voo; com só 120/200, o sistema envia um bloco e para até
    // liberar slots. Calcula um piso automático e preserva valores maiores.
    const requiredConcurrencyForRate = Math.ceil(effectiveRate * 10);
    const campConc = Math.max(
      1,
      Number((camp as any).max_concurrency ?? DEFAULT_MAX_CONCURRENCY),
      requiredConcurrencyForRate,
    );
    // Pool REAL de concorrência HTTP por lane. Este é o número de chamadas à
    // Graph API que ficam simultaneamente aguardando resposta dentro de UMA
    // lane. 4 lanes × 10 = 40 requisições realmente em voo.
    const laneHttpConcurrency = Math.max(
      1,
      Math.min(200, Number((camp as any).http_concurrency ?? 10)),
    );
    // Concorrência GLOBAL por número (compartilhada entre campanhas do mesmo phone_number_id).
    // Aquisição atômica no Postgres via wa_acquire_slots; release em lote (1×/s).
    const globalMaxConc = Math.max(campConc, Number((conn as any).global_max_concurrency ?? 200));
    // O lote reservado por lane precisa ser MAIOR que o pool HTTP, para nunca
    // faltar trabalho quando uma requisição termina (reposição imediata).
    const chunkSize = Math.max(laneHttpConcurrency * 5, Math.min(Math.ceil(effectiveRate), 200));
    const queueLowWatermark = Math.max(laneHttpConcurrency * 2, Math.ceil(effectiveRate / 2));

    // budget = teto de reservas neste tick (não é rate!).
    const budget = Math.max(1, Math.min(reservationBudget ?? 1000, cap));

    // Probe: se não há nada pending elegível agora, decidir entre finalizar
    // ou aguardar o próximo tick (pendentes futuros com next_attempt_at).
    {
      const probeIso = new Date().toISOString();
      const { data: probe } = await supabaseAdmin
        .from("campaign_recipients")
        .select("id")
        .eq("campaign_id", campaignId)
        .eq("status", "pending")
        .or(`next_attempt_at.is.null,next_attempt_at.lte.${probeIso}`)
        .limit(1);
      if (!probe || probe.length === 0) {
        const { count: processing } = await supabaseAdmin
          .from("campaign_recipients")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaignId)
          .eq("status", "processing");
        const { count: pendingLater } = await supabaseAdmin
          .from("campaign_recipients")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaignId)
          .eq("status", "pending");
        if (!processing && !pendingLater) {
          await finalizeCampaign(campaignId);
          return { processed: 0, done: true };
        }
        return { processed: 0, done: false };
      }
    }

    if ((camp as any).pause_reason) {
      await supabaseAdmin.from("wa_campaigns").update({ pause_reason: null }).eq("id", campaignId);
    }

    let sent = 0;
    let failed = 0;
    let lastError: string | null = null;
    let consecutiveNetworkErrors = 0;
    let consecutive429 = 0;
    let systemicPause: { reason: string; message: string } | null = null;
    let lastCampaignTouchAt = 0;
    let touchCampaignPromise: Promise<void> | null = null;

    const touchCampaignAfterAccept = (force = false) => {
      const now = Date.now();
      if (!force && now - lastCampaignTouchAt < 2000) return;
      if (!force && touchCampaignPromise) return;
      lastCampaignTouchAt = now;
      const lastSentAt = new Date().toISOString();
      const p: Promise<void> = (async () => {
        await supabaseAdmin
          .from("wa_campaigns")
          .update({ last_sent_at: lastSentAt, last_error: null })
          .eq("id", campaignId);
      })()
        .catch((err: unknown) => {
          console.error("[wa-queue] campaign heartbeat failed", err);
        })
        .finally(() => {
          if (touchCampaignPromise === p) touchCampaignPromise = null;
        });
      touchCampaignPromise = p;
    };

    const applyBackoff = (attempts: number): number => {
      // 1s, 2s, 4s, 8s (cap) + up to 30% jitter.
      const base = Math.min(8000, 1000 * Math.pow(2, Math.max(0, attempts - 1)));
      const jitter = Math.random() * base * 0.3;
      return Math.floor(base + jitter);
    };

    const scheduleRetry = async (
      r: any,
      attempts: number,
      reason: string,
      code: string | null,
    ) => {
      const backoffMs = applyBackoff(attempts);
      const nextAt = new Date(Date.now() + backoffMs).toISOString();
      await supabaseAdmin
        .from("campaign_recipients")
        .update({
          status: "pending",
          failed_reason: reason,
          error_code: code,
          attempt: attempts,
          next_attempt_at: nextAt,
          last_attempt_at: new Date().toISOString(),
        })
        .eq("id", r.id);
    };

    const sendOne = async (r: any): Promise<void> => {
      // Opt-out/contact são pré-carregados por chunk para não fazer 2 consultas
      // por destinatário no hot path.
      if ((r as any)._optedOut) {
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
        return;
      }

      const campVars = (camp.template_variables as Record<string, string> | null) || {};
      const recVars = (r.variables as Record<string, string> | null) || {};
      const mergedVars = { ...campVars, ...recVars };

      const contactRow = (r as any)._contact ?? null;
      const ctx = buildContext({
        contact: contactRow ?? { phone: r.phone },
        client: clientRow,
        project: projectRow,
        campaign: camp,
        responsavel: responsavelRow,
      });

      const renderedVars: Record<string, string> = {};
      for (const [k, v] of Object.entries(mergedVars)) {
        if (k.startsWith("_")) { renderedVars[k] = String(v ?? ""); continue; }
        renderedVars[k] = renderMapping(String(v ?? ""), ctx);
      }

      const tplVars: string[] = Array.isArray((tpl as any).variables)
        ? ((tpl as any).variables as any[]).map((x) => String(x)).filter((x) => /^\d+$/.test(x))
        : [];
      for (const key of tplVars) {
        const cur = renderedVars[key];
        if (cur == null || cur === "") renderedVars[key] = " ";
      }

      const headerImageOverride = renderedVars._header_image_url || null;
      const rawButtonUrlParam = renderedVars._button_url_param || null;
      const legacyButtonUrlParam = rawButtonUrlParam ? renderMapping(rawButtonUrlParam, ctx) : null;
      const buttonIndexRaw = renderedVars._button_index;
      const legacyButtonIndex = buttonIndexRaw != null && buttonIndexRaw !== "" ? Number(buttonIndexRaw) : 0;

      const tplHeaderType = (tpl.header_type || "").toString().toLowerCase();
      const isMediaHeader = ["image", "video", "document"].includes(tplHeaderType);
      const resolvedHeaderType = headerImageOverride
        ? (isMediaHeader ? tplHeaderType : "image")
        : tpl.header_type;
      let resolvedHeaderValue: string | null = headerImageOverride;
      if (!resolvedHeaderValue) {
        if (isMediaHeader) {
          const rawComponents = ((tpl as any).raw?.components ?? []) as any[];
          const headerComp = rawComponents.find((c: any) => c?.type === "HEADER");
          const exampleUrl = headerComp?.example?.header_handle?.[0] ?? headerComp?.example?.header_url?.[0] ?? null;
          resolvedHeaderValue = (tpl as any).header_media_url || exampleUrl || null;
        } else {
          resolvedHeaderValue = tpl.header_text;
        }
      }

      const btnMapRaw =
        ((camp as any).button_url_mapping as Record<string, string> | null | undefined) ??
        (renderedVars._button_url as unknown as Record<string, string> | undefined) ??
        {};
      const tplButtons = Array.isArray((tpl as any).buttons) ? ((tpl as any).buttons as any[]) : [];
      const dynButtons: { index: number; urlParam: string }[] = [];
      const missingButtons: string[] = [];
      tplButtons.forEach((b: any, idx: number) => {
        if (String(b?.type).toUpperCase() !== "URL") return;
        const url = typeof b?.url === "string" ? b.url : "";
        if (!url.includes("{{")) return;
        const urlVarNums = [...url.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
        const firstVarKey = urlVarNums.length ? String(urlVarNums[0]) : "1";
        const legacyForThisBtn =
          legacyButtonUrlParam && legacyButtonIndex === idx ? legacyButtonUrlParam : null;
        const mappingSrc =
          btnMapRaw[String(idx)] ??
          btnMapRaw[firstVarKey] ??
          legacyForThisBtn ??
          (Array.isArray(b?.example) ? b.example[0] : null) ??
          "";
        const value = renderMapping(String(mappingSrc), ctx).trim();
        if (!value) {
          missingButtons.push(`{{${firstVarKey}}} do botão "${b?.text ?? `#${idx}`}"`);
          return;
        }
        dynButtons.push({ index: idx, urlParam: addDispatchTrackingToButtonParam(value, url, campaignId, r.id) });
      });

      if (missingButtons.length && !dynButtons.length) {
        console.error(
          `[wa-send] Payload bloqueado antes do envio para ${r.phone}: ${missingButtons.join(", ")}`,
        );
        await supabaseAdmin
          .from("campaign_recipients")
          .update({
            status: "failed",
            failed_reason: `Parâmetro do botão ausente: ${missingButtons.join(", ")}`,
            attempt: (r.attempt ?? 0) + 1,
          })
          .eq("id", r.id);
        failed++;
        lastError = `Parâmetro do botão ausente: ${missingButtons.join(", ")}`;
        return;
      }

      const permitGrantedAt = new Date().toISOString();
      // Não faz write no banco antes do fetch da Meta: esse update por mensagem
      // no hot path era suficiente para transformar 80/s em blocos lentos.
      // Persistimos o timestamp junto com o resultado final abaixo.
      const result = await transport.sendTemplateMessage({
        phoneNumberId: conn.phone_number_id!,
        accessToken: conn.access_token!,
        graphVersion: resolveGraphVersion(conn.graph_api_version),
        to: r.phone.replace(/\D/g, ""),
        templateName: tpl.name,
        languageCode: tpl.language || "pt_BR",
        variables: renderedVars,
        headerType: resolvedHeaderType,
        headerValue: resolvedHeaderValue,
        buttons: dynButtons,
        // Dedupe determinístico: Meta ecoa em cada webhook e trata callback_data repetido
        // como idempotente em janela curta — fecha o gap "Meta aceitou, DB caiu, retry duplicou".
        bizOpaqueCallbackData: r.id,
      });

      const attempts = (r.attempt ?? 0) + 1;
      if (result.ok) {
        consecutiveNetworkErrors = 0;
        consecutive429 = 0;
        const metaStatus = (result.messageStatus || "").toLowerCase();
        const wamid = result.wamid;
        if (!wamid) {
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
          return;
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
            request_started_at: (result as any).requestStartedAt ?? null,
            response_received_at: (result as any).responseReceivedAt ?? null,
            permit_granted_at: permitGrantedAt,
            dedup_key: r.id,
            attempt: attempts,
            next_attempt_at: null,
          })
          .eq("id", r.id);
        touchCampaignAfterAccept();
        if (sent <= 3 || sent % 500 === 0) {
          await logEvent(
            campaignId,
            "send_accepted",
            `Meta aceitou envio (${sent} neste tick, amostra)`,
            {
              recipient_id: r.id,
              wamid,
              message_status: metaStatus || null,
              http_status: (result as any).httpStatus,
              sampled: true,
              accepted_in_tick: sent,
            },
          );
        }
        if ((camp as any).reservation_id) {
          await supabaseAdmin.rpc("wallet_consume_reservation" as any, {
            _reservation_id: (camp as any).reservation_id,
            _recipient_id: r.id,
          });
        } else if (!isAdminDispatch) {
          await supabaseAdmin.rpc("wa_consume_stock" as any, {
            _client_id: camp.client_id,
            _project_id: camp.project_id,
            _qty: 1,
          });
        }

        // Pausa programada (Passo 02): a cada N mensagens enviadas, agenda pausa curta
        if ((camp as any).scheduled_pause_enabled) {
          const every = Number((camp as any).pause_every_messages ?? 0);
          const dur = Number((camp as any).pause_duration_seconds ?? 0);
          if (every > 0 && dur > 0) {
            const totalSent = baseSentCount + sent;
            if (totalSent > 0 && totalSent % every === 0) {
              const until = new Date(Date.now() + dur * 1000).toISOString();
              await supabaseAdmin
                .from("wa_campaigns")
                .update({ scheduled_pause_until: until, pause_reason: "scheduled_pause" })
                .eq("id", campaignId);
              systemicPause = {
                reason: "scheduled_pause",
                message: `Pausa programada: ${dur}s após ${every} envios`,
              };
            }
          }
        }
        return;
      }

      // ---- Falha: distinguir rede vs Meta ----
      const isNetworkErr =
        result.code === "network_error" ||
        /failed to fetch|fetch failed|network|econnreset|etimedout|enetunreach|socket hang up/i.test(
          result.error || "",
        );
      const isTokenErr = result.code === "190" || /token|OAuthException/i.test(result.error || "");
      const isRateLimit = result.code === "130429";
      const isPausedTemplate = result.code === "132015" || /template .*paused|temporarily unavailable/i.test(result.error || "");
      const isRetryable = isNetworkErr || isRateLimit ||
        (result.code ? RETRYABLE_CODES.has(String(result.code)) : false);
      const shouldRetry = isRetryable && attempts < MAX_ATTEMPTS;

      lastError = result.error;

      if (isNetworkErr) {
        consecutiveNetworkErrors++;
        if (consecutiveNetworkErrors >= SYSTEMIC_NETWORK_STREAK) {
          await logEvent(campaignId, "network_retry_streak", `${consecutiveNetworkErrors} erros de rede consecutivos — mantendo campanha ativa e reagendando tentativas`, {
            streak: consecutiveNetworkErrors,
            last_error: result.error,
          });
          consecutiveNetworkErrors = 0;
        }
      } else {
        consecutiveNetworkErrors = 0;
      }

      if (isRateLimit) {
        consecutive429++;
        // NÃO pausa a campanha: reduz temporariamente APENAS este número.
        // Depois do throttle expirar, o número volta ao teto progressivamente.
        if (consecutive429 === 1 || consecutive429 % SYSTEMIC_RATE_LIMIT_STREAK === 0) {
          try {
            const { data: newRate } = await supabaseAdmin.rpc("wa_throttle_number" as any, {
              _phone_number_id: phoneNumberId,
              _factor: 0.6,
              _seconds: 20,
              _reason: `130429 x${consecutive429}`,
            });
            await logEvent(
              campaignId,
              "number_throttled",
              `130429 no número ${phoneNumberId} — reduzindo temporariamente para ${newRate ?? "?"} msg/s (campanha segue ativa)`,
              { phone_number_id: phoneNumberId, streak: consecutive429, new_rate: newRate },
            );
          } catch { /* best-effort */ }
        }
      } else {
        consecutive429 = 0;
      }


      if (isTokenErr) {
        systemicPause = {
          reason: "invalid_token",
          message: `Auto-pausada: token inválido/expirado (${result.error})`,
        };
      }

      if (isPausedTemplate) {
        systemicPause = {
          reason: "template_paused",
          message: `Auto-pausada: template pausado/rejeitado pela Meta (${result.error})`,
        };
      }

      if (shouldRetry) {
        await scheduleRetry(r, attempts, result.error || "retry", result.code ?? null);
        return;
      }

      failed++;
      await supabaseAdmin
        .from("campaign_recipients")
        .update({
          status: "failed",
          failed_at: new Date().toISOString(),
          failed_reason: result.error,
          error_code: result.code,
          attempt: attempts,
          request_started_at: (result as any).requestStartedAt ?? null,
          response_received_at: (result as any).responseReceivedAt ?? null,
          permit_granted_at: permitGrantedAt,
        })
        .eq("id", r.id);
      if ((camp as any).reservation_id) {
        await supabaseAdmin.rpc("wallet_release_reservation" as any, {
          _reservation_id: (camp as any).reservation_id,
          _qty: 1,
        });
      }
    };

    // ---- Scheduler: pacing por spacing + concorrência global atômica ----
    //
    // Fase 1 (nova):
    //  A. Pacing LOCAL da campanha por spacing (nextCampaignPermitAt), não por
    //     token bucket cheio. Elimina rajadas: rate=80 → 12.5ms entre inícios,
    //     nunca "80 dispatches instantâneos".
    //  B. Gate GLOBAL do número via wa_try_consume_tokens com _burst_cap_ms=100
    //     (capacidade máx = rate × 100ms; ex.: 80 → 8 tokens). Após pausa longa
    //     não libera 80 tokens de uma vez.
    //  C. Concorrência GLOBAL por número via wa_acquire_slots (atômico no PG):
    //     acquire = 1 RPC por dispatch; release = 1 RPC por segundo (batch).
    //     Números diferentes usam buckets independentes.
    //  D. Reserva em background (kickReserve, sem await no hot path).
    //  E. Telemetria por segundo + sub-segundo (spacing, peak 50/100ms).
    const inflight = new Set<Promise<void>>();
    const baseSentCount = Number((camp as any).sent_count ?? 0);
    let maxConc = campConc;
    const localQueue: any[] = [];
    let reservedTotal = 0;
    let exhausted = false;
    const tickStart = Date.now();

    // Buffer local de tokens do BUCKET GLOBAL do número.
    let localGlobalTokens = 0;
    let lastTokenWaitUntil = 0;

    // Pacing LOCAL da lane: cada trilha paralela cobre 1/laneCount do rate da
    // campanha; somadas, as lanes chegam ao rate configurado. O teto real
    // continua sendo o bucket global do número (wa_try_consume_tokens).
    const spacingMs = (1000 * laneCount) / rawCampRate;
    let nextCampaignPermitAt = Date.now();


    // Vagas de concorrência global do número (acquire atômico, release em batch).
    let localGlobalSlots = 0;
    let slotReleasePending = 0;
    let unusedSlotsReleased = 0;
    let lastSlotFlushAt = Date.now();
    const flushSlotReleases = async (force = false) => {
      const now = Date.now();
      if (!force && slotReleasePending === 0) return;
      if (!force && now - lastSlotFlushAt < 1000) return;
      if (slotReleasePending === 0) { lastSlotFlushAt = now; return; }
      const count = slotReleasePending;
      slotReleasePending = 0;
      lastSlotFlushAt = now;
      try {
        const t0 = clock.now();
        await supabaseAdmin.rpc("wa_release_slots" as any, {
          _phone_number_id: phoneNumberId,
          _count: count,
        });
        onRpc?.({ rpc: "wa_release_slots", ms: clock.now() - t0, requested: count, granted: count });
      } catch (err) {
        // se falhar, devolve ao acumulador para tentar de novo depois
        slotReleasePending += count;
        console.error("[wa-queue] wa_release_slots failed", err);
      }
    };

    const releaseUnusedAcquiredSlots = async () => {
      if (localGlobalSlots <= 0) return;
      unusedSlotsReleased += localGlobalSlots;
      slotReleasePending += localGlobalSlots;
      localGlobalSlots = 0;
      await flushSlotReleases(true);
    };

    let reservingPromise: Promise<number> | null = null;

    const reserveNextChunk = async (): Promise<number> => {
      if (exhausted || reservedTotal >= budget) return 0;
      const want = Math.min(chunkSize, budget - reservedTotal);
      const ts = new Date().toISOString();
      const { data: chunk } = await supabaseAdmin.rpc("wa_reserve_campaign_recipients" as any, {
        _campaign_id: campaignId,
        _limit: want,
        _locked_at: ts,
      });
      if (!chunk || chunk.length === 0) {
        exhausted = true;
        return 0;
      }
      const rawPhones: string[] = [...new Set((chunk as any[]).map((r: any) => String(r.phone ?? "")).filter(Boolean))];
      const contactIds: string[] = [...new Set((chunk as any[]).map((r: any) => String(r.contact_id ?? "")).filter(Boolean))];
      const [optOutRes, contactByIdRes, contactByPhoneRes] = await Promise.all([
        rawPhones.length
          ? supabaseAdmin.from("opt_outs").select("phone").in("phone", rawPhones)
          : Promise.resolve({ data: [] } as any),
        contactIds.length
          ? supabaseAdmin.from("contacts").select("*").in("id", contactIds)
          : Promise.resolve({ data: [] } as any),
        rawPhones.length
          ? supabaseAdmin.from("contacts").select("*").in("phone", rawPhones)
          : Promise.resolve({ data: [] } as any),
      ]);
      const optedOut = new Set(((optOutRes as any).data ?? []).map((x: any) => String(x.phone)));
      const contactsById = new Map(((contactByIdRes as any).data ?? []).map((x: any) => [String(x.id), x]));
      const contactsByPhone = new Map(((contactByPhoneRes as any).data ?? []).map((x: any) => [String(x.phone), x]));
      for (const r of chunk as any[]) {
        (r as any)._optedOut = optedOut.has(String(r.phone));
        (r as any)._contact = (r.contact_id ? contactsById.get(String(r.contact_id)) : null) ?? contactsByPhone.get(String(r.phone)) ?? null;
      }
      localQueue.push(...chunk);
      reservedTotal += chunk.length;
      return chunk.length;
    };

    const kickReserve = () => {
      if (reservingPromise || exhausted || reservedTotal >= budget) return;
      reservingPromise = reserveNextChunk().finally(() => {
        reservingPromise = null;
      });
    };

    // Telemetria por segundo + timestamps sub-segundo para peak 50/100ms + spacing.
    let startedThisSecond = 0;
    let rateLimitedBySecond = { global: 0, campaign: 0, concurrency: 0, global_slot: 0 };
    let lastTelemetrySecond = Math.floor(Date.now() / 1000);
    const dispatchTimestamps: number[] = [];
    const throughputSamples: Array<{
      t: number; started: number; active: number; effRate: number;
      globalTokens: number;
      limited_by_global: number; limited_by_campaign: number;
      limited_by_concurrency: number; limited_by_global_slot: number;
    }> = [];
    const flushTelemetryIfNeeded = () => {
      const nowSec = Math.floor(Date.now() / 1000);
      if (nowSec !== lastTelemetrySecond) {
        throughputSamples.push({
          t: lastTelemetrySecond,
          started: startedThisSecond,
          active: inflight.size,
          effRate: effectiveRate,
          globalTokens: +localGlobalTokens.toFixed(2),
          limited_by_global: rateLimitedBySecond.global,
          limited_by_campaign: rateLimitedBySecond.campaign,
          limited_by_concurrency: rateLimitedBySecond.concurrency,
          limited_by_global_slot: rateLimitedBySecond.global_slot,
        });
        startedThisSecond = 0;
        rateLimitedBySecond = { global: 0, campaign: 0, concurrency: 0, global_slot: 0 };
        lastTelemetrySecond = nowSec;
      }
    };

    // Bootstrap
    await reserveNextChunk();

    const laneRuntimeMs = Math.max(2000, Number(opts?.maxRuntimeMs ?? MAX_TICK_RUNTIME_MS));
    while (!systemicPause) {
      if (Date.now() - tickStart > laneRuntimeMs) break;

      flushTelemetryIfNeeded();
      // libera slots consumidos em batch (~1×/s)
      if (Date.now() - lastSlotFlushAt >= 1000) {
        await flushSlotReleases();
      }

      if (localQueue.length < queueLowWatermark && !exhausted && reservedTotal < budget) {
        kickReserve();
      }

      if (localQueue.length === 0) {
        if (reservingPromise) { await reservingPromise; continue; }
        if (inflight.size === 0) break;
        await Promise.race(inflight);
        continue;
      }

      // Concorrência LOCAL da campanha
      if (inflight.size >= maxConc) {
        rateLimitedBySecond.concurrency++;
        await Promise.race(inflight);
        continue;
      }

      const now = Date.now();

      // ------ Gate A: pacing LOCAL da campanha (sem rajada) ------
      if (now < nextCampaignPermitAt) {
        rateLimitedBySecond.campaign++;
        const waitMs = Math.max(1, Math.min(nextCampaignPermitAt - now, 50));
        await clock.sleep(waitMs);
        continue;
      }

      // ------ Gate B: bucket GLOBAL do número ------
      if (localGlobalTokens < 1 && now >= lastTokenWaitUntil) {
        const wantTokens = Math.min(
          Math.max(1, maxConc - inflight.size),
          localQueue.length,
          Math.max(1, Math.ceil(phoneBucketRate)), // ~1s de rate por RPC; pacing local impede rajada
        );
        const tk0 = clock.now();
        const { data: tok } = await supabaseAdmin.rpc("wa_try_consume_tokens" as any, {
          _phone_number_id: phoneNumberId,
          _requested: wantTokens,
          _default_rate: phoneBucketRate,
          _default_conc: campConc,
          _override_rate: phoneBucketRate,
          _override_conc: campConc,
          _burst_cap_ms: 1000,
        });
        const row = Array.isArray(tok) ? tok[0] : tok;
        onRpc?.({ rpc: "wa_try_consume_tokens", ms: clock.now() - tk0, requested: wantTokens, granted: Number(row?.granted ?? 0) });
        if (row?.max_concurrency && row.max_concurrency > 0) {
          maxConc = Math.min(campConc, row.max_concurrency);
        }
        const granted = Math.max(0, Number(row?.granted ?? 0));
        localGlobalTokens += granted;
        if (granted === 0) {
          rateLimitedBySecond.global++;
          const waitMs = Math.max(1, Math.min(row?.wait_ms ?? 50, 100));
          lastTokenWaitUntil = now + waitMs;
          await clock.sleep(waitMs);
          continue;
        }
      } else if (localGlobalTokens < 1) {
        rateLimitedBySecond.global++;
        const waitMs = Math.max(1, lastTokenWaitUntil - now);
        await clock.sleep(Math.min(waitMs, 50));
        continue;
      }

      // ------ Gate C: vaga de concorrência GLOBAL do número (atômico no PG, em BATCH) ------
      if (localGlobalSlots < 1) {
        // Batch p/ eliminar RPC por dispatch (era ~100ms crítico → limitava a ~6/s).
        const wantSlots = Math.max(
          1,
          Math.min(
            Math.max(1, maxConc - inflight.size),
            Math.max(1, localQueue.length),
            Math.max(1, Math.ceil(phoneBucketRate)), // ~1s de rate por RPC; pacing local impede rajada
          ),
        );
        const sl0 = clock.now();
        const { data: slotRow } = await supabaseAdmin.rpc("wa_acquire_slots" as any, {
          _phone_number_id: phoneNumberId,
          _requested: wantSlots,
          _max_conc: globalMaxConc,
        });
        const s = Array.isArray(slotRow) ? slotRow[0] : slotRow;
        const grantedSlots = Math.max(0, Number(s?.granted ?? 0));
        onRpc?.({ rpc: "wa_acquire_slots", ms: clock.now() - sl0, requested: wantSlots, granted: grantedSlots });
        localGlobalSlots += grantedSlots;
        if (grantedSlots === 0) {
          rateLimitedBySecond.global_slot++;
          await clock.sleep(20);
          continue;
        }
      }


      // Despacha: consome 1 token global + 1 slot global + agenda próximo spacing da campanha
      localGlobalTokens -= 1;
      localGlobalSlots -= 1;
      // spacing baseado no now atual (evita drift acumulado após pausas longas)
      nextCampaignPermitAt = now + spacingMs;
      startedThisSecond += 1;
      dispatchTimestamps.push(now);
      const r = localQueue.shift();
      let p!: Promise<void>;
      p = sendOne(r)
        .catch((err) => {
          console.error("[wa-queue] sendOne threw", err);
        })
        .finally(() => {
          inflight.delete(p);
          slotReleasePending += 1;
        }) as Promise<void>;
      inflight.add(p);
    }

    // IMPORTANTE: slots adquiridos em batch e não usados neste tick também
    // pertencem ao contador global. Se não devolver aqui, active_inflight fica
    // preso no teto e os próximos ticks parecem “travados por minuto”.
    await releaseUnusedAcquiredSlots();

    flushTelemetryIfNeeded();

    // A partir daqui não abrimos novas requisições, só esperamos respostas já
    // em voo para gravar resultado e devolver slots. Libera o lease da campanha
    // antes desse drain para outro tick continuar abrindo requests e evitar
    // o padrão "manda bloco, espera tudo terminar, manda outro bloco".
    await releaseCampaignLeaseOnce();

    // Drena envios em voo
    if (inflight.size) {
      await Promise.all(inflight);
    }
    if (reservingPromise) {
      try { await reservingPromise; } catch { /* noop */ }
    }
    if (touchCampaignPromise) {
      try { await touchCampaignPromise; } catch { /* noop */ }
    }
    // Libera todos os slots restantes (batch final)
    await flushSlotReleases(true);

    // Rollback: recipients reservados mas não despachados voltam para pending
    if (localQueue.length > 0) {
      const laterIds = localQueue.map((x: any) => x.id);
      await supabaseAdmin
        .from("campaign_recipients")
        .update({ status: "pending" })
        .in("id", laterIds);
    }

    // Estatísticas sub-segundo (spacing + peak 50/100ms)
    let subSecStats: any = null;
    if (dispatchTimestamps.length >= 2) {
      const ts = dispatchTimestamps;
      const spacings: number[] = [];
      for (let i = 1; i < ts.length; i++) spacings.push(ts[i] - ts[i - 1]);
      spacings.sort((a, b) => a - b);
      const sum = spacings.reduce((s, x) => s + x, 0);
      // sliding windows 50/100ms
      const windowPeak = (winMs: number) => {
        let peak = 0, left = 0;
        for (let right = 0; right < ts.length; right++) {
          while (ts[right] - ts[left] > winMs) left++;
          peak = Math.max(peak, right - left + 1);
        }
        return peak;
      };
      subSecStats = {
        average_spacing_ms: +(sum / spacings.length).toFixed(2),
        minimum_spacing_ms: spacings[0],
        maximum_spacing_ms: spacings[spacings.length - 1],
        median_spacing_ms: spacings[Math.floor(spacings.length / 2)],
        peak_started_per_50ms: windowPeak(50),
        peak_started_per_100ms: windowPeak(100),
        expected_spacing_ms: +spacingMs.toFixed(2),
      };
    }

    if (throughputSamples.length > 0) {
      const totalStarted = throughputSamples.reduce((s, x) => s + x.started, 0);
      const peak = throughputSamples.reduce((m, x) => Math.max(m, x.started), 0);
      const avg = +(totalStarted / throughputSamples.length).toFixed(2);
      await logEvent(campaignId, "throughput_sample", `Cadência do tick: avg ${avg} msg/s (pico ${peak}), config ${effectiveRate} msg/s, ${throughputSamples.length}s`, {
        configured_rate: effectiveRate,
        raw_configured_rate: rawCampRate,
        number_max_rate: numberMaxRate,
        number_global_rate: numberGlobalRate,
        phone_bucket_rate: phoneBucketRate,
        max_concurrency: campConc,
        global_max_concurrency: globalMaxConc,
        unused_slots_released: unusedSlotsReleased,
        avg_started_per_second: avg,
        peak_started_per_second: peak,
        total_started: totalStarted,
        tick_duration_ms: Date.now() - tickStart,
        sub_second: subSecStats,
        samples: throughputSamples,
      });
    }



    const sp = systemicPause as { reason: string; message: string } | null;
    if (sp) {
      await markPaused(campaignId, sp.reason, sp.message);
      return { processed: sent + failed, done: false, reason: sp.reason };
    }



    // Auto-pause on failure-rate threshold — só recalcula quando houve falhas neste lote,
    // evitando um full-scan de status a cada tick.
    const threshold = (camp as any).abort_on_failure_rate as number | null;
    const minProc = (camp as any).min_processed_for_abort ?? 50;
    if (threshold && threshold > 0 && failed > 0) {
      const [{ count: failedTotal }, { count: pendingLike }] = await Promise.all([
        supabaseAdmin
          .from("campaign_recipients")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaignId)
          .eq("status", "failed"),
        supabaseAdmin
          .from("campaign_recipients")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaignId)
          .in("status", ["pending", "processing"]),
      ]);
      const totalRecipients = (camp as any).total_recipients ?? 0;
      const processedTotal = Math.max(totalRecipients - (pendingLike ?? 0), 0);
      const fT = failedTotal ?? 0;
      if (processedTotal >= minProc && processedTotal > 0 && fT / processedTotal >= threshold) {
        await markPaused(
          campaignId,
          "failure_rate",
          `Auto-pausada: taxa de falha ${(100 * fT / processedTotal).toFixed(1)}% ≥ ${(100 * threshold).toFixed(0)}%`,
        );
        return { processed: sent + failed, done: false, reason: "failure_rate" };
      }
    }

    // Update speed / last_sent / last_error on campaign — deriva pending/done a partir
    // de UMA única contagem por status, evitando 2 counts full-scan por tick.
    const startedAt = camp.started_at ? new Date(camp.started_at as string).getTime() : null;
    const totalRecipients = (camp as any).total_recipients ?? 0;
    const { count: pending } = await supabaseAdmin
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .in("status", ["pending", "processing"]);
    let speed: number | null = null;
    if (startedAt && totalRecipients > 0) {
      const doneCount = Math.max(totalRecipients - (pending ?? 0), 0);
      const mins = Math.max((Date.now() - startedAt) / 60000, 0.1);
      speed = +((doneCount / mins).toFixed(2));
    }
    await supabaseAdmin
      .from("wa_campaigns")
      .update({
        last_sent_at: sent > 0 ? new Date().toISOString() : camp.last_sent_at,
        last_error: lastError ?? camp.last_error,
        avg_speed_per_min: speed,
      })
      .eq("id", campaignId);

    if (!pending) {
      await finalizeCampaign(campaignId);
      return { processed: sent + failed, done: true };
    }

    return { processed: sent + failed, done: false };
  } finally {
    await releaseCampaignLeaseOnce();
  }
}

export { OPT_OUT_REGEX };
