import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import { z } from 'zod'

async function assertCampaignAccess(supabase: any, userId: string, campaignId: string) {
  const { data: c } = await supabase
    .from('campaigns')
    .select('workspace_id')
    .eq('id', campaignId)
    .maybeSingle()
  if (!c) throw new Error('Campanha não encontrada')
  const { data: staff } = await supabase.rpc('is_internal_staff', { _user: userId })
  if (staff) return c.workspace_id
  if (!c.workspace_id) throw new Error('Sem permissão')
  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('workspace_id', c.workspace_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (!member) throw new Error('Sem permissão para esta campanha')
  return c.workspace_id
}

type Bucket = { key: string; count: number }
function tally<T>(rows: T[], pick: (r: T) => string | null | undefined): Bucket[] {
  const map = new Map<string, number>()
  for (const r of rows) {
    const k = (pick(r) || '—').toString()
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  return Array.from(map, ([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
}

export const getCampaignRealtimeAnalytics = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaign_id: string; hours?: number }) =>
    z.object({ campaign_id: z.string().uuid(), hours: z.number().int().min(1).max(720).default(24) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertCampaignAccess(supabase, userId, data.campaign_id)

    const sinceIso = new Date(Date.now() - data.hours * 3600 * 1000).toISOString()
    const { data: clicks, error } = await supabase
      .from('campaign_clicks')
      .select('id, ip, country, city, device, device_type, browser, os, clicked_at, referer')
      .eq('campaign_id', data.campaign_id)
      .gte('clicked_at', sinceIso)
      .order('clicked_at', { ascending: false })
      .limit(5000)
    if (error) throw error

    const rows = clicks ?? []
    const totalClicks = rows.length
    const uniqueIps = new Set(rows.map((r: any) => r.ip).filter(Boolean)).size
    const missingGeo = rows.filter((r: any) => !r.country).length
    const collectionRate = totalClicks ? Math.round(((totalClicks - missingGeo) / totalClicks) * 100) : 100

    // by hour buckets
    const buckets: Record<string, number> = {}
    const now = new Date()
    for (let i = data.hours - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 3600 * 1000)
      const k = d.toISOString().slice(0, 13) + ':00'
      buckets[k] = 0
    }
    for (const r of rows) {
      const k = new Date(r.clicked_at).toISOString().slice(0, 13) + ':00'
      if (k in buckets) buckets[k]++
    }
    const timeline = Object.entries(buckets).map(([t, n]) => ({
      t, hour: t.slice(11, 16), clicks: n,
    }))

    return {
      totals: {
        clicks: totalClicks,
        unique: uniqueIps,
        countries: new Set(rows.map((r: any) => r.country).filter(Boolean)).size,
        devices: new Set(rows.map((r: any) => r.device_type).filter(Boolean)).size,
        collection_rate: collectionRate,
        missing_geo: missingGeo,
      },
      timeline,
      by_country: tally(rows, (r: any) => r.country).slice(0, 6),
      by_city: tally(rows, (r: any) => r.city).slice(0, 10),
      by_device: tally(rows, (r: any) => r.device_type || r.device),
      by_browser: tally(rows, (r: any) => r.browser).slice(0, 6),
      by_os: tally(rows, (r: any) => r.os).slice(0, 6),
    }
  })
