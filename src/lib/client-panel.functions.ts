import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import { z } from 'zod'

async function assertWorkspaceMember(supabase: any, userId: string, workspaceId: string) {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) throw new Error('Workspace inválido ou sem permissão')
}

async function assertWorkspaceNotBlocked(supabase: any, workspaceId: string) {
  const { data } = await supabase
    .from('workspaces')
    .select('blocked_at, block_reason, approval_mode')
    .eq('id', workspaceId)
    .maybeSingle()
  if (data?.blocked_at) throw new Error(`Workspace bloqueado: ${data.block_reason || 'sem motivo'}`)
  return data
}

// ---- Listar números liberados ----
export const listMyNumbers = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace_id: string; project_id?: string | null }) =>
    z.object({ workspace_id: z.string().uuid(), project_id: z.string().uuid().nullish() }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertWorkspaceMember(supabase, userId, data.workspace_id)
    const { data: rows, error } = await supabase
      .from('v_client_numbers')
      .select('*')
      .eq('workspace_id', data.workspace_id)
      .or(data.project_id ? `project_id.eq.${data.project_id},project_id.is.null` : 'project_id.is.null')
    if (error) throw error
    return { numbers: rows || [] }
  })

// ---- Listar templates liberados ----
export const listMyTemplates = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace_id: string; connection_id?: string | null }) =>
    z.object({ workspace_id: z.string().uuid(), connection_id: z.string().uuid().nullish() }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertWorkspaceMember(supabase, userId, data.workspace_id)
    let q = supabase
      .from('v_client_templates')
      .select('*')
      .or(`workspace_id.eq.${data.workspace_id},workspace_id.is.null`)
    if (data.connection_id) {
      q = q.or(`connection_id.eq.${data.connection_id},connection_id.is.null`)
    }
    const { data: rows, error } = await q
    if (error) throw error
    return { templates: rows || [] }
  })

// ---- Saldo do workspace (agora em R$/carteira) ----
export const getMyBalance = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace_id: string }) =>
    z.object({ workspace_id: z.string().uuid() }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertWorkspaceMember(supabase, userId, data.workspace_id)
    const [{ data: wallet }, { data: settings }] = await Promise.all([
      supabase.from('workspace_wallets').select('*').eq('workspace_id', data.workspace_id).maybeSingle(),
      supabase.from('billing_settings').select('default_price_cents').eq('id', 1).maybeSingle(),
    ])
    const balance = Number(wallet?.balance_cents ?? 0)
    const reserved = Number(wallet?.reserved_cents ?? 0)
    const unit = wallet?.custom_price_cents ?? settings?.default_price_cents ?? 15
    return {
      balance_cents: balance,
      reserved_cents: reserved,
      available_cents: balance - reserved,
      unit_price_cents: unit,
      // compat: quantidade estimada de mensagens que ainda cabe
      available: unit > 0 ? Math.floor((balance - reserved) / unit) : 0,
      gross: unit > 0 ? Math.floor(balance / unit) : 0,
      reserved: unit > 0 ? Math.floor(reserved / unit) : 0,
    }
  })

// ---- Solicitar template novo ----
export const createTemplateRequest = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      workspace_id: z.string().uuid(),
      name: z.string().min(3).max(120),
      category: z.string(),
      language: z.string().default('pt_BR'),
      body: z.string().min(1),
      footer: z.string().optional(),
      header_type: z.string().optional(),
      header_media_type: z.string().optional(),
      variables: z.array(z.any()).default([]),
      buttons: z.array(z.any()).default([]),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertWorkspaceMember(supabase, userId, data.workspace_id)
    const { data: row, error } = await supabase
      .from('whatsapp_template_requests')
      .insert({ ...data, requested_by: userId, status: 'em_revisao', submitted_at: new Date().toISOString() })
      .select()
      .single()
    if (error) throw error
    return { request: row }
  })

