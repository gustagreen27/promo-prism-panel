import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import { z } from 'zod'

async function assertMember(supabase: any, userId: string, workspaceId: string) {
  const { data } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!data) throw new Error('Sem permissão para este workspace')
}

async function assertStaff(supabase: any, userId: string) {
  const { data } = await supabase.rpc('is_internal_staff', { _user: userId })
  if (!data) throw new Error('Apenas administradores internos')
}

// ---------- Público / cliente ----------

export const getBillingSettings = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as any
    const { data } = await supabase.from('billing_settings').select('id, default_price_cents, minimum_deposit_cents, default_minimum_messages, currency').eq('id', 1).maybeSingle()
    return data ?? {
      default_price_cents: 20,
      minimum_deposit_cents: 15000,
      default_minimum_messages: 2500,
      currency: 'BRL',
    }
  })

export const getMyWallet = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace_id: string }) =>
    z.object({ workspace_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertMember(supabase, userId, data.workspace_id)
    const [{ data: wallet }, { data: settings }] = await Promise.all([
      supabase.from('workspace_wallets').select('*').eq('workspace_id', data.workspace_id).maybeSingle(),
      supabase.from('billing_settings').select('id, default_price_cents, minimum_deposit_cents, default_minimum_messages, currency').eq('id', 1).maybeSingle(),
    ])
    const w = wallet ?? { balance_cents: 0, reserved_cents: 0, custom_price_cents: null, custom_minimum_messages: null }
    const defaultPrice = settings?.default_price_cents ?? 20
    const defaultMin = settings?.default_minimum_messages ?? 2500
    const globalMinDeposit = settings?.minimum_deposit_cents ?? 15000
    const unit_price_cents = w.custom_price_cents ?? defaultPrice
    const minimum_messages = w.custom_minimum_messages ?? defaultMin
    const required_deposit_cents = Math.max(globalMinDeposit, unit_price_cents * minimum_messages)
    return {
      balance_cents: Number(w.balance_cents ?? 0),
      reserved_cents: Number(w.reserved_cents ?? 0),
      available_cents: Number(w.balance_cents ?? 0) - Number(w.reserved_cents ?? 0),
      unit_price_cents,
      minimum_deposit_cents: globalMinDeposit,
      minimum_messages,
      required_deposit_cents,
      currency: settings?.currency ?? 'BRL',
    }
  })

export const listMyTransactions = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace_id: string; limit?: number; type?: string | null }) =>
    z.object({
      workspace_id: z.string().uuid(),
      limit: z.number().int().min(1).max(200).default(50),
      type: z.string().nullish(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertMember(supabase, userId, data.workspace_id)
    let q = supabase
      .from('wallet_transactions')
      .select('*')
      .eq('workspace_id', data.workspace_id)
      .order('created_at', { ascending: false })
      .limit(data.limit)
    if (data.type) q = q.eq('type', data.type)
    const { data: rows, error } = await q
    if (error) throw error
    return rows ?? []
  })

export const listMyDeposits = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace_id: string }) =>
    z.object({ workspace_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertMember(supabase, userId, data.workspace_id)
    const { data: rows, error } = await supabase
      .from('deposits')
      .select('*')
      .eq('workspace_id', data.workspace_id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error
    return rows ?? []
  })

// Cria pedido de depósito. Stripe ainda não está ativado — retorna deposit "pending"
// e um erro amigável no lugar do checkout_url. Quando Stripe estiver ativo,
// substituir por criação de Checkout Session.
export const createDepositCheckout = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace_id: string; amount_cents: number }) =>
    z.object({
      workspace_id: z.string().uuid(),
      amount_cents: z.number().int().positive(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertMember(supabase, userId, data.workspace_id)
    const [{ data: settings }, { data: wallet }] = await Promise.all([
      supabase.from('billing_settings').select('id, default_price_cents, minimum_deposit_cents, default_minimum_messages, currency').eq('id', 1).maybeSingle(),
      supabase.from('workspace_wallets').select('custom_price_cents, custom_minimum_messages').eq('workspace_id', data.workspace_id).maybeSingle(),
    ])
    const globalMinDeposit = settings?.minimum_deposit_cents ?? 15000
    const unitPrice = wallet?.custom_price_cents ?? settings?.default_price_cents ?? 20
    const minMessages = wallet?.custom_minimum_messages ?? settings?.default_minimum_messages ?? 2500
    const minimum = Math.max(globalMinDeposit, unitPrice * minMessages)
    if (data.amount_cents < minimum) {
      throw new Error(
        `Valor mínimo de depósito para este workspace é R$ ${(minimum / 100).toFixed(2).replace('.', ',')} (${minMessages.toLocaleString('pt-BR')} mensagens × R$ ${(unitPrice / 100).toFixed(2).replace('.', ',')}).`,
      )
    }
    const { data: deposit, error } = await supabase
      .from('deposits')
      .insert({
        workspace_id: data.workspace_id,
        amount_cents: data.amount_cents,
        status: 'pending',
        provider: 'stripe',
        created_by: userId,
      })
      .select()
      .single()
    if (error) throw error

    // TODO: quando Stripe for ativado (enable_stripe_payments), criar
    // um Checkout Session aqui e retornar { checkout_url }.
    return {
      deposit,
      checkout_url: null as string | null,
      pending_setup: true as const,
      message:
        'Pagamento online ainda não foi ativado. Envie o comprovante de pagamento ao suporte com o ID abaixo e o saldo será liberado.',
    }
  })

// ---------- Admin ----------

export const adminUpdateBillingSettings = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    default_price_cents?: number
    minimum_deposit_cents?: number
    default_minimum_messages?: number
  }) =>
    z.object({
      default_price_cents: z.number().int().positive().optional(),
      minimum_deposit_cents: z.number().int().positive().optional(),
      default_minimum_messages: z.number().int().positive().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: userId }
    if (data.default_price_cents !== undefined) patch.default_price_cents = data.default_price_cents
    if (data.minimum_deposit_cents !== undefined) patch.minimum_deposit_cents = data.minimum_deposit_cents
    if (data.default_minimum_messages !== undefined) patch.default_minimum_messages = data.default_minimum_messages
    const { data: row, error } = await supabase
      .from('billing_settings')
      .update(patch)
      .eq('id', 1)
      .select('id, default_price_cents, minimum_deposit_cents, default_minimum_messages, currency')
      .single()
    if (error) throw error
    return row
  })

