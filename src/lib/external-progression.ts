/**
 * Progressão automática de métricas para execuções externas.
 *
 * O admin configura uma única vez: total, valores finais (enviados, entregues,
 * falhas), início e horário previsto de finalização. A partir daí o sistema
 * calcula de forma determinística — em janelas de 1 minuto — como as métricas
 * evoluem entre o início e o fim, com variação natural (nada de números redondos
 * nem interpolação linear).
 *
 * Determinístico: a mesma demanda no mesmo segundo sempre produz o mesmo número,
 * então o valor calculado na leitura e o valor persistido pelo cron coincidem.
 */

export const EXTERNAL_TICK_MS = 60 * 1000

/**
 * Tamanho da janela de atualização: 1 min por padrão, mas em períodos curtos
 * (ex.: 10 mil disparos em 1 hora) as janelas encolhem para que a progressão
 * seja distribuída ao longo de todo o prazo configurado.
 */
export function tickMsFor(startMs: number, finishMs: number): number {
  const duration = Math.max(1, finishMs - startMs)
  return Math.max(30_000, Math.min(EXTERNAL_TICK_MS, Math.ceil(duration / 12)))
}

export type ExternalTargets = {
  id: string
  external_total_count?: number | null
  external_target_sent_count?: number | null
  external_target_delivered_count?: number | null
  external_target_failed_count?: number | null
  external_started_at?: string | null
  external_finished_at?: string | null
}

export type ExternalSnapshot = {
  sent: number
  delivered: number
  failed: number
  pending: number
  /** Início da janela de 1 min a que este snapshot corresponde. */
  updatedAt: string
  /** Próxima atualização prevista (null quando já finalizou). */
  nextAt: string | null
  finished: boolean
  /** false enquanto o horário agendado ainda não chegou (demanda em fila). */
  started: boolean
}

/** PRNG determinístico (0..1) a partir de uma string. */
function rand(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  h ^= h >>> 13
  h = Math.imul(h, 0x5bd1e995)
  h ^= h >>> 15
  return ((h >>> 0) % 100000) / 100000
}

/**
 * Curva cumulativa de progresso com passos irregulares.
 * Retorna array de tamanho buckets+1 começando em 0 e terminando em 1.
 */
function progressCurve(id: string, buckets: number): number[] {
  const weights: number[] = []
  let sum = 0
  for (let k = 0; k < buckets; k++) {
    // Passos entre 0.55x e 1.45x da média → variação natural entre janelas.
    const w = 0.55 + rand(`${id}:w:${k}`) * 0.9
    weights.push(w)
    sum += w
  }
  const cum = [0]
  let acc = 0
  for (const w of weights) {
    acc += w / sum
    cum.push(Math.min(1, acc))
  }
  cum[cum.length - 1] = 1
  return cum
}

function clampInt(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(v)))
}

/**
 * Calcula o snapshot atual das métricas de uma execução externa.
 * Retorna null quando a demanda não tem configuração suficiente (início/fim/alvos).
 */
