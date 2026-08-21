import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import { z } from 'zod'
import { assertSufficientCredits } from '@/lib/wallet-guard'
import { demandStage } from '@/lib/demand-stage'


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
  'id,name,workspace_id,project_id,status,approval_status,approval_mode,rejection_reason,approved_at,approved_by,total_recipients,scheduled_at,created_at,created_by,connection_id,template_id,list_id,custom_fields,variables_mapping,button_url_mapping,template_variables,execution_type,external_status,external_note,metrics_source,external_total_count,external_sent_count,external_delivered_count,external_failed_count,external_target_sent_count,external_target_delivered_count,external_target_failed_count,external_started_at,external_finished_at,external_updated_at,sent_count,delivered_count,failed_count,read_count,last_sent_at,updated_at'



// ---- Fila de aprovação (admin) ----
export const listApprovalQueue = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { status?: string } | undefined) =>
    z
      .object({
        status: z
          .enum(['pending', 'scheduled', 'queued', 'completed', 'rejected', 'all'])
          .default('pending'),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)
    const { data: rows, error } = await supabase
      .from('wa_campaigns')
      .select(`${APPROVAL_FIELDS},workspaces(name)`)
      .order('created_at', { ascending: false })
      .limit(400)
    if (error) throw error

    let campaigns = (rows ?? []) as any[]

    // Execução externa: transições automáticas por horário.
    {
      const nowIso = new Date().toISOString()
      // Agendada → Em fila quando chega o horário definido.
      const starting = campaigns.filter(
        (c) =>
          c.execution_type === 'external' &&
          c.external_status === 'scheduled_external' &&
          c.scheduled_at &&
          c.scheduled_at <= nowIso,
      )
      if (starting.length) {
        await supabase
          .from('wa_campaigns')
          .update({ external_status: 'in_progress' })
          .in('id', starting.map((c) => c.id))
        for (const c of starting) c.external_status = 'in_progress'
      }
      // Em fila → Finalizado ao atingir a finalização programada.
      const due = campaigns.filter(
        (c) =>
          c.execution_type === 'external' &&
          c.external_finished_at &&
          c.external_finished_at <= nowIso &&
          c.external_status !== 'completed' &&
          c.external_status !== 'cancelled',
      )
      if (due.length) {
        await supabase
          .from('wa_campaigns')
          .update({ external_status: 'completed' })
          .in('id', due.map((c) => c.id))
        for (const c of due) c.external_status = 'completed'
      }

      // Progressão automática das métricas (janelas de 10 minutos).
      const { applyExternalProgression } = await import('./external-progression.server')
      await applyExternalProgression(supabase, campaigns)
    }


    const counts = { pending: 0, scheduled: 0, queued: 0, completed: 0, rejected: 0 } as Record<string, number>
    for (const c of campaigns) counts[demandStage(c)] = (counts[demandStage(c)] ?? 0) + 1
    if (data.status !== 'all') campaigns = campaigns.filter((c) => demandStage(c) === data.status)
    campaigns = campaigns.slice(0, 200)

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
      counts,
      items: campaigns.map((c) => {
        const conn: any = c.connection_id ? connById.get(c.connection_id) : null
        return {
          ...c,
          stage: demandStage(c),
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
        execution_type: z.enum(['internal', 'external']).optional(),
        external_note: z.string().trim().max(2000).nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)

    const { data: camp } = await supabase
      .from('wa_campaigns')
      .select('id,workspace_id,connection_id,template_id,scheduled_at,name,status,execution_type,external_status,external_note')
      .eq('id', data.campaign_id)
      .maybeSingle()
    if (!camp) throw new Error('Demanda não encontrada')

    const patch: Record<string, any> = {}
    if (data.execution_type) patch['execution_type'] = data.execution_type
    if (data.external_note !== undefined) patch['external_note'] = data.external_note ?? null
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
        // Para onde a aprovação move a demanda: agendada ou direto para a fila.
        target: z.enum(['scheduled', 'queued']).optional(),
      })
      .parse(d),
  )

  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)

    const { data: camp } = await supabase
      .from('wa_campaigns')
      .select('id,name,workspace_id,status,approval_status,total_recipients,scheduled_at,custom_fields,connection_id,template_id,execution_type,reservation_id')
      .eq('id', data.campaign_id)
      .maybeSingle()
    if (!camp) throw new Error('Demanda não encontrada')
    if (data.decision === 'rejected' && (!data.reason || data.reason.length < 3)) {
      throw new Error('Informe a justificativa da rejeição')
    }
    // Idempotência: cliques repetidos em "Aprovar" não repetem o efeito.
    if (camp.approval_status === data.decision) {
      return { ok: true, decision: data.decision, already: true }
    }
    const isExternal = camp.execution_type === 'external'
    if (data.decision === 'approved' && !isExternal) {
      if (!camp.connection_id) throw new Error('Defina o número/conexão de envio antes de aprovar')
      if (!camp.template_id) throw new Error('Defina o template do WhatsApp antes de aprovar')
      // Revalida o saldo do cliente no momento da aprovação (pode ter sido
      // consumido por outra campanha depois que a demanda foi criada).
      const required = Number(camp.total_recipients ?? 0)
      const isTestCampaign = (camp as any)?.custom_fields?.send_type === 'test'
      if (!isTestCampaign && required > 0 && camp.workspace_id) {
        await assertSufficientCredits(supabase, camp.workspace_id, required)
      }
    }

    const nowIso = new Date().toISOString()
    const scheduledFuture = camp.scheduled_at ? new Date(camp.scheduled_at).getTime() > Date.now() : false
    // Aprovar não é um status: escolhe explicitamente Agendada ou Em fila.
    const goScheduled = data.target ? data.target === 'scheduled' : scheduledFuture
    const patch =
      data.decision === 'approved'
        ? isExternal
          ? {
              // Execução externa: não entra na fila da plataforma.
              status: 'draft',
              approval_status: 'approved',
              approved_by: userId,
              approved_at: nowIso,
              rejection_reason: null,
              external_status: goScheduled ? 'scheduled_external' : 'in_progress',
              ...(goScheduled ? {} : { external_started_at: nowIso }),
              metrics_source: 'manual',
            }
          : {
            status: goScheduled ? 'scheduled' : 'queued',
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

    // Update condicional: só aplica se o status de aprovação ainda for o mesmo
    // que lemos — evita corrida entre dois cliques/abas simultâneas.
    let updQuery = supabase.from('wa_campaigns').update(patch).eq('id', camp.id)
    updQuery = camp.approval_status === null
      ? updQuery.is('approval_status', null)
      : updQuery.eq('approval_status', camp.approval_status)
    const { data: updated, error } = await updQuery.select('id')
    if (error) throw error
    if (!updated || updated.length === 0) {
      return { ok: true, decision: data.decision, already: true }
    }

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

    // Rejeitou: devolve os créditos reservados no envio da campanha.
    if (data.decision === 'rejected' && (camp as any).reservation_id) {
      try {
        await supabaseAdmin.rpc('wallet_release_reservation' as any, {
          _reservation_id: (camp as any).reservation_id,
        })
        await supabaseAdmin.from('wa_campaigns').update({ reservation_id: null } as any).eq('id', camp.id)
      } catch {
        // não bloqueia a rejeição
      }
    }


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
              ? isExternal
                ? `Seu disparo "${camp.name}" foi aprovado e será executado pela nossa equipe.`
                : `Seu disparo "${camp.name}" foi aprovado e entrou na fila de envio.`
              : `Seu disparo "${camp.name}" foi rejeitado. Motivo: ${data.reason}`,
          _link: '/painel/demandas',
          _severity: data.decision === 'approved' ? 'success' : 'error',
          _metadata: { campaign_id: camp.id, reason: data.reason ?? null },
        })
      } catch {
        /* notificação não bloqueia a decisão */
      }
    }

    return { ok: true, decision: data.decision, external: isExternal }
  })

