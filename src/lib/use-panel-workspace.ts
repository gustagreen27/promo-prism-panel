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
