// Detalhes de uma demanda para o painel do cliente (métricas, histórico, cliques).
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'

export type DemandClick = {
  clicked_at: string
  city: string | null
  region: string | null
  country: string | null
  device_type: string | null
  browser: string | null
  os: string | null
  isp: string | null
  final_url: string | null
}

export const getMyDemandDetail = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    const fields =
      'id,name,workspace_id,status,approval_status,rejection_reason,approved_at,total_recipients,scheduled_at,created_at,list_id,template_id,connection_id,execution_type,external_status,external_total_count,external_sent_count,external_delivered_count,external_failed_count,external_target_sent_count,external_target_delivered_count,external_target_failed_count,external_started_at,external_finished_at,external_updated_at,sent_count,delivered_count,failed_count,read_count,replied_count,last_sent_at,updated_at,rate_per_second'

    const { data: campaign, error } = await supabase
      .from('wa_campaigns')
      .select(fields)
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

    const { applyExternalProgression } = await import('./external-progression.server')
    await applyExternalProgression(supabase, [campaign])

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

    const [listRes, templateRes, auditRes, clicksRes, connRes] = await Promise.all([
      campaign.list_id
        ? supabase.from('contact_lists').select('id,name').eq('id', campaign.list_id).maybeSingle()
        : Promise.resolve({ data: null }),
      campaign.template_id
        ? supabase.from('whatsapp_templates').select('id,name,language').eq('id', campaign.template_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabaseAdmin
        .from('campaign_audit_log')
        .select('id,action,message,created_at')
        .eq('campaign_id', data.id)
        .order('created_at', { ascending: false })
        .limit(60),
      supabaseAdmin
        .from('campaign_clicks')
        .select('clicked_at,city,region,country,device_type,browser,os,isp,final_url,ip')
        .eq('wa_campaign_id', data.id)
        .order('clicked_at', { ascending: false })
        .limit(500),
      campaign.connection_id
        ? supabaseAdmin
            .from('whatsapp_connections')
            .select('id,name,phone,waba_id')
            .eq('id', campaign.connection_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    let connection: { label: string | null; phone: string | null; waba_name: string | null } | null = null
    const conn = (connRes as any)?.data
    if (conn) {
      let wabaName: string | null = null
      if (conn.waba_id) {
        const { data: waba } = await supabaseAdmin
          .from('whatsapp_wabas')
          .select('nome_interno')
          .eq('waba_id', conn.waba_id)
          .maybeSingle()
        wabaName = waba?.nome_interno ?? null
      }
      connection = { label: conn.name ?? null, phone: conn.phone ?? null, waba_name: wabaName }
    }

    const clickRows = (clicksRes?.data ?? []) as any[]
    const uniqueIps = new Set(clickRows.map((c) => c.ip).filter(Boolean)).size
    const clicks: DemandClick[] = clickRows.map(({ ip: _ip, ...c }) => c as DemandClick)

    const byDay = new Map<string, number>()
    for (const c of clicks) {
      const day = String(c.clicked_at).slice(0, 10)
      byDay.set(day, (byDay.get(day) ?? 0) + 1)
    }

    const HIDE = new Set(['external.note'])
    const timeline = ((auditRes?.data ?? []) as any[])
      .filter((a) => !HIDE.has(a.action))
      .map((a) => ({ id: a.id, action: a.action, message: a.message, created_at: a.created_at }))

    const { external_note: _n, ...safe } = campaign as any
    return {
      campaign: safe,
      connection,
      list_name: (listRes as any)?.data?.name ?? null,
      template_name: (templateRes as any)?.data?.name ?? null,
      timeline,
      clicks,
      clicks_total: clicks.length,
      clicks_unique: uniqueIps,
      clicks_by_day: [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, total]) => ({ day, total })),
      measured_at: new Date().toISOString(),
    }
  })
