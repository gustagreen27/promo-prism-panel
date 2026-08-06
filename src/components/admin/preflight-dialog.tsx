import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { preflightWaCampaign, startWaCampaign } from "@/lib/wa-campaigns.functions";

type Check = { key: string; label: string; status: "ok" | "warn" | "fail"; detail: string };

const ICONS = {
  ok: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  warn: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  fail: <XCircle className="h-4 w-4 text-destructive" />,
};

export function PreflightDialog({
  campaign,
  onOpenChange,
  onStarted,
}: {
  campaign: { id: string; name?: string | null } | null;
  onOpenChange: (open: boolean) => void;
  onStarted?: () => void;
}) {
  const preflightFn = useServerFn(preflightWaCampaign);
  const startFn = useServerFn(startWaCampaign);
  const [ack, setAck] = useState(false);

  useEffect(() => { setAck(false); }, [campaign?.id]);

  const q = useQuery({
    queryKey: ["wa-preflight", campaign?.id],
    queryFn: () => preflightFn({ data: { id: campaign!.id } }) as Promise<any>,
    enabled: !!campaign?.id,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });

  const startMut = useMutation({
    mutationFn: () => startFn({ data: { id: campaign!.id, confirm_warnings: true } }),
    onSuccess: () => {
      toast.success("Disparo autorizado e iniciado");
      onOpenChange(false);
      onStarted?.();
    },
    onError: (e: any) => toast.error(String(e?.message ?? "Erro ao iniciar").replace("NEEDS_CONFIRMATION::", "")),
  });

  const result = q.data as
    | { verdict: "green" | "yellow" | "red"; headline: string; checks: Check[]; quality_rating: string | null; number_status: string | null; messaging_limit_tier: string | null; checked_at: string }
    | undefined;

  const verdict = result?.verdict;
  const canStart = verdict === "green" || (verdict === "yellow" && ack);

  return (
    <Dialog open={!!campaign} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> Pré-check do disparo
          </DialogTitle>
          <DialogDescription>
            {campaign?.name ? `${campaign.name} — v` : "V"}erificação obrigatória da conta antes de liberar o envio.
          </DialogDescription>
        </DialogHeader>

        {q.isLoading && (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Consultando Meta (número, qualidade, WABA, template, limites)…
          </div>
        )}

        {q.isError && (
          <p className="py-6 text-sm text-destructive">{(q.error as any)?.message ?? "Falha ao rodar o pré-check."}</p>
        )}

        {result && (
          <div className="space-y-4">
            <div
              className={
                "rounded-md border p-3 text-sm font-medium " +
                (verdict === "green"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                  : verdict === "yellow"
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-600"
                    : "border-destructive/40 bg-destructive/10 text-destructive")
              }
            >
              {result.headline}
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              {result.number_status && <Badge variant="outline">status: {result.number_status}</Badge>}
              {result.quality_rating && <Badge variant="outline">qualidade: {result.quality_rating}</Badge>}
              {result.messaging_limit_tier && <Badge variant="outline">{result.messaging_limit_tier}</Badge>}
            </div>

            <ul className="space-y-2">
              {result.checks.map((c) => (
                <li key={c.key} className="flex gap-2 text-sm">
                  <span className="mt-0.5">{ICONS[c.status]}</span>
                  <span>
                    <span className="font-medium">{c.label}</span>
                    <span className="block text-xs text-muted-foreground">{c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>

            {verdict === "yellow" && (
              <label className="flex items-start gap-2 rounded-md border border-amber-500/40 p-3 text-sm">
                <input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                <span>Confirmo que li os alertas acima e autorizo o disparo mesmo assim.</span>
              </label>
            )}

            <p className="text-[11px] text-muted-foreground">
              Verificado em {new Date(result.checked_at).toLocaleString("pt-BR")}. A checagem continua durante a campanha
              (a cada ~45s) e o disparo é pausado automaticamente se a conta for restringida.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={"mr-2 h-4 w-4 " + (q.isFetching ? "animate-spin" : "")} /> Reverificar
          </Button>
          <Button onClick={() => startMut.mutate()} disabled={!canStart || startMut.isPending}>
            {startMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {verdict === "red" ? "Disparo bloqueado" : "Iniciar disparo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
