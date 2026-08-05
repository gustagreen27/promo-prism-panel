// End-to-end harness for processCampaignTick (Fase 2 — DI apenas, sem WRR).
// Cria uma campanha sintética, injeta transporte fake com latência configurável
// e roda o scheduler REAL (reserva, pacing, rate limiter, concorrência, releases,
// telemetria). Depois lê os throughput_sample e as métricas RPC coletadas via
// instrumentation, agrega e faz cleanup.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  processCampaignTick,
  type WaTransport,
  type WaRpcSample,
} from "@/lib/wa-queue.server";

const ADMIN_USER_ID = "869c12fd-8d99-41fa-a970-77608a94fe02";
const HARNESS_WORKSPACE_ID = "2156c069-7c38-4e35-bfa2-39500f542f6d";

export function buildFakeTransport(latencyMs: number): WaTransport {
  let counter = 0;
  return {
    sendTemplateMessage: (async () => {
      if (latencyMs > 0) await new Promise((r) => setTimeout(r, latencyMs));
      counter++;
      return {
        ok: true,
        wamid: `harness_${Date.now()}_${counter}_${Math.random().toString(36).slice(2, 8)}`,
        messageStatus: "accepted",
        httpStatus: 200,
        raw: null,
      } as any;
    }) as any,
  };
}

type Setup = {
  tag: string;
  campaignId: string;
  connectionId: string;
  templateId: string;
  phoneNumberId: string;
};

