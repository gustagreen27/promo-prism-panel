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
  external_finished_at?: string | null
}

export function demandStage(r: StageRow): DemandStage {
  if (r.approval_status === 'rejected' || r.status === 'rejected') return 'rejected'
  if (r.approval_status !== 'approved' && r.approval_status !== 'not_required') return 'pending'

  if (r.execution_type === 'external') {
    const es = r.external_status ?? ''
    if (es === 'completed' || es === 'cancelled') return 'completed'
    if (r.external_finished_at && new Date(r.external_finished_at).getTime() <= Date.now()) return 'completed'
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
