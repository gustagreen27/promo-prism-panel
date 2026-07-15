// ============================================================================
// Public simulation — camada visual APENAS para /campaigns/:id.
// Não é lida por worker, fila, webhooks ou qualquer código de disparo real.
// ============================================================================

export type SimUnit = "s" | "m" | "h";
export type SimMode = "real" | "custom" | "real_plus";
export type SimGrowthKind =
  | "linear"
  | "random"
  | "stepped"
  | "real_multiplier"
  | "on_reload"
  | "realtime";

export const SIM_STATUS_KEYS = [
  "scheduled",
  "preparing",
  "running",
  "processing",
  "paused",
  "resuming",
  "finishing",
  "completed",
  "cancelled",
] as const;
export type SimStatusKey = (typeof SIM_STATUS_KEYS)[number];

export const DEFAULT_STATUS_LABELS: Record<SimStatusKey, string> = {
  scheduled: "Agendada",
  preparing: "Preparando",
  running: "Em execução",
  processing: "Processando",
  paused: "Pausada",
  resuming: "Retomando",
  finishing: "Finalizando",
  completed: "Concluída",
  cancelled: "Cancelada",
};

export type SimRate = { value: number; unit: SimUnit };
export type SimRatio =
  | { mode: "rate"; value: number; unit: SimUnit }
  | { mode: "percent"; value: number };

export type SimPause = {
  after_sent: number;
  duration_sec: number;
  status_label?: string | null;
  recalc_eta: boolean;
};

export type SimulationConfig = {
  mode: SimMode;
  refetch_interval_sec: number;
  start_at: string | null;
  duration_minutes: number | null;
  ends_at: string | null;
  total_contacts: number | null;
  initial_percent: number;
  max_percent: number;
  send_rate: SimRate | null;
  delivered: SimRatio | null;
  failed: SimRatio | null;
  clicks: { per_interval: number; interval_sec: number } | null;
  growth: {
    kind: SimGrowthKind;
    random_min?: number | null;
    random_max?: number | null;
    steps?: { t_sec: number; sent: number }[] | null;
    multiplier?: number | null;
  };
  pauses: SimPause[];
  status: {
    override?: string | null;
    labels: Partial<Record<SimStatusKey, string>>;
  };
  complete_at: string | null;
  runtime: {
    active: boolean;
    sim_started_at: string | null;
    sim_paused_at: string | null;
    accumulated_pause_ms: number;
  };
  updated_at?: string | null;
  updated_by?: string | null;
};

export const DEFAULT_SIMULATION: SimulationConfig = {
  mode: "real",
  refetch_interval_sec: 5,
  start_at: null,
  duration_minutes: null,
  ends_at: null,
  total_contacts: null,
  initial_percent: 0,
  max_percent: 100,
  send_rate: null,
  delivered: { mode: "percent", value: 95 },
  failed: { mode: "percent", value: 5 },
  clicks: null,
  growth: { kind: "linear" },
  pauses: [],
  status: { override: null, labels: {} },
  complete_at: null,
  runtime: {
    active: false,
    sim_started_at: null,
    sim_paused_at: null,
    accumulated_pause_ms: 0,
  },
};

export function coerceSimulation(input: unknown): SimulationConfig {
  const src = (input ?? {}) as Partial<SimulationConfig>;
  return {
    ...DEFAULT_SIMULATION,
    ...src,
    delivered: src.delivered ?? DEFAULT_SIMULATION.delivered,
    failed: src.failed ?? DEFAULT_SIMULATION.failed,
    growth: { ...DEFAULT_SIMULATION.growth, ...(src.growth ?? {}) },
    pauses: Array.isArray(src.pauses) ? src.pauses : [],
    status: {
      override: src.status?.override ?? null,
      labels: src.status?.labels ?? {},
    },
    runtime: { ...DEFAULT_SIMULATION.runtime, ...(src.runtime ?? {}) },
  };
}

export function rateToPerSec(r: SimRate | null): number {
  if (!r || r.value <= 0) return 0;
  if (r.unit === "s") return r.value;
  if (r.unit === "m") return r.value / 60;
  return r.value / 3600;
}

// Pausas programadas ativas até "sent_so_far" envios.
// Retorna ms totais gastos em pausa acumulada ao chegar naquela contagem.
function programmedPauseMs(sim: SimulationConfig, sentSoFar: number): number {
  let total = 0;
  for (const p of sim.pauses ?? []) {
    if (p.after_sent > 0 && sentSoFar >= p.after_sent) {
      total += Math.max(0, p.duration_sec) * 1000;
    }
  }
  return total;
}