async function setup(params: {
  rate: number;
  recipients: number;
  globalMaxConc: number;
  campConc: number;
  numberMaxRate: number;
}): Promise<Setup> {
  const tag = `harness-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const phoneNumberId = tag;

  const { data: conn, error: connErr } = await supabaseAdmin
    .from("whatsapp_connections")
    .insert({
      name: tag,
      nome_interno: tag,
      phone_number_id: phoneNumberId,
      access_token: "harness-fake",
      graph_api_version: "v21.0",
      use_global_token: false,
      global_rate_per_second: params.numberMaxRate,
      maximum_rate_per_second: params.numberMaxRate,
      global_max_concurrency: params.globalMaxConc,
      display_phone: "+000000000000",
      status: "connected",
    } as any)
    .select("*")
    .single();
  if (connErr || !conn) throw new Error(`setup connection failed: ${connErr?.message}`);

  const { data: tpl, error: tplErr } = await supabaseAdmin
    .from("whatsapp_templates")
    .insert({
      name: tag,
      language: "pt_BR",
      status: "approved",
      connection_id: conn.id,
      header_type: "none",
      body: "Harness body {{1}}",
    } as any)
    .select("*")
    .single();
  if (tplErr || !tpl) throw new Error(`setup template failed: ${tplErr?.message}`);

  const { data: camp, error: campErr } = await supabaseAdmin
    .from("wa_campaigns")
    .insert({
      name: tag,
      connection_id: conn.id,
      template_id: tpl.id,
      status: "running",
      rate_per_second: params.rate,
      max_concurrency: params.campConc,
      total_recipients: params.recipients,
      started_at: new Date().toISOString(),
      created_by: ADMIN_USER_ID,
      template_variables: { "1": "harness" },
    } as any)
    .select("*")
    .single();
  if (campErr || !camp) throw new Error(`setup campaign failed: ${campErr?.message}`);

  const rows = Array.from({ length: params.recipients }, (_, i) => ({
    campaign_id: camp.id,
    phone: `55${String(11900000000 + i).padStart(11, "0")}`,
    status: "pending" as const,
    variables: {},
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabaseAdmin.from("campaign_recipients").insert(rows.slice(i, i + 500) as any);
    if (error) throw new Error(`insert recipients failed: ${error.message}`);
  }

  return { tag, campaignId: camp.id, connectionId: conn.id, templateId: tpl.id, phoneNumberId };
}

async function cleanup(s: Setup) {
  try { await supabaseAdmin.from("campaign_recipients").delete().eq("campaign_id", s.campaignId); } catch {}
  try { await supabaseAdmin.from("campaign_timeline").delete().eq("campaign_id", s.campaignId); } catch {}
  try { await supabaseAdmin.from("wa_campaigns").delete().eq("id", s.campaignId); } catch {}
  try { await supabaseAdmin.from("whatsapp_templates").delete().eq("id", s.templateId); } catch {}
  try { await supabaseAdmin.from("whatsapp_connections").delete().eq("id", s.connectionId); } catch {}
  try { await supabaseAdmin.from("wa_rate_limits").delete().eq("phone_number_id", s.phoneNumberId); } catch {}
}

function pct(arr: number[], p: number): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)));
  return s[idx];
}

export async function runScenario(params: {
  rate: number;
  latencyMs: number;
  recipients: number;
  ticks: number;
  campConc?: number;
  globalMaxConc?: number;
  numberMaxRate?: number;
  reservationBudget?: number;
}) {
  const campConc = params.campConc ?? Math.max(30, params.rate * 2);
  const globalMaxConc = params.globalMaxConc ?? 300;
  const numberMaxRate = params.numberMaxRate ?? 80;
  const s = await setup({
    rate: params.rate,
    recipients: params.recipients,
    globalMaxConc,
    campConc,
    numberMaxRate,
  });

  const transport = buildFakeTransport(params.latencyMs);
  const rpcSamples: WaRpcSample[] = [];
  const instrumentation = { onRpc: (x: WaRpcSample) => rpcSamples.push(x) };

  const tickResults: any[] = [];
  const tickGaps: number[] = [];
  let lastTickEnd = 0;
  try {
    for (let i = 0; i < params.ticks; i++) {
      if (lastTickEnd) tickGaps.push(Date.now() - lastTickEnd);
      const t0 = Date.now();
      const res = await processCampaignTick(s.campaignId, params.reservationBudget ?? 5000, {
        transport,
        instrumentation,
      });
      tickResults.push({ ...res, duration_ms: Date.now() - t0 });
      lastTickEnd = Date.now();
      if (res.done) break;
    }
  } catch (err: any) {
    tickResults.push({ error: err?.message ?? String(err) });
  }

  const { data: events } = await supabaseAdmin
    .from("campaign_timeline")
    .select("payload,created_at")
    .eq("campaign_id", s.campaignId)
    .eq("event_type", "throughput_sample")
    .order("created_at", { ascending: true });

  const perSecondSamples: any[] = [];
  const subSecondPerTick: any[] = [];
  for (const ev of events ?? []) {
    const p = (ev as any).payload as any;
    if (Array.isArray(p?.samples)) perSecondSamples.push(...p.samples);
    if (p?.sub_second) subSecondPerTick.push(p.sub_second);
  }

  const perSec = perSecondSamples.map((x) => Number(x.started ?? 0));
  const totalStarted = perSec.reduce((a, b) => a + b, 0);
  const seconds = perSec.length;
  const avg = seconds ? totalStarted / seconds : 0;
  const minPS = seconds ? Math.min(...perSec) : 0;
  const maxPS = seconds ? Math.max(...perSec) : 0;
  const peak50 = subSecondPerTick.reduce((m, x) => Math.max(m, Number(x.peak_started_per_50ms ?? 0)), 0);
  const peak100 = subSecondPerTick.reduce((m, x) => Math.max(m, Number(x.peak_started_per_100ms ?? 0)), 0);
  const maxActive = perSecondSamples.reduce((m, x) => Math.max(m, Number(x.active ?? 0)), 0);

  // Aggregate spacing across ticks (weighted by dispatch count would be ideal;
  // we use per-tick means and overall min/max/median of spacing summaries).
  const spacingAvgs = subSecondPerTick.map((x) => Number(x.average_spacing_ms ?? 0));
  const spacingMins = subSecondPerTick.map((x) => Number(x.minimum_spacing_ms ?? 0));
  const spacingMaxes = subSecondPerTick.map((x) => Number(x.maximum_spacing_ms ?? 0));
  const spacingMeds = subSecondPerTick.map((x) => Number(x.median_spacing_ms ?? 0));

  const limited = perSecondSamples.reduce(
    (acc, x) => ({
      global: acc.global + Number(x.limited_by_global ?? 0),
      campaign: acc.campaign + Number(x.limited_by_campaign ?? 0),
      concurrency: acc.concurrency + Number(x.limited_by_concurrency ?? 0),
      global_slot: acc.global_slot + Number(x.limited_by_global_slot ?? 0),
    }),
    { global: 0, campaign: 0, concurrency: 0, global_slot: 0 },
  );

  const acquire = rpcSamples.filter((x) => x.rpc === "wa_acquire_slots").map((x) => x.ms);
  const release = rpcSamples.filter((x) => x.rpc === "wa_release_slots").map((x) => x.ms);
  const tokens = rpcSamples.filter((x) => x.rpc === "wa_try_consume_tokens").map((x) => x.ms);
  const mean = (a: number[]) => (a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : 0);

  const { data: recs } = await supabaseAdmin
    .from("campaign_recipients")
    .select("status,meta_message_id")
    .eq("campaign_id", s.campaignId);
  const wamids = (recs ?? []).map((r) => (r as any).meta_message_id).filter(Boolean) as string[];
  const dupes = wamids.length - new Set(wamids).size;
  const stuck = (recs ?? []).filter((r) => (r as any).status === "processing").length;
  const sentOrAccepted = (recs ?? []).filter((r) => ["sent", "accepted"].includes((r as any).status)).length;

  const { data: rl } = await supabaseAdmin
    .from("wa_rate_limits")
    .select("active_inflight,global_max_concurrency")
    .eq("phone_number_id", s.phoneNumberId)
    .maybeSingle();
  const slotOrphansAfter = Number((rl as any)?.active_inflight ?? 0);

  const metrics = {
    scenario: {
      rate: params.rate,
      latencyMs: params.latencyMs,
      recipients: params.recipients,
      ticks: params.ticks,
      campConc,
      globalMaxConc,
      numberMaxRate,
    },
    ticks: tickResults,
    totals: {
      total_started: totalStarted,
      recipients_sent_or_accepted: sentOrAccepted,
      seconds_sampled: seconds,
      avg_per_second: +avg.toFixed(2),
      min_per_second: minPS,
      max_per_second: maxPS,
      peak_started_per_50ms: peak50,
      peak_started_per_100ms: peak100,
      max_active_inflight: maxActive,
      max_tick_gap_ms: tickGaps.length ? Math.max(...tickGaps) : 0,
      tick_gaps_ms: tickGaps,
      duplicates: dupes,
      stuck_processing: stuck,
      slot_orphans_after: slotOrphansAfter,
    },
    spacing: {
      avg_ms_per_tick: spacingAvgs,
      min_ms_per_tick: spacingMins,
      max_ms_per_tick: spacingMaxes,
      median_ms_per_tick: spacingMeds,
      expected_ms: subSecondPerTick[0]?.expected_spacing_ms ?? null,
    },
    limited_totals: limited,
    rpc: {
      acquire: {
        count: acquire.length,
        per_second: seconds ? +(acquire.length / seconds).toFixed(2) : 0,
        avg_ms: mean(acquire),
        p95_ms: pct(acquire, 0.95),
        p99_ms: pct(acquire, 0.99),
        max_ms: acquire.length ? Math.max(...acquire) : 0,
      },
      release: {
        count: release.length,
        per_second: seconds ? +(release.length / seconds).toFixed(2) : 0,
        avg_ms: mean(release),
      },
      tokens: {
        count: tokens.length,
        avg_ms: mean(tokens),
        p95_ms: pct(tokens, 0.95),
      },
    },
    per_second_started: perSec,
  };

  await cleanup(s);
  return metrics;
}