export const adminListWorkspacesWithBalance = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)
    const { data, error } = await supabase
      .from('workspaces')
      .select('id, name, slug, plan, status, blocked_at, workspace_wallets(balance_cents, reserved_cents, custom_price_cents, custom_minimum_messages)')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  })

export const adminSetCustomPrice = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace_id: string; custom_price_cents: number | null }) =>
    z.object({
      workspace_id: z.string().uuid(),
      custom_price_cents: z.number().int().positive().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)
    const { error } = await supabase
      .from('workspace_wallets')
      .upsert({ workspace_id: data.workspace_id, custom_price_cents: data.custom_price_cents, updated_at: new Date().toISOString() })
    if (error) throw error
    return { ok: true }
  })

export const adminSetCustomMinimumMessages = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace_id: string; custom_minimum_messages: number | null }) =>
    z.object({
      workspace_id: z.string().uuid(),
      custom_minimum_messages: z.number().int().positive().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)
    const { error } = await supabase
      .from('workspace_wallets')
      .upsert({ workspace_id: data.workspace_id, custom_minimum_messages: data.custom_minimum_messages, updated_at: new Date().toISOString() })
    if (error) throw error
    return { ok: true }
  })

export const adminAdjustWallet = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace_id: string; amount_cents: number; description: string }) =>
    z.object({
      workspace_id: z.string().uuid(),
      amount_cents: z.number().int().refine((v) => v !== 0, 'valor não pode ser zero'),
      description: z.string().min(3).max(255),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)
    if (data.amount_cents > 0) {
      const { error } = await supabase.rpc('wallet_credit', {
        _ws: data.workspace_id,
        _amount_cents: data.amount_cents,
        _type: 'adjustment',
        _description: data.description,
        _campaign_id: null,
        _deposit_id: null,
        _created_by: userId,
      })
      if (error) throw error
    } else {
      const { error } = await supabase.rpc('wallet_debit', {
        _ws: data.workspace_id,
        _amount_cents: Math.abs(data.amount_cents),
        _type: 'adjustment',
        _description: data.description,
        _campaign_id: null,
        _recipient_id: null,
        _created_by: userId,
        _allow_negative: true,
      })
      if (error) throw error
    }
    return { ok: true }
  })

export const adminListAllTransactions = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace_id?: string | null; type?: string | null; limit?: number }) =>
    z.object({
      workspace_id: z.string().uuid().nullish(),
      type: z.string().nullish(),
      limit: z.number().int().min(1).max(500).default(200),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)
    let q = supabase
      .from('wallet_transactions')
      .select('*, workspaces:workspace_id(name)')
      .order('created_at', { ascending: false })
      .limit(data.limit)
    if (data.workspace_id) q = q.eq('workspace_id', data.workspace_id)
    if (data.type) q = q.eq('type', data.type)
    const { data: rows, error } = await q
    if (error) throw error
    return rows ?? []
  })