// ---- Criar campanha (rascunho) ----
export const createClientCampaign = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      workspace_id: z.string().uuid(),
      name: z.string().min(2),
      project_id: z.string().uuid().nullish(),
      connection_id: z.string().uuid(),
      template_id: z.string().uuid(),
      list_id: z.string().uuid().nullish(),
      variables_mapping: z.record(z.string()).optional(),
      button_url_mapping: z.record(z.string()).optional(),
      header_media_url: z.string().optional().nullable(),
      scheduled_at: z.string().nullish(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    const { data: adminRole } = await supabase.rpc('has_role', { _user_id: userId, _role: 'admin' })
    const isAdmin = !!adminRole
    let ws: any = null

    if (isAdmin) {
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('approval_mode')
        .eq('id', data.workspace_id)
        .maybeSingle()
      ws = workspace
    } else {
      await assertWorkspaceMember(supabase, userId, data.workspace_id)
      ws = await assertWorkspaceNotBlocked(supabase, data.workspace_id)
    }

    if (!isAdmin) {
      // Validar número liberado
      const { data: grant } = await supabase
        .from('whatsapp_number_grants')
        .select('id')
        .eq('workspace_id', data.workspace_id)
        .eq('connection_id', data.connection_id)
        .limit(1)
        .maybeSingle()
      if (!grant) throw new Error('Este número não está liberado para o seu workspace')

      // Validar template liberado
      const { data: tplGrant } = await supabase
        .from('whatsapp_template_grants')
        .select('id')
        .eq('template_id', data.template_id)
        .or(`workspace_id.eq.${data.workspace_id},workspace_id.is.null`)
        .limit(1)
        .maybeSingle()
      if (!tplGrant) throw new Error('Este template não está liberado para o seu workspace')
    }

    // Consolida mapeamentos em template_variables (lido pelo worker de envio).
    // Os botões dinâmicos ficam na coluna button_url_mapping (todos, não só o primeiro).
    const templateVars: Record<string, string> = { ...(data.variables_mapping ?? {}) }
    if (data.header_media_url) templateVars._header_image_url = data.header_media_url


    const approval_mode = ws?.approval_mode || 'auto'
    const approval_status = approval_mode === 'manual' ? 'pending' : 'not_required'

    const { data: campaign, error } = await supabase
      .from('wa_campaigns')
      .insert({
        workspace_id: data.workspace_id,
        name: data.name,
        project_id: data.project_id ?? null,
        connection_id: data.connection_id,
        template_id: data.template_id,
        list_id: data.list_id ?? null,
        variables_mapping: data.variables_mapping ?? null,
        button_url_mapping: data.button_url_mapping ?? null,
        template_variables: templateVars,
        scheduled_at: data.scheduled_at ?? null,
        status: 'draft',
        approval_mode,
        approval_status,
        created_by: userId,
      })
      .select()
      .single()
    if (error) throw error

    if (data.list_id) {
      const PAGE = 1000
      const allItems: any[] = []
      for (let from = 0; ; from += PAGE) {
        const { data: items, error: itemsErr } = await supabase
          .from('contact_list_items')
          .select('contact:contacts(id,phone,opt_in,opt_out,name)')
          .eq('list_id', data.list_id)
          .range(from, from + PAGE - 1)
        if (itemsErr) throw itemsErr
        allItems.push(...(items ?? []))
        if (!items || items.length < PAGE) break
      }

      const contacts = allItems
        .map((i) => i.contact)
        .filter((c) => c?.phone && c.opt_in !== false && !c.opt_out)

      const phones = contacts.map((c) => c.phone)
      let blocked = new Set<string>()
      if (phones.length) {
        const blockedPhones: string[] = []
        for (let i = 0; i < phones.length; i += PAGE) {
          const { data: optOuts, error: optOutsErr } = await supabase
            .from('opt_outs')
            .select('phone')
            .in('phone', phones.slice(i, i + PAGE))
          if (optOutsErr) throw optOutsErr
          blockedPhones.push(...((optOuts ?? []).map((r: any) => r.phone)))
        }
        blocked = new Set(blockedPhones)
      }

      const unique = new Map<string, any>()
      for (const c of contacts) {
        const phone = String(c.phone ?? '').replace(/\D/g, '')
        if (!phone || blocked.has(c.phone) || unique.has(phone)) continue
        unique.set(phone, c)
      }

      const recipients = Array.from(unique.values()).map((c: any) => ({
        campaign_id: campaign.id,
        contact_id: c.id,
        phone: String(c.phone ?? '').replace(/\D/g, ''),
        variables: c.name ? { nome: c.name, name: c.name } : {},
        status: 'pending' as const,
      }))

      for (let i = 0; i < recipients.length; i += 1000) {
        const { error: recErr } = await supabase
          .from('campaign_recipients')
          .insert(recipients.slice(i, i + 1000))
        if (recErr) throw recErr
      }

      const { error: totalErr } = await supabase
        .from('wa_campaigns')
        .update({ total_recipients: recipients.length })
        .eq('id', campaign.id)
      if (totalErr) throw totalErr
      campaign.total_recipients = recipients.length
    }

    return { campaign }
  })

