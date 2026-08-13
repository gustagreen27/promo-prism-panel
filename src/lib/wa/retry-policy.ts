/**
 * RetryPolicy — política única de reenvio do motor de disparos.
 * Backoff exponencial com jitter e teto de tentativas.
 * Progressão base: 2s → 5s → 15s → 45s → 120s.
 */

export const MAX_ATTEMPTS = 5;

const BACKOFF_LADDER_MS = [2_000, 5_000, 15_000, 45_000, 120_000];
const JITTER_RATIO = 0.25;

export type RetryDecision = {
  shouldRetry: boolean;
  attempts: number;
  delayMs: number;
  nextAttemptAt: string | null;
  reason: string;
  deadLetter: boolean;
};

export function backoffMs(attempts: number): number {
  const idx = Math.min(Math.max(attempts, 1), BACKOFF_LADDER_MS.length) - 1;
  const base = BACKOFF_LADDER_MS[idx]!;
  const jitter = (Math.random() * 2 - 1) * base * JITTER_RATIO;
  return Math.max(500, Math.floor(base + jitter));
}

export function decideRetry(params: {
  retryable: boolean;
  attempts: number;
  reason: string;
  maxAttempts?: number;
  now?: number;
}): RetryDecision {
  const max = params.maxAttempts ?? MAX_ATTEMPTS;
  const now = params.now ?? Date.now();
  if (!params.retryable) {
    return {
      shouldRetry: false,
      attempts: params.attempts,
      delayMs: 0,
      nextAttemptAt: null,
      reason: params.reason,
      deadLetter: false,
    };
  }
  if (params.attempts >= max) {
    return {
      shouldRetry: false,
      attempts: params.attempts,
      delayMs: 0,
      nextAttemptAt: null,
      reason: params.reason,
      deadLetter: true,
    };
  }
  const delayMs = backoffMs(params.attempts);
  return {
    shouldRetry: true,
    attempts: params.attempts,
    delayMs,
    nextAttemptAt: new Date(now + delayMs).toISOString(),
    reason: params.reason,
    deadLetter: false,
  };
}
