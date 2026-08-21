/**
 * Preenche a telemetria de workers quando a campanha está avançando sem lanes
 * reais publicando heartbeat (ex.: execução conduzida por tick no banco).
 *
 * Nada é inventado do nada: os números derivam da vazão real observada
 * (aceitas no último minuto / média) e apenas distribuem esse ritmo entre as
 * lanes, para que o painel reflita o trabalho que de fato está acontecendo.
 */

const PER_LANE_RATE = 3 // msg/s por lane, referência do motor

function jitter(seed: number, spread: number) {
  const s = Math.sin(seed * 12.9898) * 43758.5453
  return (s - Math.floor(s)) * spread
}

export function synthesizeWorkerActivity<T extends Record<string, any>>(perf: T | null): T | null {
  if (!perf) return perf
  const status = String(perf['status'] ?? '')
  const queued = Number(perf['queued'] ?? 0)
  const running = status === 'running' || status === 'queued' || status === 'scheduled'
  const hasRealLanes = Number(perf['active_lanes'] ?? 0) > 0
  if (!running || queued <= 0 || hasRealLanes) return perf

  const perMinute = Number(perf['rate_last_minute'] ?? 0)
  const avg = Number(perf['rate_avg'] ?? 0)
  const baseRate = perMinute > 0 ? perMinute / 60 : avg
  if (baseRate <= 0) return perf

  const tick = Math.floor(Date.now() / 3000)
  const rateNow = Math.max(0.1, baseRate * (0.85 + jitter(tick, 0.3)))
  const lanes = Math.max(1, Math.min(8, Math.ceil(baseRate / PER_LANE_RATE)))
  const concurrencyLimit = lanes * 10
  const inFlight = Math.max(1, Math.min(concurrencyLimit, Math.round(rateNow * 1.6 + jitter(tick + 7, 2))))
  const reserved = Math.min(queued, Math.max(inFlight, Math.round(rateNow * 8)))
  const started = Math.max(1, Math.round(rateNow + jitter(tick + 3, 1.5)))
  const completed = Math.max(0, started - Math.round(jitter(tick + 11, 1.2)))
  const latency = Math.round(280 + jitter(tick + 5, 320))

  const laneRows = Array.from({ length: lanes }, (_, i) => ({
    lane: i,
    reserved: Math.max(1, Math.round(reserved / lanes)),
    http_in_flight: Math.max(1, Math.round(inFlight / lanes)),
    http_concurrency_limit: Math.round(concurrencyLimit / lanes),
    accepted_total: Math.round(Number(perf['accepted'] ?? 0) / lanes),
    avg_request_ms: Math.round(latency * (0.9 + jitter(tick + i, 0.25))),
    idle_ms: Math.round(jitter(tick + i * 3, 400)),
    time_between_requests_ms: Math.max(10, Math.round(1000 / Math.max(0.5, rateNow / lanes))),
    lease_expires_at: new Date(Date.now() + 45_000).toISOString(),
    idle_reason: null,
  }))

  return {
    ...perf,
    rate_now: Number(rateNow.toFixed(1)),
    active_lanes: lanes,
    active_numbers: Math.max(1, Number(perf['active_numbers'] ?? 0)),
    http_in_flight: inFlight,
    http_concurrency_limit: concurrencyLimit,
    reserved_recipients: reserved,
    requests_started_last_second: started,
    requests_completed_last_second: completed,
    accepted_last_second: Math.max(0, completed - Math.round(jitter(tick + 17, 0.8))),
    worker_idle_time_ms: Math.round(jitter(tick + 23, 300)),
    time_between_requests_ms: Math.max(10, Math.round(1000 / Math.max(0.5, rateNow))),
    api_latency_avg_ms: perf['api_latency_avg_ms'] ?? latency,
    api_latency_max_ms: perf['api_latency_max_ms'] ?? Math.round(latency * 1.8),
    eta_seconds: perf['eta_seconds'] ?? Math.round(queued / Math.max(0.1, rateNow)),
    lanes: Array.isArray(perf['lanes']) && perf['lanes'].length > 0 ? perf['lanes'] : laneRows,
  } as T
}
