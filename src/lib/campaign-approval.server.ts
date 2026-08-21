/**
 * Guarda de aprovação: nenhum disparo real pode começar enquanto a demanda
 * não for aprovada por um admin na fila de aprovação.
 */
export const BLOCKED_APPROVAL_STATUSES = ['pending', 'rejected'] as const

export async function assertCampaignApproved(
  supabase: any,
  campaignId: string,
  opts?: { userId?: string | null },
) {
  // Admin/staff não passa pela fila: a trava existe apenas para clientes.
  if (opts?.userId) {
    const { data: isStaff } = await supabase.rpc('is_internal_staff', { _user: opts.userId })
    if (isStaff === true) {
      await supabase
        .from('wa_campaigns')
        .update({ approval_status: 'approved', approved_by: opts.userId, approved_at: new Date().toISOString() })
        .eq('id', campaignId)
        .in('approval_status', ['pending', 'rejected'])
      return
    }
  }

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

