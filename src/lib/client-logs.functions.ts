// Logs de envio (nível mensagem) da demanda para o painel do cliente.
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import { eachSimulatedLog, maskPhone, type SimLogRow } from './dispatch-log-sim'

export type CampaignLogRow = SimLogRow & { simulated: boolean }

// A API de dados retorna no máximo 1.000 linhas por requisição — todas as
// leituras abaixo paginam internamente para honrar o limite pedido.
const PAGE = 1000

async function loadCampaignForMember(supabase: any, userId: string, id: string) {
  const { data: campaign, error } = await supabase
    .from('wa_campaigns')
    .select(
      'id,name,workspace_id,list_id,execution_type,external_status,external_total_count,external_sent_count,external_delivered_count,external_failed_count,external_started_at,external_finished_at,total_recipients,sent_count,delivered_count,read_count,replied_count,failed_count,started_at,scheduled_at,last_sent_at,updated_at',
    )
    .eq('id', id)
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

  return campaign
}

async function fetchRealLogs(admin: any, campaignId: string, limit: number) {
  const rows: any[] = []
  let offset = 0
  while (rows.length < limit) {
    const { data, error } = await admin
      .from('campaign_recipients')
      .select('phone,status,meta_message_id,sent_at,delivered_at,read_at,replied_at,failed_at,error_code,failed_reason')
      .eq('campaign_id', campaignId)
      .not('sent_at', 'is', null)
      .order('sent_at', { ascending: true, nullsFirst: false })
      .order('phone', { ascending: true })
      .range(offset, offset + Math.min(PAGE, limit - rows.length) - 1)
    if (error) throw error
    const batch = (data ?? []) as any[]
    rows.push(...batch)
    if (batch.length < PAGE) break
    offset += batch.length
  }
  return rows
}

async function fetchListPhones(admin: any, listId: string, limit: number): Promise<string[]> {
  const phones: string[] = []
  let offset = 0
  while (phones.length < limit) {
    const want = Math.min(PAGE * 8, limit - phones.length)
    const pages = Math.ceil(want / PAGE)
    const batch = await Promise.all(
      Array.from({ length: pages }, (_, k) =>
        admin
          .from('contact_list_items')
          .select('contacts(phone)')
          .eq('list_id', listId)
          .order('contact_id', { ascending: true })
          .range(offset + k * PAGE, offset + (k + 1) * PAGE - 1),
      ),
    )
    let got = 0
    for (const { data, error } of batch) {
      if (error) throw error
      const rows = (data ?? []) as any[]
      got += rows.length
      for (const r of rows) {
        const p = r.contacts?.phone
        if (p) phones.push(p)
      }
    }
    if (got < pages * PAGE) break
    offset += got
  }
  return phones
}

function simWindow(campaign: any) {
  const startIso = campaign.external_started_at ?? campaign.started_at ?? campaign.scheduled_at
  const finishIso = campaign.external_finished_at ?? campaign.last_sent_at ?? campaign.updated_at
  const startMs = startIso ? new Date(startIso).getTime() : Date.now() - 3_600_000
  const finishMs = finishIso ? new Date(finishIso).getTime() : startMs + 3_600_000
  return { startMs, finishMs }
}

export const getMyCampaignLogs = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; limit?: number }) =>
    z.object({ id: z.string().uuid(), limit: z.number().int().min(1).max(10000).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    const limit = data.limit ?? 200
    const campaign = await loadCampaignForMember(supabase, userId, data.id)

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

    // 1) Envio real pela plataforma: logs verdadeiros dos destinatários.
    //    Execução externa nunca tem logs reais — os destinatários ficam todos
    //    'pending' no banco, então pulamos direto para a reconstrução simulada.
    const isExternal = campaign.execution_type === 'external'
    const real = isExternal ? null : await fetchRealLogs(supabaseAdmin, data.id, limit)

    if (real && real.length > 0) {
      const rows: CampaignLogRow[] = real.map((r) => ({
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

    const phones = campaign.list_id ? await fetchListPhones(supabaseAdmin, campaign.list_id, limit) : []
    if (phones.length === 0) return { rows: [], simulated: true, total: metrics.total ?? 0 }

    const { startMs, finishMs } = simWindow(campaign)

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

// ---------------------------------------------------------------------------
// Exportação completa (CSV) — sem o teto de 1.000 linhas.
// O CSV é gerado no servidor, compactado em gzip e devolvido em base64; o
// navegador descompacta e salva o .csv. Assim bases com centenas de milhares
// de contatos trafegam apenas alguns MB.
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<string, string> = {
  replied: 'Respondeu',
  read: 'Lida',
  delivered: 'Entregue',
  sent: 'Enviada',
  accepted: 'Aceita',
  failed: 'Falhou',
}

const fmtDt = (v?: string | null) =>
  v
    ? new Date(v).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`

function rowToLine(r: SimLogRow): string {
  return [
    cell(maskPhone(r.phone)),
    cell(STATUS_LABEL[r.status] ?? r.status),
    cell(r.wamid ?? ''),
    cell(fmtDt(r.sent_at)),
    cell(fmtDt(r.delivered_at)),
    cell(fmtDt(r.read_at)),
    cell(fmtDt(r.replied_at)),
    cell(fmtDt(r.failed_at)),
    cell(r.error_code ?? ''),
    cell(r.error_reason ?? ''),
  ].join(';')
}

const CSV_HEADER = 'telefone;status;wamid;enviada_em;entregue_em;lida_em;respondida_em;falha_em;codigo_erro;motivo'

async function gzipBase64(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  const buf = new Uint8Array(await new Response(stream).arrayBuffer())
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode(...buf.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

export const exportMyCampaignLogs = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    const campaign = await loadCampaignForMember(supabase, userId, data.id)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

    const parts: string[] = []
    let buf: string[] = []
    let count = 0
    const push = (line: string) => {
      buf.push(line)
      count++
      if (buf.length >= 20000) {
        parts.push(buf.join('\n'))
        buf = []
      }
    }

    const isExternal = campaign.execution_type === 'external'
    if (!isExternal) {
      const real = await fetchRealLogs(supabaseAdmin, data.id, Number.MAX_SAFE_INTEGER)
      for (const r of real) {
        push(
          rowToLine({
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
          }),
        )
      }
    } else {
      const { demandMetrics } = await import('./demand-stage')
      const metrics = demandMetrics(campaign as any)
      const phones = campaign.list_id
        ? await fetchListPhones(supabaseAdmin, campaign.list_id, Number.MAX_SAFE_INTEGER)
        : []
      if (phones.length > 0) {
        const { startMs, finishMs } = simWindow(campaign)
        eachSimulatedLog(
          {
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
          },
          (row) => push(rowToLine(row)),
        )
      }
    }

    if (buf.length) parts.push(buf.join('\n'))
    const csv = '﻿' + CSV_HEADER + '\n' + parts.join('\n')
    const filename = `logs-${String(campaign.name ?? 'campanha').replace(/\W+/g, '-').toLowerCase()}.csv`

    return { filename, rows: count, csvGzipB64: await gzipBase64(csv) }
  })
