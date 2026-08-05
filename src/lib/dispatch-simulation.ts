// ============================================================================
// Cálculo por-dispatch da progressão pública — 100% client-side, isolado.
// Não lê nem escreve nada. Apenas transforma config + real em snapshot.
// ============================================================================

export type DispatchSimRow = {
  wa_campaign_id: string;
  campaign_id: string | null;
  start_at: string | null;
  end_at: string | null;
  duration_sec: number | null;
  refresh_interval_sec: number;
  sent_start: number;
  sent_end: number;
  delivered_ratio: number | null;
  failed_ratio: number | null;
  delivered_start: number | null;
  delivered_end: number | null;
  failed_start: number | null;
  failed_end: number | null;
  percent_start: number | null;
  percent_end: number | null;
  growth: "linear" | "random" | "batches" | "stepped" | "real_plus" | "manual";
  growth_params: Record<string, unknown> | null;
  pauses: Array<{
    after_sent: number;
    duration_sec: number;
    status_label?: string | null;
    recalc_eta?: boolean;
  }>;
  runtime: {
    active?: boolean;
    started_at?: string | null;
    paused_at?: string | null;
    accumulated_pause_ms?: number;
    manual_value?: number;
  };
  status_label: string | null;
};

export type DispatchOverrideRow = {
  wa_campaign_id: string;
  campaign_id: string | null;
  enabled: boolean;
  mode: "real" | "fixed" | "auto";
  public_name: string | null;
  public_status: string | null;
  fixed: {
    total?: number | null;
    sent?: number | null;
    delivered?: number | null;
    failed?: number | null;
    percent?: number | null;
    started_at?: string | null;
    eta_at?: string | null;
    speed_label?: string | null;
    updated_at?: string | null;
  } | null;
};

export type Snapshot = {
  name: string | null;
  status: string | null;
  total: number;
  sent: number;
  delivered: number;
  failed: number;
  percent: number;
  started_at: string | null;
  eta_at: string | null;
  speed_label: string | null;
  updated_at: string | null;
  source: "real" | "fixed" | "auto";
};

function seededRandom(seed: number): number {
  const s = Math.sin(seed) * 10000;
  return s - Math.floor(s);
}

function programmedPauseMs(sim: DispatchSimRow, sentSoFar: number): number {
  let total = 0;
  for (const p of sim.pauses ?? []) {
    if (p.after_sent > 0 && sentSoFar >= p.after_sent) {
      total += Math.max(0, p.duration_sec) * 1000;
    }
  }
  return total;
}

function projectSent(sim: DispatchSimRow, elapsedMs: number, real: { sent: number }): number {
  const start = Math.max(0, sim.sent_start ?? 0);
  const end = Math.max(start, sim.sent_end ?? start);
  if (elapsedMs <= 0) return start;

  const params = sim.growth_params ?? {};
  const durationMs =
    (sim.duration_sec && sim.duration_sec > 0
      ? sim.duration_sec * 1000
      : sim.end_at && sim.start_at
        ? new Date(sim.end_at).getTime() - new Date(sim.start_at).getTime()
        : 60 * 60_000) || 60 * 60_000;

  if (sim.growth === "manual") {
    const manual = Number(sim.runtime?.manual_value ?? start);
    return Math.min(end, Math.max(start, manual));
  }

  if (sim.growth === "real_plus") {
    const extra = Number(params.offset ?? 0);
    return Math.min(end, Math.max(start, real.sent + extra));
  }

  if (sim.growth === "stepped") {
    const steps = Array.isArray(params.steps)
      ? (params.steps as Array<{ t_sec: number; sent: number }>).sort((a, b) => a.t_sec - b.t_sec)
      : [];
    let v = start;
    const tSec = elapsedMs / 1000;
    for (const s of steps) if (tSec >= s.t_sec) v = s.sent;
    return Math.min(end, Math.max(start, v));
  }

  const linear = Math.min(1, elapsedMs / durationMs);
  let sent = start + linear * (end - start);

  if (sim.growth === "random") {
    const min = Number(params.random_min ?? 0.9);
    const max = Number(params.random_max ?? 1.1);
    const seed = Math.floor(elapsedMs / 5000);
    const rand = min + seededRandom(seed) * (max - min);
    sent = start + (sent - start) * rand;
  } else if (sim.growth === "batches") {
    const batchSize = Math.max(1, Number(params.batch_size ?? 100));
    const batchIntervalSec = Math.max(1, Number(params.batch_interval_sec ?? 30));
    const batches = Math.floor(elapsedMs / 1000 / batchIntervalSec);
    sent = Math.min(end, start + batches * batchSize);
  }

  return Math.min(end, Math.max(start, sent));
}

