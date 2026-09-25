import { z } from "zod";

// Ritmo de envio (Direct Send): mensagens por ciclo, intervalo entre mensagens
// e pausa entre ciclos — todos sorteados dentro de faixas. Tempos em segundos.
export type PacingConfig = {
  msgs_min: number;
  msgs_max: number;
  interval_min_s: number;
  interval_max_s: number;
  pause_min_s: number;
  pause_max_s: number;
};

export type PacingState = {
  cycle: number;
  cycle_target: number;
  cycle_sent: number;
  total_sent: number;
  last_interval_s: number | null;
  last_pause_s: number | null;
  phase: "sending" | "pause";
  last_send_at: string | null;
};

export const PACING_LIMITS = {
  msgs: { min: 1, max: 1000 },
  interval: { min: 1, max: 3600 },
  pause: { min: 0, max: 86400 },
};

export const pacingConfigSchema = z.object({
  msgs_min: z.number().int(),
  msgs_max: z.number().int(),
  interval_min_s: z.number().int(),
  interval_max_s: z.number().int(),
  pause_min_s: z.number().int(),
  pause_max_s: z.number().int(),
});

export function validatePacing(c: PacingConfig): string[] {
  const e: string[] = [];
  const L = PACING_LIMITS;
  const nums = Object.values(c);
  if (nums.some((n) => !Number.isFinite(n) || !Number.isInteger(n))) return ["Ritmo: use apenas números inteiros."];
  if (c.msgs_min < L.msgs.min || c.msgs_max > L.msgs.max) e.push(`Mensagens por ciclo: entre ${L.msgs.min} e ${L.msgs.max}.`);
  if (c.msgs_min > c.msgs_max) e.push("Mensagens por ciclo: o mínimo não pode ser maior que o máximo.");
  if (c.interval_min_s < L.interval.min || c.interval_max_s > L.interval.max) e.push(`Intervalo: entre ${L.interval.min}s e ${L.interval.max}s.`);
  if (c.interval_min_s > c.interval_max_s) e.push("Intervalo: o mínimo não pode ser maior que o máximo.");
  if (c.pause_min_s < L.pause.min || c.pause_max_s > L.pause.max) e.push(`Pausa entre ciclos: entre 0 e ${L.pause.max / 3600}h.`);
  if (c.pause_min_s > c.pause_max_s) e.push("Pausa: o mínimo não pode ser maior que o máximo.");
  return e;
}

export function randInt(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

export function initialPacingState(c: PacingConfig): PacingState {
  return { cycle: 1, cycle_target: randInt(c.msgs_min, c.msgs_max), cycle_sent: 0, total_sent: 0, last_interval_s: null, last_pause_s: null, phase: "sending", last_send_at: null };
}

/** Avança o estado após um envio e sorteia o próximo intervalo ou a pausa do ciclo. */
export function advancePacing(c: PacingConfig, s: PacingState, nowMs: number): { state: PacingState; waitS: number; kind: "interval" | "pause" } {
  const next: PacingState = { ...s, cycle_sent: s.cycle_sent + 1, total_sent: s.total_sent + 1, last_send_at: new Date(nowMs).toISOString() };
  if (next.cycle_sent >= next.cycle_target) {
    const pause = randInt(c.pause_min_s, c.pause_max_s);
    return {
      state: { ...next, cycle: s.cycle + 1, cycle_target: randInt(c.msgs_min, c.msgs_max), cycle_sent: 0, last_pause_s: pause, phase: "pause" },
      waitS: pause,
      kind: "pause",
    };
  }
  const interval = randInt(c.interval_min_s, c.interval_max_s);
  return { state: { ...next, last_interval_s: interval, phase: "sending" }, waitS: interval, kind: "interval" };
}
