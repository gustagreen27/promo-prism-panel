// Atendimento no painel do cliente.
// O admin vincula um número (conexão WhatsApp) a um disparo (wa_campaigns);
// o workspace do disparo passa a enxergar as conversas daquele número em
// /painel/atendimento e pode responder dentro da janela de 24h.
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'

async function assertStaff(supabase: any, userId: string) {
  const { data } = await supabase.rpc('is_internal_staff', { _user: userId })
  if (!data) throw new Error('Acesso restrito à equipe interna')
}

async function myWorkspaceIds(supabase: any, userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
  const ids = (data ?? []).map((m: any) => m.workspace_id).filter(Boolean)
  if (!ids.length) throw new Error('Sem workspace vinculado')
  return ids
}

type Grant = { id: string; workspace_id: string; phone_number_id: string; connection_id: string | null; campaign_id: string | null }

async function myGrants(admin: any, wsIds: string[]): Promise<Grant[]> {
  const { data } = await admin
    .from('wa_attendance_grants')
    .select('id, workspace_id, phone_number_id, connection_id, campaign_id')
    .in('workspace_id', wsIds)
  return (data ?? []) as Grant[]
}

// ---------------- Admin ----------------

export type LinkableNumber = {
  connection_id: string
  phone_number_id: string
  phone: string | null
  label: string | null
}

/** Números vinculados ao disparo + números disponíveis para vincular. */
export const getDemandAttendanceLinks = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaign_id: string }) => z.object({ campaign_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

    const { data: campaign } = await supabaseAdmin
      .from('wa_campaigns')
      .select('id, workspace_id, connection_id')
      .eq('id', data.campaign_id)
      .maybeSingle()
    if (!campaign) throw new Error('Disparo não encontrado')

    const [{ data: grants }, { data: conns }] = await Promise.all([
      supabaseAdmin
        .from('wa_attendance_grants')
        .select('id, phone_number_id, connection_id, campaign_id, created_at')
        .eq('workspace_id', (campaign as any).workspace_id)
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('whatsapp_connections')
        .select('id, phone_number_id, phone, display_phone, name, nome_interno, verified_name, created_at')
        .not('phone_number_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(500),
    ])

    const available: LinkableNumber[] = ((conns ?? []) as any[]).map((c) => ({
      connection_id: c.id,
      phone_number_id: c.phone_number_id,
      phone: c.display_phone ?? c.phone ?? null,
      label: c.nome_interno ?? c.name ?? c.verified_name ?? null,
    }))
    const byPni = new Map(available.map((n) => [n.phone_number_id, n]))

    const linked = ((grants ?? []) as any[]).map((g) => ({
      id: g.id as string,
      phone_number_id: g.phone_number_id as string,
      campaign_id: g.campaign_id as string | null,
      phone: byPni.get(g.phone_number_id)?.phone ?? null,
      label: byPni.get(g.phone_number_id)?.label ?? null,
    }))

    return { workspace_id: (campaign as any).workspace_id as string, linked, available }
  })

export const linkDemandAttendanceNumber = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaign_id: string; phone_number_id: string }) =>
    z.object({ campaign_id: z.string().uuid(), phone_number_id: z.string().min(3) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

    const { data: campaign } = await supabaseAdmin
      .from('wa_campaigns')
      .select('id, workspace_id')
      .eq('id', data.campaign_id)
      .maybeSingle()
    if (!campaign) throw new Error('Disparo não encontrado')

    const { data: conn } = await supabaseAdmin
      .from('whatsapp_connections')
      .select('id')
      .eq('phone_number_id', data.phone_number_id)
      .limit(1)
      .maybeSingle()

    const { error } = await supabaseAdmin.from('wa_attendance_grants').upsert(
      {
        workspace_id: (campaign as any).workspace_id,
        phone_number_id: data.phone_number_id,
        connection_id: (conn as any)?.id ?? null,
        campaign_id: data.campaign_id,
        created_by: userId,
      },
      { onConflict: 'workspace_id,phone_number_id' },
    )
    if (error) throw new Error(error.message)
    return { ok: true }
  })

export const unlinkDemandAttendanceNumber = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { error } = await supabaseAdmin.from('wa_attendance_grants').delete().eq('id', data.id)
    if (error) throw new Error(error.message)
    return { ok: true }
  })

// ---------------- Painel do cliente ----------------

export type ClientAttendanceNumber = {
  phone_number_id: string
  phone: string | null
  label: string | null
  total: number
  unread: number
  open_window: number
  last_message_at: string | null
}

export const listMyAttendanceNumbers = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ClientAttendanceNumber[]> => {
    const { supabase, userId } = context as any
    const wsIds = await myWorkspaceIds(supabase, userId)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const grants = await myGrants(supabaseAdmin, wsIds)
    if (!grants.length) return []
    const pnis = [...new Set(grants.map((g) => g.phone_number_id))]

    const [{ data: conns }, { data: convs }] = await Promise.all([
      supabaseAdmin
        .from('whatsapp_connections')
        .select('phone_number_id, phone, display_phone, name, nome_interno, verified_name')
        .in('phone_number_id', pnis),
      supabaseAdmin
        .from('wa_conversations')
        .select('phone_number_id, unread_count, service_window_status, last_message_at')
        .in('phone_number_id', pnis)
        .limit(5000),
    ])

    const info = new Map<string, { phone: string | null; label: string | null }>()
    for (const c of (conns ?? []) as any[]) {
      info.set(c.phone_number_id, {
        phone: c.display_phone ?? c.phone ?? null,
        label: c.nome_interno ?? c.name ?? c.verified_name ?? null,
      })
    }

    const out = new Map<string, ClientAttendanceNumber>()
    for (const pni of pnis) {
      out.set(pni, {
        phone_number_id: pni,
        phone: info.get(pni)?.phone ?? null,
        label: info.get(pni)?.label ?? null,
        total: 0,
        unread: 0,
        open_window: 0,
        last_message_at: null,
      })
    }
    for (const c of (convs ?? []) as any[]) {
      const cur = out.get(c.phone_number_id)
      if (!cur) continue
      cur.total += 1
      cur.unread += Number(c.unread_count ?? 0)
      if (c.service_window_status === 'open') cur.open_window += 1
      if (c.last_message_at && (!cur.last_message_at || c.last_message_at > cur.last_message_at)) {
        cur.last_message_at = c.last_message_at
      }
    }
    return [...out.values()].sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''))
  })

