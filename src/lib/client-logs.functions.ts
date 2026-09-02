// Logs de envio (nível mensagem) da demanda para o painel do cliente.
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import type { SimLogRow } from './dispatch-log-sim'

export type CampaignLogRow = SimLogRow & { simulated: boolean }

export const getMyCampaignLogs = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; limit?: number }) =>
    z.object({ id: z.string().uuid(), limit: z.number().int().min(1).max(10000).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    const limit = data.limit ?? 200

    const { data: campaign, error } = await supabase
      .from('wa_campaigns')
      .select(
        'id,workspace_id,list_id,execution_type,external_status,external_total_count,external_sent_count,external_delivered_count,external_failed_count,external_started_at,external_finished_at,total_recipients,sent_count,delivered_count,read_count,replied_count,failed_count,started_at,scheduled_at,last_sent_at,updated_at',
      )
      .eq('id', data.id)
      .maybeSingle()
    if (error) throw error
    if (!campaign) throw new Error('Demanda não encontrada')

    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('workspace_id', campaign.workspace_id)
      .eq('user_id', userId)
      .maybeSingle()
    if (!member) throw new Error('Sem permissão para ver esta demanda')

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

    // 1) Envio real pela plataforma: logs verdadeiros dos destinatários.
    //    Execução externa nunca tem logs reais — os destinatários ficam todos
    //    'pending' no banco, então pulamos direto para a reconstrução simulada.
    const isExternal = campaign.execution_type === 'external'
    const { data: real } = isExternal
      ? { data: null as any[] | null }
      : await supabaseAdmin
          .from('campaign_recipients')
          .select('phone,status,meta_message_id,sent_at,delivered_at,read_at,replied_at,failed_at,error_code,failed_reason')
          .eq('campaign_id', data.id)
          .not('sent_at', 'is', null)
          .order('sent_at', { ascending: true, nullsFirst: false })
          .limit(limit)

    if (real && real.length > 0) {
      const rows: CampaignLogRow[] = (real as any[]).map((r) => ({
        phone: r.phone,
        status: r.status,
        wamid: r.meta_message_id ?? null,
        sent_at: r.sent_at ?? null,
        delivered_at: r.delivered_at ?? null,
        read_at: r.read_at ?? null,
        replied_at: r.replied_at ?? null,
        failed_at: r.failed_at ?? null,
        error_code: r.error_code ?? null,
        error_reason: r.failed_reason ?? null,
        simulated: false,
      }))
      return { rows, simulated: false, total: campaign.total_recipients ?? rows.length }
    }

    // 2) Execução externa: reconstrói os logs a partir da base e dos totais finais.
    const { buildSimulatedLogs } = await import('./dispatch-log-sim')
    const { demandMetrics } = await import('./demand-stage')
    const metrics = demandMetrics(campaign as any)

    let phones: string[] = []
    if (campaign.list_id) {
      const { data: items } = await supabaseAdmin
        .from('contact_list_items')
        .select('contacts(phone)')
        .eq('list_id', campaign.list_id)
        .limit(limit)
      phones = ((items ?? []) as any[]).map((i) => i.contacts?.phone).filter(Boolean)
    }
    if (phones.length === 0) return { rows: [], simulated: true, total: metrics.total ?? 0 }

    const startIso = campaign.external_started_at ?? campaign.started_at ?? campaign.scheduled_at
    const finishIso = campaign.external_finished_at ?? campaign.last_sent_at ?? campaign.updated_at
    const startMs = startIso ? new Date(startIso).getTime() : Date.now() - 3_600_000
    const finishMs = finishIso ? new Date(finishIso).getTime() : startMs + 3_600_000

    const rows = buildSimulatedLogs({
      campaignId: campaign.id,
      phones,
      totals: {
        sent: metrics.sent ?? 0,
        delivered: metrics.delivered ?? 0,
        read: metrics.read ?? 0,
        replied: metrics.replied ?? 0,
        failed: metrics.failed ?? 0,
      },
      startMs,
      finishMs,
    }).map((r) => ({ ...r, simulated: true }))

    return { rows, simulated: true, total: metrics.total ?? rows.length }
  })
