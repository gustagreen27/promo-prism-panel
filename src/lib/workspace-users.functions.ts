import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import { z } from 'zod'

async function assertStaff(supabase: any, userId: string) {
  const { data } = await supabase.rpc('is_internal_staff', { _user: userId })
  if (!data) throw new Error('Apenas administradores internos')
}

const ROLES = ['owner', 'admin', 'operator', 'viewer'] as const

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function normalizeLoginSlug(raw: string | null | undefined): string | null {
  const s = (raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  if (!s) return null
  if (!SLUG_RE.test(s)) throw new Error('Slug de usuário inválido')
  return s
}

async function assertSlugAvailable(supabaseAdmin: any, slug: string, userId: string) {
  const { data: taken } = await supabaseAdmin
    .from('profiles').select('id').eq('login_slug', slug).neq('id', userId).maybeSingle()
  if (taken) throw new Error(`O usuário "${slug}" já está em uso por outro login`)
}

/** Lista os usuários (logins) vinculados a uma conta/empresa. */
export const adminListWorkspaceUsers = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace_id: string }) =>
    z.object({ workspace_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

    const { data: members, error } = await supabaseAdmin
      .from('workspace_members')
      .select('user_id, role, created_at')
      .eq('workspace_id', data.workspace_id)
    if (error) throw new Error(error.message)

    const ids = (members ?? []).map((m: any) => m.user_id)
    const profiles = ids.length
      ? (await supabaseAdmin.from('profiles').select('id, email, full_name, phone, login_slug').in('id', ids)).data ?? []
      : []
    const byId = new Map(profiles.map((p: any) => [p.id, p]))

    return (members ?? [])
      .map((m: any) => ({
        user_id: m.user_id,
        role: m.role as string,
        created_at: m.created_at as string | null,
        email: (byId.get(m.user_id) as any)?.email ?? null,
        full_name: (byId.get(m.user_id) as any)?.full_name ?? null,
        login_slug: (byId.get(m.user_id) as any)?.login_slug ?? null,
      }))
      .sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : (a.email ?? '').localeCompare(b.email ?? '')))
  })

/**
 * Cria (ou reutiliza) um usuário e vincula ao workspace informado.
 * Não exige CNPJ: basta e-mail + senha. O workspace criado automaticamente
 * no cadastro do usuário é removido quando está vazio, para que o login caia
 * direto no painel da empresa compartilhada.
 */
export const adminAddWorkspaceUser = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    workspace_id: string
    email: string
    full_name?: string | null
    password?: string | null
    role?: string | null
    login_slug?: string | null
  }) =>
    z.object({
      workspace_id: z.string().uuid(),
      email: z.string().email(),
      full_name: z.string().max(120).nullish(),
      password: z.string().min(8).max(72).nullish(),
      role: z.enum(ROLES).nullish(),
      login_slug: z.string().max(80).nullish(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

    const email = data.email.trim().toLowerCase()
    const role = (data.role ?? 'operator') as (typeof ROLES)[number]
    const loginSlug = normalizeLoginSlug(data.login_slug)

    const { data: ws } = await supabaseAdmin
      .from('workspaces').select('id, name').eq('id', data.workspace_id).maybeSingle()
    if (!ws) throw new Error('Conta não encontrada')

    let targetId: string | null = null
    let generatedPassword: string | null = null
    let createdUser = false

    const { data: existing } = await supabaseAdmin
      .from('profiles').select('id').eq('email', email).maybeSingle()

    if (existing) {
      targetId = existing.id
      if (data.password?.trim()) {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(targetId, { password: data.password.trim() })
        if (error) throw new Error(`Falha ao definir a senha: ${error.message}`)
      }
    } else {
      const password = data.password?.trim()
        || `Np${Math.random().toString(36).slice(2, 10)}!${Math.floor(Math.random() * 90 + 10)}`
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: data.full_name?.trim() || email.split('@')[0] },
      })
      if (createErr) throw new Error(`Falha ao criar usuário: ${createErr.message}`)
      targetId = created.user?.id ?? null
      createdUser = true
      generatedPassword = data.password?.trim() ? null : password
      if (targetId) {
        await supabaseAdmin.from('profiles').upsert({
          id: targetId,
          email,
          full_name: data.full_name?.trim() || email.split('@')[0],
        })
      }
    }
    if (!targetId) throw new Error('Não foi possível determinar o usuário')

    if (data.full_name?.trim()) {
      await supabaseAdmin.from('profiles').update({ full_name: data.full_name.trim() }).eq('id', targetId)
    }

    if (loginSlug) {
      await assertSlugAvailable(supabaseAdmin, loginSlug, targetId)
      const { error: slugErr } = await supabaseAdmin
        .from('profiles').update({ login_slug: loginSlug }).eq('id', targetId)
      if (slugErr) throw new Error(`Falha ao definir o usuário de login: ${slugErr.message}`)
    }

    // Vincula ao workspace da empresa
    const { error: linkErr } = await supabaseAdmin
      .from('workspace_members')
      .upsert({ workspace_id: data.workspace_id, user_id: targetId, role }, { onConflict: 'workspace_id,user_id' })
    if (linkErr) throw new Error(`Falha ao vincular usuário: ${linkErr.message}`)

    // Remove o workspace pessoal vazio criado automaticamente no cadastro
    const { data: owned } = await supabaseAdmin
      .from('workspaces')
      .select('id, workspace_wallets(balance_cents)')
      .eq('owner_id', targetId)
    for (const cand of owned ?? []) {
      if (cand.id === data.workspace_id) continue
      const wal: any = Array.isArray((cand as any).workspace_wallets)
        ? (cand as any).workspace_wallets[0]
        : (cand as any).workspace_wallets
      if (Number(wal?.balance_cents ?? 0) !== 0) continue
      const { count: campaigns } = await supabaseAdmin
        .from('wa_campaigns').select('id', { count: 'exact', head: true }).eq('workspace_id', cand.id)
      if ((campaigns ?? 0) > 0) continue
      const { count: others } = await supabaseAdmin
        .from('workspace_members').select('user_id', { count: 'exact', head: true })
        .eq('workspace_id', cand.id).neq('user_id', targetId)
      if ((others ?? 0) > 0) continue
      await supabaseAdmin.rpc('admin_purge_workspace', { _ws: cand.id })
    }

    return {
      ok: true,
      user_id: targetId,
      email,
      role,
      user_created: createdUser,
      generated_password: generatedPassword,
      workspace_name: ws.name,
      login_slug: loginSlug,
    }
  })