export const adminMarkDepositPaid = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { deposit_id: string }) =>
    z.object({ deposit_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)
    const { data: deposit } = await supabase.from('deposits').select('*').eq('id', data.deposit_id).maybeSingle()
    if (!deposit) throw new Error('Depósito não encontrado')
    if (deposit.status === 'paid') return { ok: true, already: true }
    const { error: creditErr } = await supabase.rpc('wallet_credit', {
      _ws: deposit.workspace_id,
      _amount_cents: deposit.amount_cents,
      _type: 'deposit',
      _description: `Depósito ${deposit.id.slice(0, 8)} confirmado`,
      _campaign_id: null,
      _deposit_id: deposit.id,
      _created_by: userId,
    })
    if (creditErr) throw creditErr
    const { error } = await supabase
      .from('deposits')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', data.deposit_id)
    if (error) throw error
    return { ok: true }
  })

// ---------- Contas de clientes (admin) ----------

export const adminListClientAccounts = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)

    const [{ data: settings }, { data: workspaces, error }] = await Promise.all([
      supabase.from('billing_settings').select('default_price_cents').eq('id', 1).maybeSingle(),
      supabase
        .from('workspaces')
        .select('id, name, slug, plan, status, blocked_at, created_at, workspace_wallets(balance_cents, reserved_cents, custom_price_cents, custom_minimum_messages)')
        .order('created_at', { ascending: false }),
    ])
    if (error) throw error

    const defaultPrice = Number(settings?.default_price_cents ?? 20)
    const ids = (workspaces ?? []).map((w: any) => w.id)

    const membersByWs = new Map<string, any[]>()
    if (ids.length) {
      const { data: members } = await supabase
        .from('workspace_members')
        .select('workspace_id, role, user_id')
        .in('workspace_id', ids)
      const userIds = [...new Set((members ?? []).map((m: any) => m.user_id).filter(Boolean))]
      const profileById = new Map<string, any>()
      if (userIds.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', userIds)
        for (const pr of profs ?? []) profileById.set(pr.id, pr)
      }
      for (const m of (members ?? []).map((m: any) => ({ ...m, profile: profileById.get(m.user_id) ?? null }))) {
        const arr = membersByWs.get(m.workspace_id) ?? []
        arr.push(m)
        membersByWs.set(m.workspace_id, arr)
      }
    }

    return (workspaces ?? []).map((w: any) => {
      const wal = Array.isArray(w.workspace_wallets) ? (w.workspace_wallets[0] ?? {}) : (w.workspace_wallets ?? {})
      const unit = Number(wal?.custom_price_cents ?? defaultPrice) || defaultPrice
      const balance = Number(wal?.balance_cents ?? 0)
      const reserved = Number(wal?.reserved_cents ?? 0)
      const available = balance - reserved
      const members = membersByWs.get(w.id) ?? []
      const owner = members.find((m: any) => m.role === 'owner') ?? members[0] ?? null
      return {
        id: w.id,
        name: w.name,
        slug: w.slug,
        plan: w.plan,
        status: w.status,
        blocked_at: w.blocked_at,
        created_at: w.created_at,
        unit_price_cents: unit,
        balance_cents: balance,
        reserved_cents: reserved,
        available_cents: available,
        credits_available: unit > 0 ? Math.floor(available / unit) : 0,
        credits_reserved: unit > 0 ? Math.floor(reserved / unit) : 0,
        members_count: members.length,
        owner_name: owner?.profile?.full_name ?? null,
        owner_email: owner?.profile?.email ?? null,
      }
    })
  })

export const adminAddCredits = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace_id: string; mode: 'messages' | 'money'; quantity: number; description?: string; direction?: 'add' | 'remove' }) =>
    z.object({
      workspace_id: z.string().uuid(),
      mode: z.enum(['messages', 'money']),
      quantity: z.number().positive(),
      description: z.string().max(255).optional(),
      direction: z.enum(['add', 'remove']).default('add'),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)

    const [{ data: settings }, { data: wallet }] = await Promise.all([
      supabase.from('billing_settings').select('default_price_cents').eq('id', 1).maybeSingle(),
      supabase.from('workspace_wallets').select('custom_price_cents').eq('workspace_id', data.workspace_id).maybeSingle(),
    ])
    const unit = Number(wallet?.custom_price_cents ?? settings?.default_price_cents ?? 20) || 20

    const cents = data.mode === 'messages'
      ? Math.round(data.quantity) * unit
      : Math.round(data.quantity * 100)
    if (cents <= 0) throw new Error('Valor inválido')

    const description = data.description?.trim()
      || (data.mode === 'messages'
        ? `${data.direction === 'remove' ? 'Remoção' : 'Adição'} de ${Math.round(data.quantity).toLocaleString('pt-BR')} créditos (admin)`
        : `${data.direction === 'remove' ? 'Remoção' : 'Adição'} de saldo (admin)`)

    if (data.direction === 'remove') {
      const { error } = await supabase.rpc('wallet_debit', {
        _ws: data.workspace_id,
        _amount_cents: cents,
        _type: 'adjustment',
        _description: description,
        _campaign_id: null,
        _recipient_id: null,
        _created_by: userId,
        _allow_negative: true,
      })
      if (error) throw error
    } else {
      const { error } = await supabase.rpc('wallet_credit', {
        _ws: data.workspace_id,
        _amount_cents: cents,
        _type: 'adjustment',
        _description: description,
        _campaign_id: null,
        _deposit_id: null,
        _created_by: userId,
      })
      if (error) throw error
    }
    return { ok: true, amount_cents: cents, unit_price_cents: unit }
  })

