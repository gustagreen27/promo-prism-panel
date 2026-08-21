import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import { z } from 'zod'
import { normalizeBRPhone } from '@/lib/phone-normalize'

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

// ---------------- Admin: conexões liberadas para teste ----------------

export const adminListTestConnections = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({}).passthrough().parse(d ?? {}))
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)
    const { data, error } = await supabase
      .from('whatsapp_connections')
      .select('id, display_name, nome_interno, name, display_phone, phone, phone_number_id, waba_id, status, allow_tests')
      .order('display_name', { ascending: true })
    if (error) throw error
    return {
      connections: (data ?? []).map((c: any) => ({
        id: c.id,
        label: c.display_name ?? c.nome_interno ?? c.name ?? c.display_phone ?? c.phone ?? '—',
        phone: c.display_phone ?? c.phone ?? null,
        phone_number_id: c.phone_number_id ?? null,
        waba_id: c.waba_id ?? null,
        status: c.status ?? null,
        allow_tests: !!c.allow_tests,
      })),
    }
  })

export const adminSetConnectionTestFlag = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { connection_id: string; allow_tests: boolean }) =>
    z.object({ connection_id: z.string().uuid(), allow_tests: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { error } = await supabaseAdmin
      .from('whatsapp_connections')
      .update({ allow_tests: data.allow_tests } as any)
      .eq('id', data.connection_id)
    if (error) throw error
    return { ok: true }
  })

// ---------------- Cliente: opções e histórico ----------------

export const listTestOptions = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace_id: string }) => z.object({ workspace_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertMember(supabase, userId, data.workspace_id)

    const { data: campaigns } = await supabase
      .from('wa_campaigns')
      .select('id,name,template_id,status,approval_status,created_at,template_variables')
      .eq('workspace_id', data.workspace_id)
      .order('created_at', { ascending: false })
      .limit(50)

    const { data: templates } = await supabase
      .from('v_client_templates')
      .select('*')
      .or(`workspace_id.eq.${data.workspace_id},workspace_id.is.null`)

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { count } = await supabaseAdmin
      .from('wa_test_sends')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', data.workspace_id)

    return {
      campaigns: (campaigns ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        template_id: c.template_id,
        status: c.status,
        approval_status: c.approval_status,
      })),
      templates: (templates ?? []).map((t: any) => ({
        id: t.id,
        name: t.name,
        language: t.language,
        body: t.body ?? null,
      })),
      total_tests: count ?? 0,
    }
  })

