// Camada de apresentação — não gera cliques reais, não altera tracking.
// Compõe cliques públicos a partir do total público de entregues, e distribui
// esse total entre categorias personalizadas por percentual.

export type GeneratorCity = { label: string; percent: number; country?: string | null };
export type GeneratorCountry = { label: string; percent: number };

export type ClicksGeneratorConfig = {
  enabled?: boolean;
  initial?: number;
  rate?: number; // 0..100
  min_pct?: number | null;
  max_pct?: number | null;
  max_clicks?: number | null;
  refresh_interval_sec?: number;
  growth?: "linear" | "random";
  use_source?: "real" | "public";
  replace_or_add?: "replace" | "add";
  // Listas manuais opcionais (sobrescrevem os defaults e os overrides).
  cities?: GeneratorCity[];
  countries?: GeneratorCountry[];
  // Distribui primeiro por país e depois por cidade dentro do país.
  hierarchical?: boolean;
};

// PRNG determinístico (mulberry32).
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Cliques cumulativos a partir dos entregues. Monotônico por construção:
// para cada balde de 100 entregues, aplica uma taxa aleatória em [min,max].
// Se growth === "linear", usa a taxa média.
export function computeGeneratedClicks(
  delivered: number,
  cfg: ClicksGeneratorConfig,
  campaignSeed: number,
): number {
  const rate = Math.max(0, cfg.rate ?? 0);
  const minPct = cfg.min_pct != null ? Math.max(0, cfg.min_pct) : rate;
  const maxPct = cfg.max_pct != null ? Math.max(minPct, cfg.max_pct) : rate;
  const initial = Math.max(0, cfg.initial ?? 0);
  const growth = cfg.growth ?? "random";
  const bucketSize = 100;

  const d = Math.max(0, Math.floor(delivered));
  if (d === 0) {
    const base = initial;
    return capAndDeliverBound(base, d, cfg);
  }

  const buckets = Math.floor(d / bucketSize);
  const remainder = d - buckets * bucketSize;
  const rnd = mulberry32(campaignSeed >>> 0);
  let clicks = initial;
  const avg = (minPct + maxPct) / 2;
  for (let i = 0; i < buckets; i++) {
    const r = growth === "linear" ? avg : minPct + (maxPct - minPct) * rnd();
    clicks += (bucketSize * r) / 100;
  }
  if (remainder > 0) {
    const r =
      growth === "linear"
        ? avg
        : minPct + (maxPct - minPct) * rnd();
    clicks += (remainder * r) / 100;
  }
  return capAndDeliverBound(Math.round(clicks), d, cfg);
}

function capAndDeliverBound(
  raw: number,
  delivered: number,
  cfg: ClicksGeneratorConfig,
): number {
  let v = Math.max(0, raw);
  if (cfg.max_clicks != null) v = Math.min(v, Math.max(0, cfg.max_clicks));
  // Nunca ultrapassar entregues (o total configurado, se maior, prevalece só via max_clicks).
  v = Math.min(v, delivered + Math.max(0, cfg.initial ?? 0));
  return v;
}

// Hash simples de string (ex: campaignId) → number.
export function seedFromString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// Distribui um total entre linhas com "percent". Retorna lista mantendo a
// ordem original. Se percent ausente, distribui proporcional aos "count".
// Compensa arredondamento (largest remainder) para somar exatamente = total.
export function distributeByPercent(
  rows: { label: string; count: number; percent?: number | null }[],
  total: number,
): { label: string; count: number }[] {
  if (rows.length === 0 || total <= 0)
    return rows.map((r) => ({ label: r.label, count: 0 }));

  const usePct = rows.some((r) => r.percent != null && r.percent > 0);
  const weights = rows.map((r) => {
    if (usePct) return Math.max(0, r.percent ?? 0);
    return Math.max(0, r.count);
  });
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW === 0) return rows.map((r) => ({ label: r.label, count: 0 }));

  const raw = weights.map((w) => (w / sumW) * total);
  const floors = raw.map((v) => Math.floor(v));
  let assigned = floors.reduce((a, b) => a + b, 0);
  const remainders = raw.map((v, i) => ({ i, frac: v - floors[i] }));
  remainders.sort((a, b) => b.frac - a.frac);
  let idx = 0;
  while (assigned < total && idx < remainders.length) {
    floors[remainders[idx].i] += 1;
    assigned += 1;
    idx += 1;
  }
  return rows.map((r, i) => ({ label: r.label, count: floors[i] }));
}

// Escala uma série ao longo do tempo proporcional para totalizar = target.
export function scaleSeries<T extends { count: number }>(
  series: T[],
  target: number,
): T[] {
  const sum = series.reduce((a, b) => a + b.count, 0);
  if (sum === 0 || target <= 0) {
    if (series.length === 0) return series;
    // Se sem sinal, concentra tudo no último ponto.
    return series.map((s, i) => ({
      ...s,
      count: i === series.length - 1 ? target : 0,
    }));
  }
  const raw = series.map((s) => (s.count / sum) * target);
  const floors = raw.map((v) => Math.floor(v));
  let assigned = floors.reduce((a, b) => a + b, 0);
  const remainders = raw
    .map((v, i) => ({ i, frac: v - floors[i] }))
    .sort((a, b) => b.frac - a.frac);
  let idx = 0;
  while (assigned < target && idx < remainders.length) {
    floors[remainders[idx].i] += 1;
    assigned += 1;
    idx += 1;
  }
  return series.map((s, i) => ({ ...s, count: floors[i] }));
}

export function etaToMax(
  currentDelivered: number,
  cfg: ClicksGeneratorConfig,
  deliveredRatePerSec: number,
): { deliveredNeeded: number; secondsToReach: number } | null {
  if (!cfg.max_clicks || cfg.max_clicks <= 0) return null;
  const avgRate = Math.max(
    0.0001,
    (((cfg.min_pct ?? cfg.rate ?? 0) + (cfg.max_pct ?? cfg.rate ?? 0)) / 2) / 100,
  );
  const targetClicks = cfg.max_clicks - Math.max(0, cfg.initial ?? 0);
  if (targetClicks <= 0) return { deliveredNeeded: 0, secondsToReach: 0 };
  const deliveredNeeded = Math.ceil(targetClicks / avgRate);
  const remaining = Math.max(0, deliveredNeeded - currentDelivered);
  const seconds =
    deliveredRatePerSec > 0 ? Math.ceil(remaining / deliveredRatePerSec) : Infinity;
  return { deliveredNeeded, secondsToReach: seconds };
}
