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
    const { data } = await supabase.from('billing_settings').select('*').eq('id', 1).maybeSingle()
    return data ?? {
      default_price_cents: 15,
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
      supabase.from('billing_settings').select('*').eq('id', 1).maybeSingle(),
    ])
    const w = wallet ?? { balance_cents: 0, reserved_cents: 0, custom_price_cents: null, custom_minimum_messages: null }
    const defaultPrice = settings?.default_price_cents ?? 15
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
      supabase.from('billing_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('workspace_wallets').select('custom_price_cents, custom_minimum_messages').eq('workspace_id', data.workspace_id).maybeSingle(),
    ])
    const globalMinDeposit = settings?.minimum_deposit_cents ?? 15000
    const unitPrice = wallet?.custom_price_cents ?? settings?.default_price_cents ?? 15
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
  .inputValidator((d: { default_price_cents?: number; minimum_deposit_cents?: number }) =>
    z.object({
      default_price_cents: z.number().int().positive().optional(),
      minimum_deposit_cents: z.number().int().positive().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any
    await assertStaff(supabase, userId)
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: userId }
    if (data.default_price_cents !== undefined) patch.default_price_cents = data.default_price_cents
    if (data.minimum_deposit_cents !== undefined) patch.minimum_deposit_cents = data.minimum_deposit_cents
    const { data: row, error } = await supabase
      .from('billing_settings')
      .update(patch)
      .eq('id', 1)
      .select()
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
      .select('id, name, slug, plan, status, blocked_at, workspace_wallets(balance_cents, reserved_cents, custom_price_cents)')
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
