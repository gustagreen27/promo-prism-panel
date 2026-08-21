import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import { z } from 'zod'
import { assertSufficientCredits } from '@/lib/wallet-guard'

async function assertStaff(supabase: any, userId: string) {
  const { data } = await supabase.rpc('is_internal_staff', { _user: userId })
  if (!data) throw new Error('Acesso restrito à equipe interna')
}

async function assertMember(supabase: any, userId: string, workspaceId: string) {
  const { data } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!data) throw new Error('Workspace inválido ou sem permissão')
}

const APPROVAL_FIELDS =
  'id,name,workspace_id,project_id,status,approval_status,approval_mode,rejection_reason,approved_at,approved_by,total_recipients,scheduled_at,created_at,created_by,connection_id,template_id,list_id,custom_fields,variables_mapping,button_url_mapping,template_variables'

// ---- Fila de aprovação (admin) ----
export const listApprovalQueue = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { status?: string } | undefined) =>
    z.object({ status: z.enum(['pending', 'approved', 'rejected', 'all']).default('pending') }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)
    let q = supabase
      .from('wa_campaigns')
      .select(`${APPROVAL_FIELDS},workspaces(name)`)
      .order('created_at', { ascending: false })
      .limit(200)
    if (data.status !== 'all') q = q.eq('approval_status', data.status)
    const { data: rows, error } = await q
    if (error) throw error

    const campaigns = (rows ?? []) as any[]
    const listIds = [...new Set(campaigns.map((c) => c.list_id).filter(Boolean))]
    const tplIds = [...new Set(campaigns.map((c) => c.template_id).filter(Boolean))]
    const [{ data: lists }, { data: tpls }] = await Promise.all([
      listIds.length
        ? supabase.from('contact_lists').select('id,name').in('id', listIds)
        : Promise.resolve({ data: [] as any[] }),
      tplIds.length
        ? supabase.from('whatsapp_templates').select('id,name').in('id', tplIds)
        : Promise.resolve({ data: [] as any[] }),
    ])
    const listName = new Map((lists ?? []).map((l: any) => [l.id, l.name]))
    const tplName = new Map((tpls ?? []).map((t: any) => [t.id, t.name]))

    // Conexões (número remetente definido pelo admin)
    const connIds = [...new Set(campaigns.map((c) => c.connection_id).filter(Boolean))]
    const { data: conns } = connIds.length
      ? await supabase
          .from('whatsapp_connections')
          .select('id,display_name,nome_interno,name,display_phone,phone,waba_id')
          .in('id', connIds)
      : { data: [] as any[] }
    const connById = new Map<string, any>((conns ?? []).map((c: any) => [c.id, c] as [string, any]))

    // Quantidade de testes enviados por demanda
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const testCount = new Map<string, number>()
    if (campaigns.length) {
      const { data: tests } = await supabaseAdmin
        .from('wa_test_sends')
        .select('campaign_id')
        .in('campaign_id', campaigns.map((c) => c.id))
      for (const t of (tests ?? []) as any[]) {
        if (!t.campaign_id) continue
        testCount.set(t.campaign_id, (testCount.get(t.campaign_id) ?? 0) + 1)
      }
    }

    return {
      items: campaigns.map((c) => {
        const conn: any = c.connection_id ? connById.get(c.connection_id) : null
        return {
          ...c,
          workspace_name: c.workspaces?.name ?? null,
          list_name: c.list_id ? (listName.get(c.list_id) ?? null) : null,
          template_name: c.template_id ? (tplName.get(c.template_id) ?? null) : null,
          connection_name: conn ? (conn.display_name ?? conn.nome_interno ?? conn.name ?? conn.display_phone ?? null) : null,
          connection_phone: conn?.display_phone ?? conn?.phone ?? null,
          connection_waba_id: conn?.waba_id ?? null,
          test_sends_count: testCount.get(c.id) ?? 0,
        }
      }),
    }
  })