export const listTestSends = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace_id: string; campaign_id?: string | null }) =>
    z.object({ workspace_id: z.string().uuid(), campaign_id: z.string().uuid().nullish() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertMember(supabase, userId, data.workspace_id)
    let q = supabase
      .from('wa_test_sends')
      .select('id,campaign_id,template_id,phone,status,error_message,error_code,created_at,updated_at')
      .eq('workspace_id', data.workspace_id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (data.campaign_id) q = q.eq('campaign_id', data.campaign_id)
    const { data: rows, error } = await q
    if (error) throw error
    return { items: rows ?? [] }
  })

// ---------------- Cliente: enviar teste imediato ----------------

export const sendCampaignTest = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z
      .object({
        workspace_id: z.string().uuid(),
        campaign_id: z.string().uuid().nullish(),
        template_id: z.string().uuid().nullish(),
        phones: z.array(z.string()).min(1).max(5),
        variables: z.record(z.string(), z.string()).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertMember(supabase, userId, data.workspace_id)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

    // 1) Normaliza os números (62991301856 -> 5562991301856)
    const normalized: Array<{ raw: string; phone: string | null; reason?: string }> = data.phones
      .map((p: string) => p.trim())
      .filter(Boolean)
      .map((raw: string) => {
        const n = normalizeBRPhone(raw)
        return { raw, phone: n.phone, reason: n.reason }
      })
    const valid = normalized.filter((n) => n.phone)
    if (!valid.length) throw new Error('Nenhum número de teste válido informado')

    // 2) Campanha (opcional) para herdar template/variáveis
    let campaign: any = null
    if (data.campaign_id) {
      const { data: c } = await supabase
        .from('wa_campaigns')
        .select('id,workspace_id,template_id,connection_id,template_variables,button_url_mapping,custom_fields')
        .eq('id', data.campaign_id)
        .maybeSingle()
      if (!c || c.workspace_id !== data.workspace_id) throw new Error('Campanha não encontrada')
      campaign = c
    }

    const templateId = data.template_id ?? campaign?.template_id ?? null
    if (!templateId) {
      throw new Error('Selecione um template aprovado para o envio de teste')
    }

    // Template precisa estar liberado para o workspace
    const { data: tplGrant } = await supabase
      .from('whatsapp_template_grants')
      .select('id')
      .eq('template_id', templateId)
      .or(`workspace_id.eq.${data.workspace_id},workspace_id.is.null`)
      .limit(1)
      .maybeSingle()
    const { data: staff } = await supabase.rpc('is_internal_staff', { _user: userId })
    if (!tplGrant && !staff) throw new Error('Este template não está liberado para a sua conta')

    const { data: tpl } = await supabaseAdmin
      .from('whatsapp_templates')
      .select('*')
      .eq('id', templateId)
      .maybeSingle()
    if (!tpl) throw new Error('Template não encontrado')

    // 3) Conexão: SOMENTE números marcados pelo admin como "permitido para testes".
    let conn: any = null
    if (campaign?.connection_id) {
      const { data: c } = await supabaseAdmin
        .from('whatsapp_connections')
        .select('*')
        .eq('id', campaign.connection_id)
        .maybeSingle()
      if (c && (c as any).allow_tests) conn = c
    }
    if (!conn) {
      const { data: granted } = await supabaseAdmin
        .from('whatsapp_number_grants')
        .select('connection_id')
        .eq('workspace_id', data.workspace_id)
      const grantedIds = (granted ?? []).map((g: any) => g.connection_id).filter(Boolean)
      if (grantedIds.length) {
        const { data: c } = await supabaseAdmin
          .from('whatsapp_connections')
          .select('*')
          .eq('allow_tests', true)
          .in('id', grantedIds)
          .limit(1)
          .maybeSingle()
        conn = c ?? null
      }
    }
    if (!conn) {
      const { data: c } = await supabaseAdmin
        .from('whatsapp_connections')
        .select('*')
        .eq('allow_tests', true)
        .limit(1)
        .maybeSingle()
      conn = c ?? null
    }
    if (!conn?.phone_number_id) {
      throw new Error('Nenhum número liberado para testes. Solicite a liberação ao suporte.')
    }

    const { resolveConnectionToken } = await import('@/lib/meta/wa-waba-token.server')
    const accessToken = await resolveConnectionToken(supabaseAdmin, conn as any)
    if (!accessToken) throw new Error('Número de teste sem credenciais válidas. Fale com o suporte.')

    const { resolveGraphVersion } = await import('@/lib/meta/graph-version')
    const { sendTemplateMessage } = await import('@/lib/wa-send.server')

    const variables: Record<string, string> = {
      ...((campaign?.template_variables as Record<string, string>) ?? {}),
      ...((data.variables as Record<string, string>) ?? {}),
    }
    const headerType = (tpl as any).header_type ?? null
    const headerValue = variables['_header_image_url'] ?? (tpl as any).header_url ?? null

    const results: Array<{ phone: string; status: string; error?: string | null; id: string | null }> = []

    for (const item of valid) {
      const phone = item.phone as string
      const { data: row } = await supabaseAdmin
        .from('wa_test_sends')
        .insert({
          workspace_id: data.workspace_id,
          campaign_id: campaign?.id ?? null,
          connection_id: conn.id,
          template_id: templateId,
          phone,
          phone_raw: item.raw,
          status: 'sending',
          created_by: userId,
        } as any)
        .select('id')
        .maybeSingle()
      const rowId = (row?.id ?? '') as string

      try {
        const res = await sendTemplateMessage({
          phoneNumberId: conn.phone_number_id,
          accessToken,
          graphVersion: resolveGraphVersion(conn.graph_api_version),
          to: phone,
          templateName: tpl.name,
          languageCode: tpl.language || 'pt_BR',
          variables,
          headerType,
          headerValue,
        })
        if (res.ok) {
          await supabaseAdmin
            .from('wa_test_sends')
            .update({ status: 'sent', meta_message_id: res.wamid ?? res.metaMessageId ?? null } as any)
            .eq('id', rowId)
          results.push({ id: row?.id ?? null, phone, status: 'sent' })
        } else {
          await supabaseAdmin
            .from('wa_test_sends')
            .update({ status: 'failed', error_message: res.error, error_code: res.code ?? null } as any)
            .eq('id', rowId)
          results.push({ id: row?.id ?? null, phone, status: 'failed', error: res.error })
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Falha no envio'
        await supabaseAdmin
          .from('wa_test_sends')
          .update({ status: 'failed', error_message: msg } as any)
          .eq('id', rowId)
        results.push({ id: row?.id ?? null, phone, status: 'failed', error: msg })
      }
    }

    const invalid = normalized.filter((n) => !n.phone).map((n) => ({ raw: n.raw, reason: n.reason ?? 'Número inválido' }))
    return { results, invalid, connection: { id: conn.id, phone: conn.display_phone ?? conn.phone ?? null } }
  })
