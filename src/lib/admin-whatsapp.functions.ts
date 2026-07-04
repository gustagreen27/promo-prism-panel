import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import { z } from 'zod'

async function assertStaff(supabase: any, userId: string) {
  const { data } = await supabase.rpc('is_internal_staff', { _user: userId })
  if (!data) throw new Error('Acesso restrito a equipe interna')
}

// ---- Liberar número para workspace ----
export const grantNumberToWorkspace = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      connection_id: z.string().uuid(),
      workspace_id: z.string().uuid(),
      project_id: z.string().uuid().nullish(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)
    const { data: row, error } = await supabase
      .from('whatsapp_number_grants')
      .insert({ ...data, granted_by: userId })
      .select()
      .single()
    if (error) throw error
    return { grant: row }
  })

export const revokeNumberGrant = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { grant_id: string }) => z.object({ grant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)
    const { error } = await supabase.from('whatsapp_number_grants').delete().eq('id', data.grant_id)
    if (error) throw error
    return { ok: true }
  })

// ---- Liberar template para workspace/conexão ----
export const grantTemplateToWorkspace = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      template_id: z.string().uuid(),
      workspace_id: z.string().uuid().nullish(),
      connection_id: z.string().uuid().nullish(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)
    const { data: row, error } = await supabase
      .from('whatsapp_template_grants')
      .insert({ ...data, granted_by: userId })
      .select()
      .single()
    if (error) throw error
    return { grant: row }
  })

export const revokeTemplateGrant = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { grant_id: string }) => z.object({ grant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)
    const { error } = await supabase.from('whatsapp_template_grants').delete().eq('id', data.grant_id)
    if (error) throw error
    return { ok: true }
  })

// ---- Aprovar / Rejeitar campanha ----
export const approveCampaign = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaign_id: string }) => z.object({ campaign_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)
    const { error } = await supabase
      .from('wa_campaigns')
      .update({
        status: 'queued',
        approval_status: 'approved',
        approved_by: userId,
        approved_at: new Date().toISOString(),
      })
      .eq('id', data.campaign_id)
    if (error) throw error
    return { ok: true }
  })

export const rejectCampaign = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ campaign_id: z.string().uuid(), reason: z.string().min(3) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)
    const { error } = await supabase
      .from('wa_campaigns')
      .update({
        status: 'rejected',
        approval_status: 'rejected',
        rejection_reason: data.reason,
        approved_by: userId,
        approved_at: new Date().toISOString(),
      })
      .eq('id', data.campaign_id)
    if (error) throw error
    return { ok: true }
  })

// ---- Bloquear / desbloquear workspace ----
export const blockWorkspace = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ workspace_id: z.string().uuid(), reason: z.string().min(3) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)
    const { error } = await supabase
      .from('workspaces')
      .update({ blocked_at: new Date().toISOString(), block_reason: data.reason })
      .eq('id', data.workspace_id)
    if (error) throw error
    return { ok: true }
  })

export const unblockWorkspace = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace_id: string }) => z.object({ workspace_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)
    const { error } = await supabase
      .from('workspaces')
      .update({ blocked_at: null, block_reason: null })
      .eq('id', data.workspace_id)
    if (error) throw error
    return { ok: true }
  })

// ---- Revisar solicitação de template ----
export const reviewTemplateRequest = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      request_id: z.string().uuid(),
      decision: z.enum(['aprovado', 'rejeitado', 'enviado_meta']),
      admin_notes: z.string().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)
    const { error } = await supabase
      .from('whatsapp_template_requests')
      .update({
        status: data.decision,
        admin_notes: data.admin_notes,
        reviewed_at: new Date().toISOString(),
        reviewed_by: userId,
      })
      .eq('id', data.request_id)
    if (error) throw error
    return { ok: true }
  })