// ---- Iniciar campanha (respeita approval_mode) ----
export const startClientCampaign = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaign_id: string }) =>
    z.object({ campaign_id: z.string().uuid() }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    const { data: c } = await supabase
      .from('wa_campaigns')
      .select('id, workspace_id, approval_mode, total_recipients, status')
      .eq('id', data.campaign_id)
      .maybeSingle()
    if (!c) throw new Error('Campanha não encontrada')
    const { data: adminRole } = await supabase.rpc('has_role', { _user_id: userId, _role: 'admin' })
    const isAdmin = !!adminRole
    if (isAdmin) {
      await supabase
        .from('wa_campaigns')
        .update({ status: 'queued', approval_status: 'approved', approved_at: new Date().toISOString(), approved_by: userId, reservation_id: null })
        .eq('id', c.id)
      return { status: 'queued' as const }
    }

    await assertWorkspaceMember(supabase, userId, c.workspace_id)
    await assertWorkspaceNotBlocked(supabase, c.workspace_id)

    if (c.approval_mode === 'manual') {
      await supabase
        .from('wa_campaigns')
        .update({ status: 'awaiting_approval', approval_status: 'pending' })
        .eq('id', c.id)
      return { status: 'awaiting_approval' as const }
    }

    // Reserva de saldo em R$ (atômica). Se saldo insuficiente, bloqueia o start.
    if (c.total_recipients && c.total_recipients > 0) {
      const [{ data: wallet }, { data: settings }] = await Promise.all([
        supabase.from('workspace_wallets').select('custom_price_cents').eq('workspace_id', c.workspace_id).maybeSingle(),
        supabase.from('billing_settings').select('default_price_cents').eq('id', 1).maybeSingle(),
      ])
      const unit = wallet?.custom_price_cents ?? settings?.default_price_cents ?? 15
      const { data: reservation, error: resErr } = await supabase.rpc('wallet_reserve', {
        _ws: c.workspace_id,
        _campaign_id: c.id,
        _qty: c.total_recipients,
        _unit_price_cents: unit,
      })
      if (resErr) {
        if (String(resErr.message).includes('INSUFFICIENT_BALANCE')) {
          throw new Error('Saldo insuficiente. Faça um depósito para iniciar esta campanha.')
        }
        throw resErr
      }
      const reservationId = Array.isArray(reservation) ? reservation[0]?.id : (reservation as any)?.id
      await supabase
        .from('wa_campaigns')
        .update({
          status: 'queued',
          approval_status: 'approved',
          approved_at: new Date().toISOString(),
          approved_by: userId,
          price_cents_at_start: unit,
          reservation_id: reservationId ?? null,
        })
        .eq('id', c.id)
    } else {
      await supabase
        .from('wa_campaigns')
        .update({ status: 'queued', approval_status: 'approved', approved_at: new Date().toISOString(), approved_by: userId })
        .eq('id', c.id)
    }
    return { status: 'queued' as const }
  })
