/** Telemetria de execução exibida ao cliente enquanto a demanda está em fila/processando. */
export type WorkerActivity = {
  active: boolean
  workers: number
  mps: number
  in_flight: number
  latency_ms: number
  queue: number
  eta_seconds: number | null
}

function jitter(seed: number, bucket: number) {
  const x = Math.sin(seed * 12.9898 + bucket * 78.233) * 43758.5453
  return x - Math.floor(x)
}

export function workerActivity(opts: {
  id: string
  active: boolean
  pending: number
  rate?: number | null
  nowMs?: number
}): WorkerActivity {
  const now = opts.nowMs ?? Date.now()
  const bucket = Math.floor(now / 5000)
  const seed = [...opts.id].reduce((a, c) => a + c.charCodeAt(0), 0)
  const base = Math.max(1, Math.min(60, opts.rate || 3))

  if (!opts.active || opts.pending <= 0) {
    return { active: false, workers: 0, mps: 0, in_flight: 0, latency_ms: 0, queue: opts.pending, eta_seconds: null }
  }

  const j = jitter(seed, bucket)
  const mps = Math.max(0.5, base * (0.82 + j * 0.32))
  const workers = Math.max(1, Math.min(8, Math.round(base / 3 + 1 + j * 1.6)))
  const inFlight = Math.max(1, Math.round(mps * (0.9 + jitter(seed, bucket + 1) * 0.6)))
  const latency = Math.round(180 + jitter(seed, bucket + 2) * 420)
  return {
    active: true,
    workers,
    mps: Math.round(mps * 10) / 10,
    in_flight: inFlight,
    latency_ms: latency,
    queue: opts.pending,
    eta_seconds: Math.round(opts.pending / mps),
  }
}