// ---- Configurar infraestrutura da demanda (admin) ----
export const configureCampaignDemand = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z
      .object({
        campaign_id: z.string().uuid(),
        connection_id: z.string().uuid().nullish(),
        template_id: z.string().uuid().nullish(),
        scheduled_at: z.string().nullish(),
        name: z.string().trim().min(1).max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)

    const { data: camp } = await supabase
      .from('wa_campaigns')
      .select('id,workspace_id,connection_id,template_id,scheduled_at,name,status')
      .eq('id', data.campaign_id)
      .maybeSingle()
    if (!camp) throw new Error('Demanda não encontrada')

    const patch: Record<string, any> = {}
    if (data.connection_id !== undefined) patch['connection_id'] = data.connection_id ?? null
    if (data.template_id !== undefined) patch['template_id'] = data.template_id ?? null
    if (data.scheduled_at !== undefined) {
      patch['scheduled_at'] = data.scheduled_at ?? null
      if (data.scheduled_at && ['awaiting_approval', 'draft'].includes(camp.status)) patch['status'] = 'scheduled'
    }
    if (data.name) patch['name'] = data.name
    if (!Object.keys(patch).length) return { ok: true }

    const { error } = await supabase.from('wa_campaigns').update(patch).eq('id', camp.id)
    if (error) throw error

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    await supabaseAdmin.from('campaign_audit_log').insert({
      campaign_id: camp.id,
      workspace_id: camp.workspace_id,
      actor_id: userId,
      action: 'demand.configured',
      message: 'Infraestrutura definida pelo admin',
      from_data: {
        connection_id: camp.connection_id,
        template_id: camp.template_id,
        scheduled_at: camp.scheduled_at,
      },
      to_data: patch,
    } as any)

    return { ok: true }
  })

// ---- Decidir (aprovar / rejeitar) ----
export const decideCampaignApproval = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z
      .object({
        campaign_id: z.string().uuid(),
        decision: z.enum(['approved', 'rejected']),
        reason: z.string().trim().max(1000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)

    const { data: camp } = await supabase
      .from('wa_campaigns')
      .select('id,name,workspace_id,status,approval_status,total_recipients')
      .eq('id', data.campaign_id)
      .maybeSingle()
    if (!camp) throw new Error('Demanda não encontrada')
    if (data.decision === 'rejected' && (!data.reason || data.reason.length < 3)) {
      throw new Error('Informe a justificativa da rejeição')
    }
    if (data.decision === 'approved') {
      const { data: infra } = await supabase
        .from('wa_campaigns')
        .select('connection_id,template_id')
        .eq('id', data.campaign_id)
        .maybeSingle()
      if (!infra?.connection_id) throw new Error('Defina o número/conexão de envio antes de aprovar')
      if (!infra?.template_id) throw new Error('Defina o template do WhatsApp antes de aprovar')
      // Revalida o saldo do cliente no momento da aprovação (pode ter sido
      // consumido por outra campanha depois que a demanda foi criada).
      const required = Number(camp.total_recipients ?? 0)
      const isTestCampaign = (camp as any)?.custom_fields?.send_type === 'test'
      if (!isTestCampaign && required > 0 && camp.workspace_id) {
        await assertSufficientCredits(supabase, camp.workspace_id, required)
      }
    }

    const nowIso = new Date().toISOString()
    const patch =
      data.decision === 'approved'
        ? {
            status: 'queued',
            approval_status: 'approved',
            approved_by: userId,
            approved_at: nowIso,
            rejection_reason: null,
          }
        : {
            status: 'rejected',
            approval_status: 'rejected',
            approved_by: userId,
            approved_at: nowIso,
            rejection_reason: data.reason,
          }

    const { error } = await supabase.from('wa_campaigns').update(patch).eq('id', camp.id)
    if (error) throw error

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

    // Auditoria: quem decidiu, quando e a justificativa.
    await supabaseAdmin.from('campaign_audit_log').insert({
      campaign_id: camp.id,
      workspace_id: camp.workspace_id,
      actor_id: userId,
      action: data.decision === 'approved' ? 'approval.approved' : 'approval.rejected',
      message: data.reason ?? (data.decision === 'approved' ? 'Aprovada pelo admin' : null),
      from_data: { approval_status: camp.approval_status, status: camp.status },
      to_data: { ...patch, decided_at: nowIso },
    } as any)

    // Notificação para o cliente
    if (camp.workspace_id) {
      try {
        await supabaseAdmin.rpc('notify_workspace' as any, {
          _ws: camp.workspace_id,
          _kind: data.decision === 'approved' ? 'campaign.approved' : 'campaign.rejected',
          _title: data.decision === 'approved' ? 'Demanda aprovada' : 'Demanda rejeitada',
          _body:
            data.decision === 'approved'
              ? `Seu disparo "${camp.name}" foi aprovado e entrou na fila de envio.`
              : `Seu disparo "${camp.name}" foi rejeitado. Motivo: ${data.reason}`,
          _link: '/painel/demandas',
          _severity: data.decision === 'approved' ? 'success' : 'error',
          _metadata: { campaign_id: camp.id, reason: data.reason ?? null },
        })
      } catch {
        /* notificação não bloqueia a decisão */
      }
    }

    return { ok: true, decision: data.decision }
  })

