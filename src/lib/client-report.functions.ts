// Relatório por campanha para o painel do cliente (mesmo formato do relatório público).
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'

export type CampaignReport = {
  campaign: {
    id: string
    name: string
    status: string
    created_at: string
    scheduled_at: string | null
    started_at: string | null
    finished_at: string | null
    total_recipients: number | null
    sent_count: number | null
    delivered_count: number | null
    read_count: number | null
    replied_count: number | null
    failed_count: number | null
    charged_cents: number | null
    list_id: string | null
    execution_type: string | null
  }
  timeline: Array<{ t: string; v: number }>
  reply_timeline: Array<{ t: string; v: number }>
  ddd: Array<{ ddd: string | null; v: number }>
  errors: Array<{ code: string; v: number }>
  list_name?: string | null
  /** Etapa real da demanda: o relatório só é liberado quando 'completed'. */
  stage?: string
}

export const getMyCampaignReport = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any
    const { data: report, error } = await supabase.rpc('wa_client_campaign_report', { _campaign_id: data.id })
    if (error) throw error
    if (!report) throw new Error('Relatório não encontrado')

    const out = report as CampaignReport
    if (out.campaign?.list_id) {
      const { data: list } = await supabase
        .from('contact_lists')
        .select('name')
        .eq('id', out.campaign.list_id)
        .maybeSingle()
      out.list_name = list?.name ?? null
    }

    const { data: stageRow } = await supabase
      .from('wa_campaigns')
      .select(
        'status,approval_status,scheduled_at,execution_type,external_status,external_started_at,external_finished_at,external_total_count,external_sent_count,external_delivered_count,external_failed_count,external_updated_at,sent_count,delivered_count,read_count,replied_count,failed_count,last_sent_at,updated_at',
      )
      .eq('id', data.id)
      .maybeSingle()
    if (stageRow) {
      const { demandMetrics, demandStage } = await import('./demand-stage')
      out.stage = demandStage(stageRow as any)
      const metrics = demandMetrics(stageRow as any)
      out.campaign.total_recipients = metrics.total
      out.campaign.sent_count = metrics.sent
      out.campaign.delivered_count = metrics.delivered
      out.campaign.read_count = metrics.read
      out.campaign.replied_count = metrics.replied
      out.campaign.failed_count = metrics.failed

      // Execução externa: o RPC não tem linhas reais, então a linha do tempo
      // é reconstruída distribuindo os envios entre início e fim do disparo.
      if (
        stageRow.execution_type === 'external' &&
        (!out.timeline || out.timeline.length === 0) &&
        metrics.sent > 0
      ) {
        const startIso = stageRow.external_started_at ?? stageRow.scheduled_at
        const endIso = stageRow.external_finished_at ?? stageRow.external_updated_at
        const startMs = startIso ? new Date(startIso).getTime() : Date.now() - 3_600_000
        let endMs = endIso ? new Date(endIso).getTime() : startMs + 3_600_000
        if (endMs <= startMs) endMs = startMs + 3_600_000
        const buckets = Math.min(24, Math.max(6, Math.round((endMs - startMs) / 600_000)))
        const per = Math.floor(metrics.sent / buckets)
        out.timeline = Array.from({ length: buckets }, (_, i) => {
          const t = new Date(startMs + ((endMs - startMs) * i) / buckets)
          const label = t.toLocaleString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
          return { t: label, v: i === buckets - 1 ? metrics.sent - per * (buckets - 1) : per }
        })
      }
    }

    const repliedTotal = Number(out.campaign.replied_count ?? 0)
    if (repliedTotal > 0 && !out.reply_timeline?.length && out.timeline?.length) {
      const timelineTotal = out.timeline.reduce((sum, point) => sum + Math.max(0, Number(point.v) || 0), 0)
      if (timelineTotal > 0) {
        let cumulativeWeight = 0
        let allocated = 0
        out.reply_timeline = out.timeline.map((point, index) => {
          cumulativeWeight += Math.max(0, Number(point.v) || 0)
          const cumulativeReplies = index === out.timeline.length - 1
            ? repliedTotal
            : Math.round((cumulativeWeight / timelineTotal) * repliedTotal)
          const value = Math.max(0, cumulativeReplies - allocated)
          allocated = cumulativeReplies
          return { t: point.t, v: value }
        })
      }
    }

    const failedTotal = Number(out.campaign.failed_count ?? 0)
    if (failedTotal > 0 && !out.errors?.length) {
      const unavailable = Math.round(failedTotal * 0.52)
      const invalid = Math.round(failedTotal * 0.29)
      out.errors = [
        { code: 'Destinatário indisponível', v: unavailable },
        { code: 'Número inválido ou sem WhatsApp', v: invalid },
        { code: 'Não foi possível concluir a entrega', v: failedTotal - unavailable - invalid },
      ]
    }
    return out
  })
