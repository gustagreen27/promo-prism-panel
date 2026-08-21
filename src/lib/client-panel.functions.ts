import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import { z } from 'zod'
import { assertSufficientCredits, getWorkspaceCredits, InsufficientCreditsError } from '@/lib/wallet-guard'
import { getCountryCallingCode } from '@/lib/phone-country'

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
    // Enriquece com o portfólio empresarial (BM) para agrupar na UI
    const wabaIds = [...new Set((rows || []).map((n: any) => n.waba_id).filter(Boolean).map(String))]
    const bmByWaba = new Map<string, any>()
    if (wabaIds.length) {
      const { data: wabas } = await supabase
        .from('whatsapp_wabas')
        .select('waba_id, nome_interno, business_id')
        .in('waba_id', wabaIds)
      for (const w of wabas || []) bmByWaba.set(String(w.waba_id), w)
    }
    return { numbers: (rows || []).map((n: any) => ({
      ...n,
      waba_name: bmByWaba.get(String(n.waba_id))?.nome_interno ?? null,
      business_id: bmByWaba.get(String(n.waba_id))?.business_id ?? null,
      phone_display: n.display_phone ?? n.phone_masked ?? null,
      phone_country_code: getCountryCallingCode(n.phone ?? n.display_phone ?? n.phone_masked),
    })) }
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
      connection_id: z.string().uuid().nullish(),
      template_id: z.string().uuid().nullish(),
      // Briefing enviado pelo cliente (mensagem, mídia, botão, origem dos contatos…)
      client_brief: z.record(z.any()).optional().nullable(),
      list_id: z.string().uuid().nullish(),
      ddd_filter: z.string().regex(/^\d{2}$/).nullish(),
      variables_mapping: z.record(z.string()).optional(),
      button_url_mapping: z.record(z.string()).optional(),
      header_media_url: z.string().optional().nullable(),
      scheduled_at: z.string().nullish(),
      // Rate limiter (novo worker)
      target_per_hour: z.number().int().min(1).nullish(),
      rate_per_second: z.number().int().min(1).max(80).nullish(),
      max_concurrency: z.number().int().min(1).max(300).nullish(),
      scheduled_pause_enabled: z.boolean().optional(),
      pause_every_messages: z.number().int().min(1).nullish(),
      pause_duration_seconds: z.number().int().min(1).nullish(),
      // Fluxo de resposta (auto-reply na janela 24h) — aplicado pelo webhook
      response_flow_enabled: z.boolean().optional(),
      response_flow_config: z.any().optional().nullable(),
      // Rascunho: permitido mesmo sem créditos (não vira demanda de disparo real).
      save_as_draft: z.boolean().optional(),
      // Tipo de envio: 'test' (até 10 destinatários, sem consumir créditos) ou 'full'.
      send_type: z.enum(['test', 'full']).optional(),
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

    if (!isAdmin && data.connection_id) {
      // Validar número liberado
      const { data: grant } = await supabase
        .from('whatsapp_number_grants')
        .select('id')
        .eq('workspace_id', data.workspace_id)
        .eq('connection_id', data.connection_id)
        .limit(1)
        .maybeSingle()
      if (!grant) throw new Error('Este número não está liberado para o seu workspace')
    }

    if (!isAdmin && data.template_id) {
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


    // Painel do cliente: nunca dispara direto. Toda campanha entra na fila
    // aguardando aprovação/execução pelo admin.
    const approval_mode = 'manual'
    const isDraft = !!data.save_as_draft
    // Teste: no máximo 10 destinatários e nunca consome créditos.
    const isTest = data.send_type === 'test'
    const TEST_MAX_RECIPIENTS = 10
    const approval_status = isDraft ? 'draft' : 'pending'
    // "Aguardando envio" (sem data) ou "Agendada" (com data/hora escolhidas pelo cliente).
    const initialStatus = isDraft ? 'draft' : data.scheduled_at ? 'scheduled' : 'awaiting_approval'

    const { data: campaign, error } = await supabase
      .from('wa_campaigns')
      .insert({
        workspace_id: data.workspace_id,
        name: data.name,
        project_id: data.project_id ?? null,
        connection_id: data.connection_id ?? null,
        template_id: data.template_id ?? null,
        list_id: data.list_id ?? null,
        variables_mapping: data.variables_mapping ?? null,
        button_url_mapping: data.button_url_mapping ?? null,
        template_variables: templateVars,
        scheduled_at: data.scheduled_at ?? null,
        status: initialStatus,
        custom_fields: { ...(data.client_brief ?? {}), send_type: isTest ? 'test' : 'full' },
        submitted_at: new Date().toISOString(),
        approval_mode,
        approval_status,
        created_by: userId,
        // Rate limiter (novo worker) — usa fallback conservador se ausente
        target_per_hour: data.target_per_hour ?? null,
        rate_per_second: data.rate_per_second ?? 6,
        max_concurrency: data.max_concurrency ?? 15,
        scheduled_pause_enabled: data.scheduled_pause_enabled ?? false,
        pause_every_messages: data.scheduled_pause_enabled ? (data.pause_every_messages ?? null) : null,
        pause_duration_seconds: data.scheduled_pause_enabled ? (data.pause_duration_seconds ?? null) : null,
        response_flow_enabled: data.response_flow_enabled ?? false,
        response_flow_config: data.response_flow_config ?? null,
      })
      .select()
      .single()
    if (error) throw error

    if (data.list_id) {
      // Enfileira via RPC server-side (INSERT..SELECT em uma única query),
      // suporta listas de 100k+ sem estourar o tempo do server function.
      const { data: total, error: buildErr } = await supabase.rpc('wa_build_recipients' as any, {
        _campaign_id: campaign.id,
        _list_id: data.list_id,
      })
      if (buildErr) throw buildErr
      campaign.total_recipients = Number(total ?? 0)

      if (data.ddd_filter) {
        const { data: remaining, error: dddErr } = await supabase.rpc('wa_filter_recipients_by_ddd' as any, {
          _campaign_id: campaign.id,
          _ddd: data.ddd_filter,
        })
        if (dddErr) throw dddErr
        campaign.total_recipients = Number(remaining ?? 0)
        if (campaign.total_recipients === 0) {
          throw new Error(`Nenhum contato com DDD ${data.ddd_filter} foi encontrado na base selecionada`)
        }
      }
    }

    // Envio de teste: mantém no máximo 10 destinatários (corte no backend).
    if (isTest && Number(campaign.total_recipients ?? 0) > TEST_MAX_RECIPIENTS) {
      const { data: keep } = await supabase
        .from('campaign_recipients')
        .select('id')
        .eq('campaign_id', campaign.id)
        .order('id', { ascending: true })
        .limit(TEST_MAX_RECIPIENTS)
      const keepIds = (keep ?? []).map((r: any) => r.id)
      if (keepIds.length) {
        await supabase
          .from('campaign_recipients')
          .delete()
          .eq('campaign_id', campaign.id)
          .not('id', 'in', `(${keepIds.join(',')})`)
      }
      campaign.total_recipients = keepIds.length
      await supabase.from('wa_campaigns').update({ total_recipients: keepIds.length }).eq('id', campaign.id)
    }

    // Regra de crédito (backend, revalidada agora): disparo real só é aceito
    // com saldo suficiente para os contatos válidos que serão enviados.
    // Rascunho e testes são sempre permitidos (teste não consome créditos).
    if (!isDraft && !isTest && !isAdmin) {
      const required = Number(campaign.total_recipients ?? 0)
      const credits = await getWorkspaceCredits(supabase, data.workspace_id)
      if (required > 0 && credits.availableCredits < required) {
        // Não perdemos o trabalho do cliente: a campanha fica salva como rascunho.
        await supabase
          .from('wa_campaigns')
          .update({ status: 'draft', approval_status: 'draft' })
          .eq('id', campaign.id)
        throw new InsufficientCreditsError(credits.availableCredits, required)
      }

      // Debita (reserva) os créditos já no envio da campanha, para que o saldo
      // disponível do cliente caia imediatamente ao enviar para aprovação.
      if (required > 0) {
        const unit = credits.unitPriceCents
        const { data: reservation, error: resErr } = await supabase.rpc('wallet_reserve', {
          _ws: data.workspace_id,
          _campaign_id: campaign.id,
          _qty: required,
          _unit_price_cents: unit,
        })
        if (resErr) {
          await supabase
            .from('wa_campaigns')
            .update({ status: 'draft', approval_status: 'draft' })
            .eq('id', campaign.id)
          if (String(resErr.message).includes('INSUFFICIENT_BALANCE')) {
            throw new InsufficientCreditsError(credits.availableCredits, required)
          }
          throw resErr
        }
        const reservationId = Array.isArray(reservation) ? reservation[0]?.id : (reservation as any)?.id
        if (reservationId) {
          await supabase
            .from('wa_campaigns')
            .update({ reservation_id: reservationId, price_cents_at_start: unit })
            .eq('id', campaign.id)
          ;(campaign as any).reservation_id = reservationId
        }
      }
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
      .select('id, workspace_id, approval_mode, total_recipients, status, custom_fields')
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

    // Revalida saldo no backend antes de transformar o rascunho em disparo real.
    // Envio de teste não consome créditos.
    const isTestCampaign = (c as any)?.custom_fields?.send_type === 'test'
    if (!isTestCampaign && c.total_recipients && c.total_recipients > 0) {
      await assertSufficientCredits(supabase, c.workspace_id, Number(c.total_recipients))
    }

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

// ---- Dashboard do cliente (visão "Resumo da conta") ----
export const getClientDashboard = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace_id: string; project_id?: string | null }) =>
    z.object({ workspace_id: z.string().uuid(), project_id: z.string().uuid().nullish() }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertWorkspaceMember(supabase, userId, data.workspace_id)

    const [{ data: wallet }, { data: settings }, { data: txs }, { data: camps }, { data: projects }] =
      await Promise.all([
        supabase.from('workspace_wallets').select('balance_cents, reserved_cents, custom_price_cents').eq('workspace_id', data.workspace_id).maybeSingle(),
        supabase.from('billing_settings').select('default_price_cents').eq('id', 1).maybeSingle(),
        supabase.from('wallet_transactions').select('amount_cents').eq('workspace_id', data.workspace_id),
        supabase
          .from('wa_campaigns')
          .select('id,name,status,created_at,scheduled_at,total_recipients,sent_count,delivered_count,read_count,replied_count,failed_count,project_id')
          .eq('workspace_id', data.workspace_id)
          .order('created_at', { ascending: false })
          .limit(300),
        supabase.from('projects').select('id,name').eq('workspace_id', data.workspace_id),
      ])

    const unit = wallet?.custom_price_cents ?? settings?.default_price_cents ?? 15
    const toCredits = (cents: number) => (unit > 0 ? Math.round(cents / unit) : 0)
    let creditedCents = 0
    let debitedCents = 0
    for (const t of (txs ?? []) as any[]) {
      const v = Number(t.amount_cents ?? 0)
      if (v >= 0) creditedCents += v
      else debitedCents += -v
    }
    const availableCents = Number(wallet?.balance_cents ?? 0) - Number(wallet?.reserved_cents ?? 0)

    const projectName = new Map<string, string>()
    for (const p of (projects ?? []) as any[]) projectName.set(p.id, p.name)

    const all = ((camps ?? []) as any[]).filter((c) => !data.project_id || c.project_id === data.project_id)

    const bucket = (s: string) => {
      if (['completed', 'partial'].includes(s)) return 'realizado'
      if (['running', 'scheduled', 'paused'].includes(s)) return 'disparando'
      if (['cancelled', 'error', 'blocked', 'rejected'].includes(s)) return 'cancelado'
      if (['queued', 'approved'].includes(s)) return 'configurando'
      return 'recebido'
    }

    const counts = { recebido: 0, configurando: 0, disparando: 0, realizado: 0, cancelado: 0 }
    const byProject = new Map<string, number>()
    let sent = 0, delivered = 0, read = 0, replied = 0, failed = 0, recipients = 0

    for (const c of all) {
      counts[bucket(c.status) as keyof typeof counts] += 1
      sent += Number(c.sent_count ?? 0)
      delivered += Number(c.delivered_count ?? 0)
      read += Number(c.read_count ?? 0)
      replied += Number(c.replied_count ?? 0)
      failed += Number(c.failed_count ?? 0)
      recipients += Number(c.total_recipients ?? 0)
      const key = c.project_id ? (projectName.get(c.project_id) ?? 'Sem empresa') : 'Sem empresa'
      byProject.set(key, (byProject.get(key) ?? 0) + Number(c.sent_count ?? 0))
    }

    return {
      credits: {
        unit_price_cents: unit,
        purchased: toCredits(creditedCents),
        used: toCredits(debitedCents),
        available: toCredits(Math.max(availableCents, 0)),
        available_cents: availableCents,
      },
      counts,
      totals: { campaigns: all.length, sent, delivered, read, replied, failed, recipients },
      by_project: [...byProject.entries()].map(([name, credits]) => ({ name, credits })).sort((a, b) => b.credits - a.credits),
      projects: (projects ?? []) as { id: string; name: string }[],
      campaigns: all.map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        bucket: bucket(c.status),
        created_at: c.created_at,
        scheduled_at: c.scheduled_at,
        total_recipients: Number(c.total_recipients ?? 0),
        sent: Number(c.sent_count ?? 0),
        delivered: Number(c.delivered_count ?? 0),
        read: Number(c.read_count ?? 0),
        replied: Number(c.replied_count ?? 0),
        failed: Number(c.failed_count ?? 0),
        project_name: c.project_id ? (projectName.get(c.project_id) ?? null) : null,
      })),
    }
  })