// ---- Status manual de execução externa (admin) ----
export const updateExternalExecution = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z
      .object({
        campaign_id: z.string().uuid(),
        external_status: z
          .enum(['scheduled_external', 'approved_external', 'in_progress', 'completed', 'cancelled'])
          .optional(),
        finalize_now: z.boolean().optional(),

        external_note: z.string().trim().max(2000).nullish(),
        external_total_count: z.number().int().min(0).max(100_000_000).nullish(),
        external_sent_count: z.number().int().min(0).max(100_000_000).nullish(),
        external_delivered_count: z.number().int().min(0).max(100_000_000).nullish(),
        external_failed_count: z.number().int().min(0).max(100_000_000).nullish(),
        external_started_at: z.string().nullish(),
        external_finished_at: z.string().nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)

    const { data: camp } = await supabase
      .from('wa_campaigns')
      .select(
        'id,workspace_id,execution_type,external_status,external_note,external_total_count,external_sent_count,external_delivered_count,external_failed_count,external_target_sent_count,external_target_delivered_count,external_target_failed_count,external_started_at,external_finished_at,scheduled_at,total_recipients',
      )
      .eq('id', data.campaign_id)
      .maybeSingle()
    if (!camp) throw new Error('Demanda não encontrada')
    if (camp.execution_type !== 'external') throw new Error('Esta demanda não está marcada como execução externa')

    const patch: Record<string, any> = {}
    if (data.external_status) patch['external_status'] = data.external_status
    if (data.external_note !== undefined) patch['external_note'] = data.external_note ?? null

    const METRIC_KEYS = [
      'external_total_count',
      'external_sent_count',
      'external_delivered_count',
      'external_failed_count',
    ] as const
    let touchedMetrics = false
    for (const k of METRIC_KEYS) {
      if (data[k] !== undefined) {
        patch[k] = data[k] ?? null
        touchedMetrics = true
      }
    }
    // Finalização é a única data configurável: o início vem do horário agendado
    // pelo cliente e o total vem da quantidade de leads da demanda.
    if (data.external_finished_at !== undefined) {
      patch['external_finished_at'] = data.external_finished_at
        ? new Date(data.external_finished_at as string).toISOString()
        : null
      touchedMetrics = true
    }
    if (touchedMetrics) {
      const autoStart =
        (camp as any).scheduled_at ?? camp.external_started_at ?? new Date().toISOString()
      patch['external_started_at'] = new Date(autoStart).toISOString()
      const autoTotal = (camp as any).total_recipients
      if (autoTotal != null) patch['external_total_count'] = autoTotal
    }

    if (touchedMetrics) {
      const val = (k: (typeof METRIC_KEYS)[number]) =>
        (patch[k] !== undefined ? patch[k] : (camp as any)[k]) as number | null
      const total = val('external_total_count')
      const sent = val('external_sent_count')
      const delivered = val('external_delivered_count')
      const failed = val('external_failed_count')

      if (total != null) {
        if (sent != null && sent > total) throw new Error('Enviados não podem ser maiores que o total.')
        if (failed != null && failed > total) throw new Error('Falhas não podem ser maiores que o total.')
        if (delivered != null && delivered > total) throw new Error('Entregues não podem ser maiores que o total.')
        if (sent != null && failed != null && sent + failed > total)
          throw new Error('Enviados + falhas não podem ultrapassar o total.')
      }
      if (delivered != null && sent != null && delivered > sent)
        throw new Error('Entregues não podem ser maiores que os enviados com sucesso.')

      const startedAt = patch['external_started_at'] !== undefined ? patch['external_started_at'] : camp.external_started_at
      const finishedAt =
        patch['external_finished_at'] !== undefined ? patch['external_finished_at'] : camp.external_finished_at
      if (startedAt && finishedAt && new Date(finishedAt) < new Date(startedAt))
        throw new Error('A finalização não pode ser anterior ao início.')

      // Os números informados são o RESULTADO FINAL previsto: viram alvos da
      // progressão automática (janelas de 10 min entre início e finalização).
      if (data.external_sent_count !== undefined) patch['external_target_sent_count'] = data.external_sent_count ?? null
      if (data.external_delivered_count !== undefined)
        patch['external_target_delivered_count'] = data.external_delivered_count ?? null
      if (data.external_failed_count !== undefined)
        patch['external_target_failed_count'] = data.external_failed_count ?? null

      patch['external_updated_at'] = new Date().toISOString()

      if (startedAt && finishedAt) {
        patch['metrics_source'] = 'estimated_external'
        const { externalProgressPatch } = await import('./external-progression')
        const merged = { ...(camp as any), ...patch, id: camp.id }
        // Enquanto a execução avança, os valores exibidos vêm da simulação.
        delete merged['external_sent_count']
        delete merged['external_delivered_count']
        delete merged['external_failed_count']
        const progress = externalProgressPatch(merged, new Date())
        if (progress) Object.assign(patch, progress)
      } else {
        patch['metrics_source'] = 'manual'
      }

      // Finalização no passado (ou já atingida) conclui a demanda automaticamente.
      if (finishedAt && new Date(finishedAt).getTime() <= Date.now() && !data.external_status) {
        patch['external_status'] = 'completed'
      }
    }

    // Finalização manual: grava o horário de término, aplica os valores finais e conclui.
    if (data.finalize_now) {
      const now = new Date().toISOString()
      patch['external_finished_at'] = now
      patch['external_status'] = 'completed'
      patch['external_updated_at'] = now
      const finalSent = patch['external_target_sent_count'] ?? (camp as any).external_target_sent_count
      const finalDelivered =
        patch['external_target_delivered_count'] ?? (camp as any).external_target_delivered_count
      const finalFailed = patch['external_target_failed_count'] ?? (camp as any).external_target_failed_count
      if (finalSent != null) patch['external_sent_count'] = finalSent
      if (finalDelivered != null) patch['external_delivered_count'] = Math.min(finalDelivered, finalSent ?? finalDelivered)
      if (finalFailed != null) patch['external_failed_count'] = finalFailed
    }


    if (!Object.keys(patch).length) return { ok: true }

    const { error } = await supabase.from('wa_campaigns').update(patch).eq('id', camp.id)
    if (error) throw error

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    await supabaseAdmin.from('campaign_audit_log').insert({
      campaign_id: camp.id,
      workspace_id: camp.workspace_id,
      actor_id: userId,
      action: touchedMetrics || data.finalize_now ? 'external.progress' : 'external.status_updated',
      message: data.external_note ?? null,
      from_data: {
        external_status: camp.external_status,
        external_note: camp.external_note,
        external_total_count: camp.external_total_count,
        external_sent_count: camp.external_sent_count,
        external_delivered_count: camp.external_delivered_count,
        external_failed_count: camp.external_failed_count,
      },
      to_data: patch,
    } as any)

    return { ok: true }
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
    // Progressão automática das execuções externas (janelas de 10 minutos).
    {
      const { applyExternalProgression } = await import('./external-progression.server')
      await applyExternalProgression(supabase, campaigns)
    }
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

    const { simulateExternal } = await import('./external-progression')
    return {
      items: campaigns.map(({ external_note: _adminOnly, ...c }: any) => ({
        ...c,
        stage: demandStage(c),
        next_update_at: c.execution_type === 'external' ? (simulateExternal(c)?.nextAt ?? null) : null,
        list_name: c.list_id ? (listName.get(c.list_id) ?? null) : null,
        decisions: auditByCampaign.get(c.id) ?? [],
      })),
    }
  })


// ---- Histórico de atualizações manuais da execução externa (admin) ----
export const listExternalProgress = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaign_id: string }) => z.object({ campaign_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { data: rows, error } = await supabaseAdmin
      .from('campaign_audit_log')
      .select('id,actor_id,created_at,to_data,message')
      .eq('campaign_id', data.campaign_id)
      .eq('action', 'external.progress')
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
      entries: (rows ?? []).map((r: any) => ({
        id: r.id,
        created_at: r.created_at,
        actor_name: r.actor_id ? (nameById.get(r.actor_id) ?? '—') : 'Sistema',
        message: r.message ?? null,
        total: r.to_data?.external_total_count ?? null,
        sent: r.to_data?.external_sent_count ?? null,
        delivered: r.to_data?.external_delivered_count ?? null,
        failed: r.to_data?.external_failed_count ?? null,
        status: r.to_data?.external_status ?? null,
      })),
    }
  })