/** Lista TODOS os usuários da plataforma com a empresa (workspace) de cada um. */
export const adminListAllUsers = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

    const { data: profiles, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, phone, cnpj, login_slug, created_at')
      .order('created_at', { ascending: false })
      .limit(2000)
    if (error) throw new Error(error.message)

    const ids = (profiles ?? []).map((p: any) => p.id)
    const members = ids.length
      ? (await supabaseAdmin
          .from('workspace_members')
          .select('user_id, role, created_at, workspaces(id, name, slug)')
          .in('user_id', ids)).data ?? []
      : []

    const byUser = new Map<string, any[]>()
    for (const m of members as any[]) {
      const arr = byUser.get(m.user_id) ?? []
      arr.push(m)
      byUser.set(m.user_id, arr)
    }

    return (profiles ?? []).map((p: any) => ({
      user_id: p.id,
      email: p.email,
      full_name: p.full_name,
      phone: p.phone,
      login_slug: p.login_slug,
      created_at: p.created_at,
      memberships: (byUser.get(p.id) ?? []).map((m: any) => ({
        workspace_id: m.workspaces?.id ?? null,
        workspace_name: m.workspaces?.name ?? '—',
        workspace_slug: m.workspaces?.slug ?? null,
        role: m.role,
      })),
    }))
  })

/** Altera o papel de um usuário dentro da conta. */
export const adminUpdateWorkspaceUser = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace_id: string; user_id: string; role?: string | null; password?: string | null; full_name?: string | null; login_slug?: string | null }) =>
    z.object({
      workspace_id: z.string().uuid(),
      user_id: z.string().uuid(),
      role: z.enum(ROLES).nullish(),
      password: z.string().min(8).max(72).nullish(),
      full_name: z.string().max(120).nullish(),
      login_slug: z.string().max(80).nullish(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

    if (data.role) {
      const { error } = await supabaseAdmin
        .from('workspace_members')
        .update({ role: data.role })
        .eq('workspace_id', data.workspace_id)
        .eq('user_id', data.user_id)
      if (error) throw new Error(error.message)
    }
    if (data.password?.trim()) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, { password: data.password.trim() })
      if (error) throw new Error(`Falha ao alterar a senha: ${error.message}`)
    }
    if (data.full_name?.trim()) {
      await supabaseAdmin.from('profiles').update({ full_name: data.full_name.trim() }).eq('id', data.user_id)
    }
    if (data.login_slug !== undefined && data.login_slug !== null) {
      const slug = normalizeLoginSlug(data.login_slug)
      if (slug) {
        await assertSlugAvailable(supabaseAdmin, slug, data.user_id)
      }
      const { error: slugErr } = await supabaseAdmin
        .from('profiles').update({ login_slug: slug }).eq('id', data.user_id)
      if (slugErr) throw new Error(`Falha ao definir o usuário de login: ${slugErr.message}`)
    }
    return { ok: true }
  })

/** Desvincula um usuário da conta (opcionalmente exclui o login). */
export const adminRemoveWorkspaceUser = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace_id: string; user_id: string; delete_user?: boolean | null }) =>
    z.object({
      workspace_id: z.string().uuid(),
      user_id: z.string().uuid(),
      delete_user: z.boolean().nullish(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

    const { data: ws } = await supabaseAdmin
      .from('workspaces').select('id, owner_id').eq('id', data.workspace_id).maybeSingle()
    if (ws?.owner_id === data.user_id) {
      throw new Error('Não é possível remover o responsável da conta. Troque o responsável antes.')
    }

    const { error } = await supabaseAdmin
      .from('workspace_members')
      .delete()
      .eq('workspace_id', data.workspace_id)
      .eq('user_id', data.user_id)
    if (error) throw new Error(error.message)

    if (data.delete_user) {
      const { count } = await supabaseAdmin
        .from('workspace_members').select('workspace_id', { count: 'exact', head: true }).eq('user_id', data.user_id)
      if ((count ?? 0) === 0) {
        await supabaseAdmin.from('profiles').delete().eq('id', data.user_id)
        await supabaseAdmin.auth.admin.deleteUser(data.user_id)
      }
    }
    return { ok: true }
  })
