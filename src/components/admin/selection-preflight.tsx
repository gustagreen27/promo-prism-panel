import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { preflightSelection } from "@/lib/wa-campaigns.functions";

type Check = { key: string; label: string; status: "ok" | "warn" | "fail"; detail: string };
type Result = {
  verdict: "green" | "yellow" | "red";
  headline: string;
  checks: Check[];
  quality_rating: string | null;
  number_status: string | null;
  messaging_limit_tier: string | null;
  checked_at: string;
};

const ICONS = {
  ok: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  warn: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  fail: <XCircle className="h-4 w-4 text-destructive" />,
};

/**
 * Pré-check ao vivo do par número + template, exibido no wizard assim que a
 * seleção é feita (antes mesmo de a campanha existir).
 */
export function SelectionPreflight({
  connectionId,
  templateId,
  totalRecipients,
  onVerdict,
}: {
  connectionId: string;
  templateId: string;
  totalRecipients?: number;
  onVerdict?: (v: Result["verdict"] | null) => void;
}) {
  const fn = useServerFn(preflightSelection);
  const enabled = !!connectionId && !!templateId;

  const q = useQuery({
    queryKey: ["wa-selection-preflight", connectionId, templateId, totalRecipients ?? 0],
    queryFn: async () => {
      const r = (await fn({
        data: { connection_id: connectionId, template_id: templateId, total_recipients: totalRecipients ?? 0 },
      })) as Result;
      onVerdict?.(r.verdict);
      return r;
    },
    enabled,
    refetchOnWindowFocus: false,
    staleTime: 45_000,
  });

  if (!enabled) return null;
  const r = q.data;
  const verdict = r?.verdict;

  return (
    <div
      className={
        "rounded-lg border p-3 space-y-3 " +
        (verdict === "green"
          ? "border-emerald-500/40 bg-emerald-500/5"
          : verdict === "yellow"
            ? "border-amber-500/40 bg-amber-500/5"
            : verdict === "red"
              ? "border-destructive/40 bg-destructive/5"
              : "")
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4" /> Pré-check da conta (Meta)
        </div>
        <Button size="sm" variant="ghost" onClick={() => q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={"mr-1 h-3.5 w-3.5 " + (q.isFetching ? "animate-spin" : "")} /> Reverificar
        </Button>
      </div>

      {q.isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Consultando número, qualidade, WABA, template e limites…
        </div>
      )}

      {q.isError && (
        <p className="text-xs text-destructive">{(q.error as any)?.message ?? "Falha ao rodar o pré-check."}</p>
      )}

      {r && (
        <>
          <div className="text-sm font-medium">{r.headline}</div>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {r.number_status && <Badge variant="outline">status: {r.number_status}</Badge>}
            {r.quality_rating && <Badge variant="outline">qualidade: {r.quality_rating}</Badge>}
            {r.messaging_limit_tier && <Badge variant="outline">{r.messaging_limit_tier}</Badge>}
          </div>
          <ul className="space-y-1.5">
            {r.checks.map((c) => (
              <li key={c.key} className="flex gap-2 text-xs">
                <span className="mt-0.5">{ICONS[c.status]}</span>
                <span>
                  <span className="font-medium">{c.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground">
            Verificado em {new Date(r.checked_at).toLocaleString("pt-BR")}.
            {verdict === "red" && " Troque o número ou o template para continuar."}
          </p>
        </>
      )}
    </div>
  );
}
