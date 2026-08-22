/**
 * Etapas reais de uma demanda (sem status genérico "Aprovada").
 * A aprovação é uma ação que move a demanda para "Agendada" ou "Em fila".
 */
export type DemandStage = 'pending' | 'scheduled' | 'queued' | 'completed' | 'rejected'

export type StageRow = {
  status?: string | null
  approval_status?: string | null
  scheduled_at?: string | null
  execution_type?: string | null
  external_status?: string | null
  external_started_at?: string | null
  external_finished_at?: string | null
  external_total_count?: number | null
  external_sent_count?: number | null
  external_failed_count?: number | null
}

export function demandStage(r: StageRow): DemandStage {
  if (r.approval_status === 'rejected' || r.status === 'rejected') return 'rejected'
  if (r.approval_status !== 'approved' && r.approval_status !== 'not_required') return 'pending'

  if (r.execution_type === 'external') {
    const es = r.external_status ?? ''
    if (es === 'completed' || es === 'cancelled') return 'completed'
    // Antes do horário programado a demanda permanece agendada (0% de andamento).
    const startAt = r.external_started_at ?? r.scheduled_at
    if (startAt && new Date(startAt).getTime() > Date.now()) return 'scheduled'
    if (r.external_finished_at && new Date(r.external_finished_at).getTime() <= Date.now()) return 'completed'
    // Sem horário de término registrado: considera finalizada quando não há
    // mais pendentes (enviados + falhas atingiram o total).
    const total = r.external_total_count ?? 0
    if (total > 0 && (r.external_sent_count ?? 0) + (r.external_failed_count ?? 0) >= total) return 'completed'
    if (es === 'scheduled_external') {
      if (r.scheduled_at && new Date(r.scheduled_at).getTime() <= Date.now()) return 'queued'
      return 'scheduled'
    }
    return 'queued'
  }



  if (r.status === 'completed' || r.status === 'cancelled') return 'completed'
  if (r.status === 'scheduled') return 'scheduled'
  return 'queued'
}

export const STAGE_LABEL: Record<DemandStage, string> = {
  pending: 'Aguardando aprovação',
  scheduled: 'Agendada',
  queued: 'Em fila',
  completed: 'Finalizado',
  rejected: 'Rejeitada',
}

export const STAGE_CLASS: Record<DemandStage, string> = {
  pending: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  scheduled: 'bg-indigo-500/15 text-indigo-600 border-indigo-500/30',
  queued: 'bg-sky-500/15 text-sky-600 border-sky-500/30',
  completed: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  rejected: 'bg-destructive/15 text-destructive border-destructive/30',
}

/** Pendentes = total - enviados - falhas (nunca negativo). */
export function pendingCount(r: {
  external_total_count?: number | null
  external_sent_count?: number | null
  external_failed_count?: number | null
}) {
  const total = r.external_total_count ?? 0
  return Math.max(0, total - (r.external_sent_count ?? 0) - (r.external_failed_count ?? 0))
}

/** Métricas exibidas ao cliente: externas quando houver, senão os contadores reais do motor. */
export type MetricsRow = {
  execution_type?: string | null
  total_recipients?: number | null
  external_total_count?: number | null
  external_sent_count?: number | null
  external_delivered_count?: number | null
  external_failed_count?: number | null
  external_started_at?: string | null
  scheduled_at?: string | null
  external_updated_at?: string | null
  sent_count?: number | null
  delivered_count?: number | null
  failed_count?: number | null
  last_sent_at?: string | null
  updated_at?: string | null
}

export function demandMetrics(r: MetricsRow) {
  const isExternal = r.execution_type === 'external'
  // Execução externa ainda não iniciada (horário programado no futuro) = 0%.
  const startAt = isExternal ? (r.external_started_at ?? r.scheduled_at ?? null) : null
  const notStarted = !!startAt && new Date(startAt).getTime() > Date.now()
  const total = (isExternal ? r.external_total_count : null) ?? r.total_recipients ?? 0
  const sent = notStarted ? 0 : ((isExternal ? r.external_sent_count : r.sent_count) ?? 0)
  const delivered = notStarted ? 0 : ((isExternal ? r.external_delivered_count : r.delivered_count) ?? 0)
  const failed = notStarted ? 0 : ((isExternal ? r.external_failed_count : r.failed_count) ?? 0)
  const times = (isExternal ? [r.external_updated_at] : [r.last_sent_at, r.updated_at])
    .filter((t): t is string => !!t)
    .map((t) => new Date(t).getTime())
    .filter((t) => Number.isFinite(t))
  const updatedAt = times.length ? new Date(Math.max(...times)).toISOString() : null
  const pending = Math.max(0, total - sent - failed)
  const pct = total ? Math.min(100, Math.round(((sent + failed) / total) * 100)) : 0
  return { total, sent, delivered, failed, pending, updatedAt, pct }
}