export function computeDispatchSnapshot(
  override: DispatchOverrideRow | null,
  sim: DispatchSimRow | null,
  real: {
    name: string | null;
    status: string | null;
    total: number;
    sent: number;
    delivered: number;
    failed: number;
  },
  now: Date,
): Snapshot {
  const enabled = override?.enabled === true;
  const name = enabled && override?.public_name ? override.public_name : real.name;

  // Modo REAL ou personalização desativada
  if (!enabled || override?.mode === "real" || !override?.mode) {
    const total = real.total || 0;
    return {
      name,
      status: real.status,
      total,
      sent: real.sent,
      delivered: real.delivered,
      failed: real.failed,
      percent: total > 0 ? Math.min(100, (real.sent / total) * 100) : 0,
      started_at: null,
      eta_at: null,
      speed_label: null,
      updated_at: null,
      source: "real",
    };
  }

  // Modo FIXO
  if (override.mode === "fixed") {
    const f = override.fixed ?? {};
    const total = Number(f.total ?? real.total ?? 0);
    const sent = Number(f.sent ?? real.sent ?? 0);
    const delivered = Number(f.delivered ?? real.delivered ?? 0);
    const failed = Number(f.failed ?? real.failed ?? 0);
    const percent =
      f.percent != null ? Number(f.percent) : total > 0 ? Math.min(100, (sent / total) * 100) : 0;
    return {
      name,
      status: override.public_status || real.status,
      total,
      sent,
      delivered,
      failed,
      percent,
      started_at: f.started_at ?? null,
      eta_at: f.eta_at ?? null,
      speed_label: f.speed_label ?? null,
      updated_at: f.updated_at ?? null,
      source: "fixed",
    };
  }

  // Modo AUTO
  if (!sim) {
    // sem simulação configurada → cai em real
    return computeDispatchSnapshot({ ...override, mode: "real" } as DispatchOverrideRow, null, real, now);
  }

  const active = sim.runtime?.active === true;
  const startedAt = sim.runtime?.started_at
    ? new Date(sim.runtime.started_at)
    : sim.start_at
      ? new Date(sim.start_at)
      : null;
  const isPaused = !!sim.runtime?.paused_at;

  if (!active || !startedAt) {
    return {
      name,
      status: override.public_status || sim.status_label || "Agendada",
      total: sim.sent_end,
      sent: sim.sent_start,
      delivered: sim.delivered_start ?? 0,
      failed: sim.failed_start ?? 0,
      percent: sim.percent_start ?? 0,
      started_at: sim.start_at,
      eta_at: sim.end_at,
      speed_label: null,
      updated_at: null,
      source: "auto",
    };
  }

  let elapsedMs = Math.max(0, now.getTime() - startedAt.getTime());
  if (isPaused && sim.runtime.paused_at) {
    elapsedMs = Math.max(0, new Date(sim.runtime.paused_at).getTime() - startedAt.getTime());
  }
  elapsedMs -= sim.runtime.accumulated_pause_ms ?? 0;
  if (elapsedMs < 0) elapsedMs = 0;

  let sent = projectSent(sim, elapsedMs, real);
  const pMs = programmedPauseMs(sim, sent);
  if (pMs > 0) {
    elapsedMs = Math.max(0, elapsedMs - pMs);
    sent = projectSent(sim, elapsedMs, real);
  }
  sent = Math.floor(sent);

  // "Real + simulado": a curva nunca fica abaixo dos números reais, então se o
  // disparo real voltar a andar (ou já passou da projeção), o público acompanha.
  const floorReal = Boolean((sim.growth_params ?? {})['floor_real']);
  if (floorReal) sent = Math.max(sent, real.sent);

  const total = Math.max(sent, sim.sent_end);
  const dStart = sim.delivered_start ?? 0;
  const dEnd = sim.delivered_end ?? Math.floor(sim.sent_end * (sim.delivered_ratio ?? 0.95));
  const fStart = sim.failed_start ?? 0;
  const fEnd = sim.failed_end ?? Math.floor(sim.sent_end * (sim.failed_ratio ?? 0.05));

  const progress = sim.sent_end > sim.sent_start ? (sent - sim.sent_start) / (sim.sent_end - sim.sent_start) : 0;
  let delivered = Math.min(sent, Math.floor(dStart + progress * (dEnd - dStart)));
  let failed = Math.min(sent, Math.floor(fStart + progress * (fEnd - fStart)));
  if (floorReal) {
    delivered = Math.min(sent, Math.max(delivered, real.delivered));
    // Quando a simulação prevê queda de falhas (reprocessamento), o piso real
    // não se aplica — as falhas devem diminuir até o alvo configurado.
    if (fEnd >= fStart) failed = Math.min(sent, Math.max(failed, real.failed));
  }


  const percent = total > 0 ? Math.min(100, (sent / total) * 100) : 0;

  // ETA
  let etaAt: string | null = sim.end_at;
  if (sent < sim.sent_end && elapsedMs > 1000) {
    const rate = sent > sim.sent_start ? (sent - sim.sent_start) / (elapsedMs / 1000) : 0;
    if (rate > 0) {
      const remaining = sim.sent_end - sent;
      etaAt = new Date(now.getTime() + (remaining / rate) * 1000).toISOString();
    }
  }

  // Status durante pausa programada
  let statusText = override.public_status || sim.status_label || "Em execução";
  const activePause = (sim.pauses ?? []).find(
    (p) => sent >= p.after_sent && sent < p.after_sent + Math.max(1, (p.duration_sec / Math.max(1, sim.duration_sec ?? 3600)) * (sim.sent_end - sim.sent_start)),
  );
  if (isPaused) statusText = "Pausada";
  else if (activePause?.status_label) statusText = activePause.status_label;
  else if (sent >= sim.sent_end) statusText = "Concluída";

  return {
    name,
    status: statusText,
    total,
    sent,
    delivered,
    failed,
    percent,
    started_at: sim.runtime.started_at ?? sim.start_at,
    eta_at: etaAt,
    speed_label: null,
    updated_at: now.toISOString(),
    source: "auto",
  };
}