export const listMyAttendanceConversations = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        phone_number_id: z.string().optional(),
        search: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    const wsIds = await myWorkspaceIds(supabase, userId)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const grants = await myGrants(supabaseAdmin, wsIds)
    if (!grants.length) return []
    let pnis = [...new Set(grants.map((g) => g.phone_number_id))]
    if (data.phone_number_id) {
      if (!pnis.includes(data.phone_number_id)) return []
      pnis = [data.phone_number_id]
    }

    let q = supabaseAdmin
      .from('wa_conversations')
      .select(
        'id, contact_phone, contact_name, phone_number_id, campaign_id, last_message_at, last_message_preview, unread_count, conversation_status, service_window_status, service_window_expires_at',
      )
      .in('phone_number_id', pnis)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(data.limit ?? 100)
    if (data.search?.trim()) {
      const s = `%${data.search.trim()}%`
      q = q.or(`contact_phone.ilike.${s},contact_name.ilike.${s},last_message_preview.ilike.${s}`)
    }
    const { data: rows, error } = await q
    if (error) throw new Error(error.message)
    return rows ?? []
  })

/** Garante que a conversa pertence a um número liberado para o usuário. */
async function myConversation(supabase: any, userId: string, conversationId: string) {
  const wsIds = await myWorkspaceIds(supabase, userId)
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  const grants = await myGrants(supabaseAdmin, wsIds)
  const pnis = new Set(grants.map((g) => g.phone_number_id))
  const { data: conv } = await supabaseAdmin
    .from('wa_conversations')
    .select(
      'id, workspace_id, contact_phone, contact_name, connection_id, phone_number_id, service_window_status, service_window_expires_at, last_message_at',
    )
    .eq('id', conversationId)
    .maybeSingle()
  if (!conv || !(conv as any).phone_number_id || !pnis.has((conv as any).phone_number_id)) {
    throw new Error('Conversa não encontrada')
  }
  return { conv: conv as any, supabaseAdmin }
}

export const getMyAttendanceMessages = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversation_id: string }) =>
    z.object({ conversation_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    const { conv, supabaseAdmin } = await myConversation(supabase, userId, data.conversation_id)
    const { data: rows, error } = await supabaseAdmin
      .from('wa_conversation_messages')
      .select(
        'id, direction, origin, message_type, body, media_url, media_caption, template_name, status, error_message, created_at, sent_at, delivered_at, read_at, failed_at',
      )
      .eq('conversation_id', data.conversation_id)
      .order('created_at', { ascending: true })
      .limit(300)
    if (error) throw new Error(error.message)
    return { conversation: conv, messages: rows ?? [] }
  })

export const markMyAttendanceRead = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversation_id: string }) =>
    z.object({ conversation_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    const { supabaseAdmin } = await myConversation(supabase, userId, data.conversation_id)
    await supabaseAdmin.from('wa_conversations').update({ unread_count: 0 }).eq('id', data.conversation_id)
    return { ok: true }
  })

export const sendMyAttendanceMessage = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversation_id: string; body: string }) =>
    z.object({ conversation_id: z.string().uuid(), body: z.string().min(1).max(4096) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    const { conv, supabaseAdmin } = await myConversation(supabase, userId, data.conversation_id)
    if (!conv.connection_id || !conv.phone_number_id) throw new Error('Conversa sem número de origem definido')

    const windowOpen =
      conv.service_window_status === 'open' &&
      (!conv.service_window_expires_at || new Date(conv.service_window_expires_at).getTime() > Date.now())
    if (!windowOpen) throw new Error('Janela de 24h encerrada — o lead precisa responder novamente.')

    const nowIso = new Date().toISOString()
    const payload = { kind: 'text', body: data.body, context_wamid: null }

    const { data: msg, error: msgErr } = await supabaseAdmin
      .from('wa_conversation_messages')
      .insert({
        workspace_id: conv.workspace_id,
        conversation_id: conv.id,
        direction: 'outbound',
        origin: 'manual',
        message_type: 'text',
        body: data.body,
        status: 'queued',
        sent_by_user_id: userId,
        payload,
      })
      .select('id')
      .single()
    if (msgErr) throw new Error(msgErr.message)

    const { error: qErr } = await supabaseAdmin.from('wa_service_queue').insert({
      workspace_id: conv.workspace_id,
      conversation_id: conv.id,
      connection_id: conv.connection_id,
      phone_number_id: conv.phone_number_id,
      contact_phone: conv.contact_phone,
      message_id: (msg as any).id,
      payload,
      idempotency_key: `msg:${(msg as any).id}`,
      priority: 3,
      origin: 'manual',
      requested_by: userId,
      scheduled_at: nowIso,
      next_attempt_at: nowIso,
    })
    if (qErr) throw new Error(qErr.message)

    await supabaseAdmin
      .from('wa_conversations')
      .update({ last_outbound_at: nowIso, last_message_at: nowIso, last_message_preview: data.body })
      .eq('id', conv.id)

    return { ok: true, message_id: (msg as any).id }
  })
