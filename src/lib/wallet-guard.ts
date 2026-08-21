/**
 * Fonte única das regras de crédito para disparos reais.
 *
 * Regras:
 * - Testes NUNCA consomem créditos (nenhuma função aqui é chamada no fluxo de teste).
 * - Rascunho é sempre permitido, mesmo sem saldo.
 * - Solicitar / agendar / aprovar / iniciar um disparo real exige saldo suficiente,
 *   sempre revalidado no backend no momento da ação (nunca só no frontend).
 */

export const TEST_RECIPIENTS_LIMIT = 10

const nf = (n: number) => new Intl.NumberFormat('pt-BR').format(Math.max(0, Math.round(n)))

export type WorkspaceCredits = {
  unitPriceCents: number
  balanceCents: number
  reservedCents: number
  availableCents: number
  availableCredits: number
}

/** Lê o saldo real (mesma fonte usada pelo painel e pelo admin). */
export async function getWorkspaceCredits(supabase: any, workspaceId: string): Promise<WorkspaceCredits> {
  const [{ data: wallet }, { data: settings }] = await Promise.all([
    supabase
      .from('workspace_wallets')
      .select('balance_cents, reserved_cents, custom_price_cents')
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
    supabase.from('billing_settings').select('default_price_cents').eq('id', 1).maybeSingle(),
  ])
  const unitPriceCents = Number(wallet?.custom_price_cents ?? settings?.default_price_cents ?? 20) || 20
  const balanceCents = Number(wallet?.balance_cents ?? 0)
  const reservedCents = Number(wallet?.reserved_cents ?? 0)
  const availableCents = balanceCents - reservedCents
  return {
    unitPriceCents,
    balanceCents,
    reservedCents,
    availableCents,
    availableCredits: Math.floor(availableCents / unitPriceCents),
  }
}

export class InsufficientCreditsError extends Error {
  available: number
  required: number
  constructor(available: number, required: number) {
    super(
      `Créditos insuficientes. Você possui ${nf(available)} créditos, mas esta campanha precisa de ${nf(
        required,
      )} créditos. Adicione mais créditos para continuar.`,
    )
    this.name = 'InsufficientCreditsError'
    this.available = available
    this.required = required
  }
}

/**
 * Bloqueia a ação quando o saldo atual não cobre a quantidade de contatos
 * válidos que realmente serão disparados.
 */
export async function assertSufficientCredits(
  supabase: any,
  workspaceId: string,
  requiredCredits: number,
): Promise<WorkspaceCredits> {
  const credits = await getWorkspaceCredits(supabase, workspaceId)
  const required = Math.max(0, Math.round(requiredCredits))
  if (required > 0 && credits.availableCredits < required) {
    throw new InsufficientCreditsError(credits.availableCredits, required)
  }
  return credits
}