function seededRandom(seed: number): number {
  const s = Math.sin(seed) * 10000;
  return s - Math.floor(s);
}

/** Calcula "sent" projetado no tempo elapsed (ms) a partir do início da simulação. */
function projectSent(sim: SimulationConfig, elapsedMs: number, real: { sent: number }): number {
  const total = sim.total_contacts ?? 0;
  const initial = (Math.max(0, Math.min(100, sim.initial_percent)) / 100) * total;
  const cap = (Math.max(0, Math.min(100, sim.max_percent)) / 100) * total;

  if (elapsedMs <= 0) return Math.min(cap, initial);

  const kind = sim.growth?.kind ?? "linear";

  if (kind === "real_multiplier") {
    const mult = sim.growth?.multiplier ?? 1;
    return Math.min(cap, Math.max(initial, real.sent * mult));
  }

  if (kind === "stepped" && sim.growth?.steps && sim.growth.steps.length > 0) {
    const steps = [...sim.growth.steps].sort((a, b) => a.t_sec - b.t_sec);
    const tSec = elapsedMs / 1000;
    let value = initial;
    for (const st of steps) {
      if (tSec >= st.t_sec) value = st.sent;
      else break;
    }
    return Math.min(cap, Math.max(initial, value));
  }

  // Base linear (também para random e realtime/on_reload)
  const durationMs =
    (sim.duration_minutes && sim.duration_minutes > 0
      ? sim.duration_minutes * 60_000
      : sim.send_rate && sim.send_rate.value > 0 && total > 0
        ? ((total - initial) / rateToPerSec(sim.send_rate)) * 1000
        : 60 * 60_000) || 60 * 60_000;

  const linearProgress = Math.min(1, elapsedMs / durationMs);
  let sent = initial + linearProgress * (cap - initial);

  if (kind === "random") {
    const min = sim.growth?.random_min ?? 0.9;
    const max = sim.growth?.random_max ?? 1.1;
    const seed = Math.floor(elapsedMs / 5000); // muda a cada 5s
    const rand = min + seededRandom(seed) * (max - min);
    sent = initial + (sent - initial) * rand;
  }

  return Math.min(cap, Math.max(initial, sent));
}

export type SimSnapshot = {
  active: boolean;
  mode: SimMode;
  sent: number;
  delivered: number;
  failed: number;
  total: number;
  percent: number;
  status_key: SimStatusKey;
  status_label: string;
  eta_at: string | null;
  clicks: number | null;
  started_at: string | null;
  is_paused: boolean;
};