export const adminCreateClientAccount = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    name: string
    slug?: string | null
    plan?: string | null
    owner_email: string
    owner_name?: string | null
    owner_password?: string | null
    initial_credits?: number | null
  }) =>
    z.object({
      name: z.string().min(2).max(120),
      slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/, 'slug inválido').nullish(),
      plan: z.string().max(40).nullish(),
      owner_email: z.string().email(),
      owner_name: z.string().max(120).nullish(),
      owner_password: z.string().min(8).max(72).nullish(),
      initial_credits: z.number().int().min(0).nullish(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

    const email = data.owner_email.trim().toLowerCase()
    const slug = (data.slug?.trim() || data.name)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60)

    const { data: slugTaken } = await supabaseAdmin
      .from('workspaces').select('id').eq('slug', slug).maybeSingle()
    if (slugTaken) throw new Error(`Já existe uma conta com o slug "${slug}"`)

    // 1) Encontra ou cria o usuário dono
    let ownerId: string | null = null
    let generatedPassword: string | null = null
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles').select('id').eq('email', email).maybeSingle()
    if (existingProfile) {
      ownerId = existingProfile.id
    } else {
      const password = data.owner_password?.trim() || `Np${Math.random().toString(36).slice(2, 10)}!${Math.floor(Math.random() * 90 + 10)}`
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: data.owner_name?.trim() || data.name },
      })
      if (createErr) throw new Error(`Falha ao criar usuário: ${createErr.message}`)
      ownerId = created.user?.id ?? null
      generatedPassword = data.owner_password?.trim() ? null : password
      if (ownerId) {
        await supabaseAdmin.from('profiles').upsert({
          id: ownerId,
          email,
          full_name: data.owner_name?.trim() || data.name,
        })
      }
    }
    if (!ownerId) throw new Error('Não foi possível determinar o usuário dono')

    // 2) Cria o workspace
    const { data: ws, error: wsErr } = await supabaseAdmin
      .from('workspaces')
      .insert({
        name: data.name.trim(),
        slug,
        plan: data.plan?.trim() || 'starter',
        status: 'active',
        owner_id: ownerId,
      })
      .select('id, name, slug, plan')
      .single()
    if (wsErr) throw new Error(`Falha ao criar a conta: ${wsErr.message}`)

    // 3) Vincula o dono como membro
    const { error: memberErr } = await supabaseAdmin
      .from('workspace_members')
      .upsert({ workspace_id: ws.id, user_id: ownerId, role: 'owner' }, { onConflict: 'workspace_id,user_id' })
    if (memberErr) throw new Error(`Conta criada, mas falhou ao vincular o usuário: ${memberErr.message}`)

    // 4) Créditos iniciais (opcional)
    let creditedCents = 0
    if (data.initial_credits && data.initial_credits > 0) {
      const { data: settings } = await supabaseAdmin
        .from('billing_settings').select('default_price_cents').eq('id', 1).maybeSingle()
      const { data: wallet } = await supabaseAdmin
        .from('workspace_wallets').select('custom_price_cents').eq('workspace_id', ws.id).maybeSingle()
      const unit = Number(wallet?.custom_price_cents ?? settings?.default_price_cents ?? 20) || 20
      creditedCents = data.initial_credits * unit
      const { error: credErr } = await supabaseAdmin.rpc('wallet_credit', {
        _ws: ws.id,
        _amount_cents: creditedCents,
        _type: 'adjustment',
        _description: `Créditos iniciais (${data.initial_credits.toLocaleString('pt-BR')}) na criação da conta`,
        _campaign_id: undefined,
        _deposit_id: undefined,
        _created_by: userId,
      })
      if (credErr) creditedCents = 0
    }

    return {
      ok: true,
      workspace: ws,
      owner_email: email,
      owner_created: !existingProfile,
      generated_password: generatedPassword,
      credited_cents: creditedCents,
    }
  })
