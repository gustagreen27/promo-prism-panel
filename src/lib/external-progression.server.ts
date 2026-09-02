import { externalProgressPatch } from './external-progression'

/**
 * Aplica a progressão automática (janelas de 3 min) das execuções externas
 * nas linhas carregadas, persistindo o resultado. Mutação in-place para que a
 * resposta já saia com os números atualizados.
 */
export async function applyExternalProgression(supabase: any, rows: any[]) {
  const now = new Date()
  const targets = rows.filter(
    (r) =>
      r.execution_type === 'external' &&
      r.external_status !== 'cancelled' &&
      r.external_started_at &&
      r.external_finished_at,
  )
  await Promise.all(
    targets.map(async (r) => {
      // Já finalizada e com métricas finais aplicadas: nada a fazer.
      const patch = externalProgressPatch(r, now)
      if (!patch) return
      const { error } = await supabase.from('wa_campaigns').update(patch).eq('id', r.id)
      if (error) {
        console.error('[external-progression] update failed', r.id, error.message)
        return
      }
      Object.assign(r, patch)
    }),
  )
  return rows
}