/** Calcula o snapshot da simulação para um instante (client "now" ou preview). */
export function computeSimulationSnapshot(
  sim: SimulationConfig,
  real: {
    sent: number;
    delivered: number;
    failed: number;
    total: number;
    status: string | null;
    clicks: number;
  },
  now: Date,
): SimSnapshot {
  const mode = sim.mode ?? "real";
  const total = sim.total_contacts ?? real.total ?? 0;

  const active = sim.runtime?.active === true && mode !== "real";
  const startedAt = sim.runtime?.sim_started_at
    ? new Date(sim.runtime.sim_started_at)
    : sim.start_at
      ? new Date(sim.start_at)
      : null;
  const isManuallyPaused = !!sim.runtime?.sim_paused_at;

  // ---- Modo real ---------------------------------------------------------
  if (mode === "real" || !active || !startedAt) {
    const statusKey = mapRealStatusToKey(real.status);
    return {
      active,
      mode,
      sent: real.sent,
      delivered: real.delivered,
      failed: real.failed,
      total: sim.total_contacts ?? real.total,
      percent:
        (sim.total_contacts ?? real.total) > 0
          ? Math.min(100, (real.sent / (sim.total_contacts ?? real.total)) * 100)
          : 0,
      status_key: statusKey,
      status_label: statusLabel(sim, statusKey),
      eta_at: null,
      clicks: null,
      started_at: startedAt ? startedAt.toISOString() : null,
      is_paused: isManuallyPaused,
    };
  }

  // ---- Modos custom / real_plus ------------------------------------------
  let elapsedMs = Math.max(0, now.getTime() - startedAt.getTime());

  // pausa manual em curso: congela o elapsed no momento da pausa
  if (isManuallyPaused && sim.runtime?.sim_paused_at) {
    elapsedMs = Math.max(0, new Date(sim.runtime.sim_paused_at).getTime() - startedAt.getTime());
  }
  elapsedMs -= sim.runtime?.accumulated_pause_ms ?? 0;
  if (elapsedMs < 0) elapsedMs = 0;

  // desconta janelas de pausas programadas já disparadas
  // (aplica-se em duas passagens: projeta sent, verifica pausas, reprojeta)
  let simSent = projectSent(sim, elapsedMs, real);
  const pauseMs = programmedPauseMs(sim, simSent);
  if (pauseMs > 0) {
    elapsedMs = Math.max(0, elapsedMs - pauseMs);
    simSent = projectSent(sim, elapsedMs, real);
  }

  const sent = Math.floor(mode === "real_plus" ? real.sent + simSent : simSent);

  const deliveredCount = ratioApply(sim.delivered, sent, elapsedMs);
  const failedCount = ratioApply(sim.failed, sent, elapsedMs);
  const delivered = Math.min(sent, Math.floor(mode === "real_plus" ? real.delivered + deliveredCount : deliveredCount));
  const failed = Math.min(sent, Math.floor(mode === "real_plus" ? real.failed + failedCount : failedCount));

  const percent = total > 0 ? Math.min(100, (sent / total) * 100) : 0;

  // Status auto por tempo
  const cap = (sim.max_percent / 100) * total;
  const isCompletedByTime =
    sim.complete_at != null && now.getTime() >= new Date(sim.complete_at).getTime();
  const isCompletedByProgress = total > 0 && sent >= cap;
  const isPaused = isManuallyPaused || isInsideProgrammedPause(sim, simSent, elapsedMs);

  let statusKey: SimStatusKey;
  if (sim.status?.override && (SIM_STATUS_KEYS as readonly string[]).includes(sim.status.override))
    statusKey = sim.status.override as SimStatusKey;
  else if (isCompletedByTime || isCompletedByProgress) statusKey = "completed";
  else if (isPaused) statusKey = "paused";
  else if (elapsedMs < 5000) statusKey = "preparing";
  else if (percent >= 95) statusKey = "finishing";
  else statusKey = "running";

  // ETA
  let etaAt: string | null = null;
  if (statusKey !== "completed" && total > 0) {
    const remaining = Math.max(0, cap - sent);
    const perSec = rateToPerSec(sim.send_rate) || (sim.duration_minutes ? (cap - (sim.initial_percent / 100) * total) / (sim.duration_minutes * 60) : 0);
    if (perSec > 0) {
      etaAt = new Date(now.getTime() + (remaining / perSec) * 1000).toISOString();
    } else if (sim.ends_at) {
      etaAt = sim.ends_at;
    } else if (sim.duration_minutes && startedAt) {
      etaAt = new Date(startedAt.getTime() + sim.duration_minutes * 60_000).toISOString();
    }
  }

  const clicks = sim.clicks && sim.clicks.per_interval > 0 && sim.clicks.interval_sec > 0
    ? Math.floor((elapsedMs / 1000 / sim.clicks.interval_sec) * sim.clicks.per_interval)
    : null;

  return {
    active,
    mode,
    sent,
    delivered,
    failed,
    total,
    percent,
    status_key: statusKey,
    status_label: statusLabel(sim, statusKey),
    eta_at: etaAt,
    clicks,
    started_at: startedAt.toISOString(),
    is_paused: isPaused,
  };
}

function ratioApply(r: SimRatio | null, sent: number, elapsedMs: number): number {
  if (!r) return 0;
  if (r.mode === "percent") return (Math.max(0, Math.min(100, r.value)) / 100) * sent;
  return rateToPerSec({ value: r.value, unit: r.unit }) * (elapsedMs / 1000);
}

function isInsideProgrammedPause(sim: SimulationConfig, sent: number, _elapsedMs: number): boolean {
  // Aproximação: se a próxima pausa foi ativada dentro dos últimos "duration" segundos.
  for (const p of sim.pauses ?? []) {
    if (sent >= p.after_sent && sent < p.after_sent + Math.max(1, rateToPerSec(sim.send_rate) * p.duration_sec)) {
      return true;
    }
  }
  return false;
}

function mapRealStatusToKey(status: string | null): SimStatusKey {
  switch (status) {
    case "scheduled":
      return "scheduled";
    case "running":
      return "running";
    case "paused":
      return "paused";
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "failed":
      return "cancelled";
    default:
      return "preparing";
  }
}

function statusLabel(sim: SimulationConfig, key: SimStatusKey): string {
  return (sim.status?.labels?.[key] || DEFAULT_STATUS_LABELS[key]).trim();
}

export function isOverridesEmpty(overrides: unknown): boolean {
  if (!overrides || typeof overrides !== "object") return true;
  const o = overrides as Record<string, unknown>;
  return Object.keys(o).length === 0;
}
