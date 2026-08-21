import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import { z } from 'zod'

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

    return {
      items: campaigns.map((c) => ({
        ...c,
        workspace_name: c.workspaces?.name ?? null,
        list_name: c.list_id ? (listName.get(c.list_id) ?? null) : null,
        template_name: c.template_id ? (tplName.get(c.template_id) ?? null) : null,
      })),
    }
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