export function simulateExternal(row: ExternalTargets, now: Date = new Date()): ExternalSnapshot | null {
  const startIso = row.external_started_at
  const finishIso = row.external_finished_at
  if (!startIso || !finishIso) return null

  const start = new Date(startIso).getTime()
  const finish = new Date(finishIso).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(finish) || finish <= start) return null

  const total = row.external_total_count ?? 0
  const tSent = Math.max(0, row.external_target_sent_count ?? 0)
  const tFailed = Math.max(0, row.external_target_failed_count ?? 0)
  const tDelivered = Math.min(tSent, Math.max(0, row.external_target_delivered_count ?? 0))

  const t = now.getTime()

  // Antes do horário agendado a demanda fica em fila: 0% de andamento.
  if (t < start) {
    return {
      sent: 0,
      delivered: 0,
      failed: 0,
      pending: total,
      updatedAt: new Date(start).toISOString(),
      nextAt: new Date(start).toISOString(),
      finished: false,
      started: false,
    }
  }

  const finishedNow = t >= finish

  // Valores finais exatos assim que atinge o horário previsto.
  if (finishedNow) {
    return {
      sent: tSent,
      delivered: tDelivered,
      failed: tFailed,
      pending: 0,
      updatedAt: new Date(finish).toISOString(),
      nextAt: null,
      finished: true,
      started: true,
    }
  }


  const tick = tickMsFor(start, finish)
  const buckets = Math.max(1, Math.ceil((finish - start) / tick))
  const curve = progressCurve(row.id, buckets)

  // Janela atual desde o início (antes do início: primeira janela).
  const k = Math.max(0, Math.min(buckets - 1, Math.floor((t - start) / tick)))
  const windowStart = start + k * tick
  const nextTick = Math.min(finish, windowStart + tick)

  // Interpolação suave dentro da janela: os números "vão marcando" em vez de
  // pularem só no próximo tick. A curva preserva a variação natural entre
  // janelas; dentro de cada uma usamos progressão linear.
  const alpha = nextTick === windowStart ? 1 : Math.max(0, Math.min(1, (t - windowStart) / (nextTick - windowStart)))
  const prev = curve[k] ?? 0
  const next = curve[k + 1] ?? 1
  const current = prev + alpha * (next - prev)

  const pSent = current
  // Entregas ficam ~uma janela atrás do processamento.
  const pDelivered = k === 0 ? current * 0.62 : prev + (current - prev) * 0.35
  // Falhas evoluem com ritmo próprio, próximo ao dos envios.
  const pFailed = Math.min(1, current * (0.85 + rand(`${row.id}:f:${k}`) * 0.25))

  const sent = clampInt(tSent * pSent, 0, tSent)
  const failed = clampInt(tFailed * pFailed, 0, tFailed)
  const delivered = clampInt(tDelivered * pDelivered, 0, Math.min(tDelivered, sent))
  const processed = sent + failed
  const pending = total > 0 ? Math.max(0, total - processed) : 0

  return {
    sent,
    delivered,
    failed,
    pending,
    updatedAt: new Date(t).toISOString(),
    nextAt: new Date(nextTick).toISOString(),
    finished: false,
    started: true,
  }
}

/**
 * Aplica o snapshot na linha (sem regredir métricas já gravadas).
 * Retorna o patch a persistir, ou null quando nada muda.
 */
export function externalProgressPatch(
  row: ExternalTargets & {
    external_sent_count?: number | null
    external_delivered_count?: number | null
    external_failed_count?: number | null
    external_status?: string | null
  },
  now: Date = new Date(),
): Record<string, any> | null {
  const snap = simulateExternal(row, now)
  if (!snap) return null
  // Ainda em fila: nada a persistir, mantém 0% até o horário agendado.
  if (!snap.started) return null

  const sent = Math.max(snap.sent, row.external_sent_count ?? 0)
  const delivered = Math.min(sent, Math.max(snap.delivered, row.external_delivered_count ?? 0))
  const failed = Math.max(snap.failed, row.external_failed_count ?? 0)

  const patch: Record<string, any> = {
    external_sent_count: sent,
    external_delivered_count: delivered,
    external_failed_count: failed,
    external_updated_at: snap.updatedAt,
    metrics_source: 'estimated_external',
  }
  if (snap.finished) {
    patch['external_sent_count'] = snap.sent
    patch['external_delivered_count'] = snap.delivered
    patch['external_failed_count'] = snap.failed
    patch['external_status'] = 'completed'
  } else if (row.external_status === 'scheduled_external') {
    patch['external_status'] = 'in_progress'
  }

  const unchanged =
    (row.external_sent_count ?? null) === patch['external_sent_count'] &&
    (row.external_delivered_count ?? null) === patch['external_delivered_count'] &&
    (row.external_failed_count ?? null) === patch['external_failed_count'] &&
    (!patch['external_status'] || patch['external_status'] === row.external_status)
  return unchanged ? null : patch
}
