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
      variables_mapping: z.any().optional(),
      button_url_mapping: z.any().optional(),
      scheduled_at: z.string().nullish(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertWorkspaceMember(supabase, userId, data.workspace_id)
    const ws = await assertWorkspaceNotBlocked(supabase, data.workspace_id)

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
        scheduled_at: data.scheduled_at ?? null,
        status: 'draft',
        approval_mode,
        approval_status,
        created_by: userId,
      })
      .select()
      .single()
    if (error) throw error
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
    await assertWorkspaceMember(supabase, userId, c.workspace_id)
    await assertWorkspaceNotBlocked(supabase, c.workspace_id)

    if (c.approval_mode === 'manual') {
      await supabase
        .from('wa_campaigns')
        .update({ status: 'awaiting_approval', approval_status: 'pending' })
        .eq('id', c.id)
      return { status: 'awaiting_approval' }
    }
    await supabase
      .from('wa_campaigns')
      .update({ status: 'queued', approval_status: 'approved', approved_at: new Date().toISOString(), approved_by: userId })
      .eq('id', c.id)
    // reserva de saldo (best-effort)
    if (c.total_recipients && c.total_recipients > 0) {
      await supabase.from('message_stock_reservations').insert({
        campaign_id: c.id,
        workspace_id: c.workspace_id,
        qty_reserved: c.total_recipients,
        status: 'held',
      })
    }
    return { status: 'queued' }
  })
