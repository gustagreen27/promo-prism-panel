import { ReactNode } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props<T> = {
  isLoading: boolean;
  error: unknown;
  data: T | undefined;
  onRetry?: () => void;
  children: (data: T) => ReactNode;
  loadingLabel?: string;
  /** Se true, considera `data` vazio (array vazio / null) como "sem dados"
   * e não chama `children`. Deixe false para deixar o próprio children decidir. */
  emptyIfNullish?: boolean;
  emptyRender?: () => ReactNode;
};

/**
 * Padrão único para carregamento/erro em páginas do /admin.
 * Nunca esconde erros por trás de `?? 0` ou `?? []` — se o backend falhar,
 * o usuário vê uma mensagem explícita e um botão "Tentar novamente".
 */
export function QueryState<T>({
  isLoading,
  error,
  data,
  onRetry,
  children,
  loadingLabel = "Carregando…",
  emptyIfNullish,
  emptyRender,
}: Props<T>) {
  if (isLoading && data === undefined) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border bg-card p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {loadingLabel}
      </div>
    );
  }
  if (error) {
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm">
        <div className="flex items-center gap-2 font-semibold text-destructive">
          <AlertCircle className="h-4 w-4" /> Não foi possível carregar os dados.
        </div>
        <p className="mt-1 text-xs text-muted-foreground break-words">{msg}</p>
        {onRetry && (
          <Button size="sm" variant="outline" className="mt-3" onClick={onRetry}>
            Tentar novamente
          </Button>
        )}
      </div>
    );
  }
  if (emptyIfNullish) {
    const empty =
      data == null ||
      (Array.isArray(data) && data.length === 0);
    if (empty) {
      return (
        emptyRender?.() ?? (
          <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
            Não há dados disponíveis.
          </div>
        )
      );
    }
  }
  return <>{children(data as T)}</>;
}

/** Card de erro isolado, para blocos internos de uma página. */
export function ErrorCard({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : "Erro desconhecido";
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
      <div className="flex items-center gap-2 font-semibold text-destructive">
        <AlertCircle className="h-4 w-4" /> Falha ao carregar
      </div>
      <p className="mt-1 text-xs text-muted-foreground break-words">{msg}</p>
      {onRetry && (
        <Button size="sm" variant="outline" className="mt-2" onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}
