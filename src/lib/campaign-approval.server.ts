/**
 * Guarda de aprovação: nenhum disparo real pode começar enquanto a demanda
 * não for aprovada por um admin na fila de aprovação.
 */
export const BLOCKED_APPROVAL_STATUSES = ['pending', 'rejected'] as const

export async function assertCampaignApproved(supabase: any, campaignId: string) {
  const { data } = await supabase
    .from('wa_campaigns')
    .select('approval_status, rejection_reason')
    .eq('id', campaignId)
    .maybeSingle()
  const st = data?.approval_status as string | null | undefined
  if (st === 'rejected') {
    throw new Error(
      `⛔ Demanda rejeitada pelo admin${data?.rejection_reason ? `: ${data.rejection_reason}` : ''}. Disparo bloqueado.`,
    )
  }
  if (st === 'pending') {
    throw new Error(
      '⛔ Demanda aguardando aprovação. Aprove em Admin › Aprovação de disparos antes de enviar.',
    )
  }
}
