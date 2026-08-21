import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { getMyContext } from '@/lib/auth.functions'
import { getMyWallet } from '@/lib/billing.functions'

/**
 * Fonte única do workspace do cliente no painel.
 * Todas as páginas de /painel devem usar este hook — o layout `/painel` não
 * injeta `workspace` no route context, então `Route.useRouteContext()` retorna
 * undefined e as queries ficam desabilitadas (saldo aparecendo como 0).
 */
export function usePanelWorkspace() {
  const ctxFn = useServerFn(getMyContext)
  const { data, isLoading } = useQuery({
    queryKey: ['my-context'],
    queryFn: () => ctxFn(),
    staleTime: 30_000,
  })
  const workspace = (data as any)?.primary_workspace ?? null
  return {
    ctx: data ?? null,
    workspace,
    workspaceId: (workspace?.id ?? null) as string | null,
    isLoading,
  }
}

/**
 * Fonte única do saldo. Mesma queryKey em todo o painel (header, financeiro,
 * criação de disparo), então qualquer invalidação de ['wallet'] reflete em
 * todas as áreas — inclusive após o admin ajustar créditos.
 */
export function useWallet(workspaceId: string | null | undefined) {
  const walletFn = useServerFn(getMyWallet)
  const query = useQuery({
    queryKey: ['wallet', workspaceId],
    queryFn: () => walletFn({ data: { workspace_id: workspaceId as string } }),
    enabled: !!workspaceId,
    staleTime: 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })
  const w = query.data
  const unitPriceCents = w?.unit_price_cents || 20
  return {
    ...query,
    wallet: w ?? null,
    unitPriceCents,
    availableCredits: Math.floor((w?.available_cents ?? 0) / unitPriceCents),
    balanceCredits: Math.floor((w?.balance_cents ?? 0) / unitPriceCents),
    reservedCredits: Math.floor((w?.reserved_cents ?? 0) / unitPriceCents),
  }
}

/* -------------------------------------------------------------------------
 * Detecção de divergência de saldo entre superfícies (header vs financeiro).
 * Cada tela registra o valor que está exibindo; se duas superfícies mostrarem
 * números diferentes ao mesmo tempo, o hook devolve o conflito para exibirmos
 * um aviso de depuração em vez de o usuário ver saldos incoerentes.
 * ---------------------------------------------------------------------- */

type BalanceReading = { credits: number; at: number }
const balanceReadings = new Map<string, BalanceReading>()
const balanceListeners = new Set<() => void>()
const READING_TTL_MS = 60_000

export type BalanceDivergence = { surface: string; credits: number; mine: number }

export function useBalanceConsistency(
  surface: string,
  credits: number | null | undefined,
  enabled = true,
): BalanceDivergence | null {
  const [divergence, setDivergence] = useState<BalanceDivergence | null>(null)

  useEffect(() => {
    if (!enabled || credits == null) return
    balanceReadings.set(surface, { credits, at: Date.now() })

    const check = () => {
      const now = Date.now()
      const conflict = [...balanceReadings.entries()].find(
        ([s, r]) => s !== surface && now - r.at < READING_TTL_MS && r.credits !== credits,
      )
      setDivergence(conflict ? { surface: conflict[0], credits: conflict[1].credits, mine: credits } : null)
      if (conflict) {
        console.warn(
          `[saldo] Divergência detectada: "${surface}" mostra ${credits} créditos e "${conflict[0]}" mostra ${conflict[1].credits}.`,
        )
      }
    }

    balanceListeners.add(check)
    balanceListeners.forEach((l) => l())
    return () => {
      balanceListeners.delete(check)
      balanceReadings.delete(surface)
    }
  }, [surface, credits, enabled])

  return divergence
}