// ---- Detalhe completo da demanda (preview fiel para o admin) ----
export const getDemandDetail = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaign_id: string }) => z.object({ campaign_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)

    const { data: camp, error } = await supabase
      .from('wa_campaigns')
      .select('*,workspaces(name)')
      .eq('id', data.campaign_id)
      .maybeSingle()
    if (error) throw error
    if (!camp) throw new Error('Demanda não encontrada')

    const [tplRes, connRes, listRes] = await Promise.all([
      camp.template_id
        ? supabase
            .from('whatsapp_templates')
            .select('id,name,language,category,status,body,footer,header_type,header_text,header_media_url,buttons,variables')
            .eq('id', camp.template_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      camp.connection_id
        ? supabase
            .from('whatsapp_connections')
            .select('id,display_name,nome_interno,name,display_phone,phone,waba_id,business_id')
            .eq('id', camp.connection_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      camp.list_id
        ? supabase.from('contact_lists').select('id,name').eq('id', camp.list_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { count: recipientsCount } = await supabaseAdmin
      .from('campaign_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', camp.id)

    const { data: sample } = await supabaseAdmin
      .from('campaign_recipients')
      .select('phone,variables')
      .eq('campaign_id', camp.id)
      .limit(1)
      .maybeSingle()

    const conn: any = (connRes as any)?.data ?? null
    return {
      campaign: {
        ...camp,
        workspace_name: camp.workspaces?.name ?? null,
      },
      template: (tplRes as any)?.data ?? null,
      list: (listRes as any)?.data ?? null,
      connection: conn
        ? {
            ...conn,
            label: conn.display_name ?? conn.nome_interno ?? conn.name ?? conn.display_phone ?? null,
            phone: conn.display_phone ?? conn.phone ?? null,
          }
        : null,
      recipients_count: recipientsCount ?? camp.total_recipients ?? 0,
      sample_recipient: sample ?? null,
    }
  })

// ---- Trilha de auditoria de uma demanda (admin) ----
export const getCampaignApprovalAudit = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaign_id: string }) => z.object({ campaign_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { data: rows, error } = await supabaseAdmin
      .from('campaign_audit_log')
      .select('id,action,message,actor_id,created_at,from_data,to_data')
      .eq('campaign_id', data.campaign_id)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw error

    const actorIds = [...new Set((rows ?? []).map((r: any) => r.actor_id).filter(Boolean))] as string[]
    const nameById = new Map<string, string>()
    if (actorIds.length) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id,full_name,email')
        .in('id', actorIds)
      for (const p of (profiles ?? []) as any[]) nameById.set(p.id, p.full_name || p.email || p.id)
    }
    return {
      entries: (rows ?? []).map((r: any) => ({ ...r, actor_name: r.actor_id ? (nameById.get(r.actor_id) ?? '—') : 'Sistema' })),
    }
  })

// ---- Demandas do cliente ----
export const listMyDemands = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace_id: string }) => z.object({ workspace_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertMember(supabase, userId, data.workspace_id)

    const { data: rows, error } = await supabase
      .from('wa_campaigns')
      .select(APPROVAL_FIELDS)
      .eq('workspace_id', data.workspace_id)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) throw error

    const campaigns = (rows ?? []) as any[]
    const ids = campaigns.map((c) => c.id)
    const auditByCampaign = new Map<string, any[]>()
    if (ids.length) {
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
      const { data: audit } = await supabaseAdmin
        .from('campaign_audit_log')
        .select('campaign_id,action,message,created_at')
        .in('campaign_id', ids)
        .in('action', ['approval.approved', 'approval.rejected'])
        .order('created_at', { ascending: false })
      for (const a of (audit ?? []) as any[]) {
        const arr = auditByCampaign.get(a.campaign_id) ?? []
        arr.push(a)
        auditByCampaign.set(a.campaign_id, arr)
      }
    }

    const listIds = [...new Set(campaigns.map((c) => c.list_id).filter(Boolean))]
    const { data: lists } = listIds.length
      ? await supabase.from('contact_lists').select('id,name').in('id', listIds)
      : { data: [] as any[] }
    const listName = new Map((lists ?? []).map((l: any) => [l.id, l.name]))

    return {
      items: campaigns.map((c) => ({
        ...c,
        list_name: c.list_id ? (listName.get(c.list_id) ?? null) : null,
        decisions: auditByCampaign.get(c.id) ?? [],
      })),
    }
  })
