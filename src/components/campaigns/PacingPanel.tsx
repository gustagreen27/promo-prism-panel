import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Pause, Play, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getWaCampaign, pauseWaCampaign, startWaCampaign, cancelWaCampaign } from "@/lib/wa-campaigns.functions";

function fmtWait(s: number | null | undefined) {
  if (s == null) return "—";
  return s >= 120 ? `${Math.round(s / 60)} min (${s}s)` : `${s}s`;
}

/** Painel ao vivo do Ritmo de envio: ciclo, sorteios, progresso e próximo envio. */
export function PacingPanel({ id }: { id: string }) {
  const getFn = useServerFn(getWaCampaign);
  const pauseFn = useServerFn(pauseWaCampaign);
  const startFn = useServerFn(startWaCampaign);
  const cancelFn = useServerFn(cancelWaCampaign);
  const q = useQuery({ queryKey: ["pacing", id], queryFn: () => getFn({ data: { id } }), refetchInterval: 3000 });
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const act = useMutation({
    mutationFn: async (a: "pause" | "resume" | "cancel") => {
      if (a === "pause") return pauseFn({ data: { id } });
      if (a === "resume") return startFn({ data: { id, confirm_warnings: true } });
      return cancelFn({ data: { id } });
    },
    onSuccess: () => q.refetch(),
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const c: any = q.data;
  if (!c?.pacing_enabled) return null;
  const s = c.pacing_state ?? {};
  const cfg = c.pacing_config ?? {};
  const total = c.total_recipients ?? 0;
  const done = (c.sent_count ?? 0) + (c.failed_count ?? 0);
  const nextMs = c.pacing_next_at ? new Date(c.pacing_next_at).getTime() : null;
  const remaining = nextMs ? Math.max(0, Math.round((nextMs - now) / 1000)) : null;
  const running = c.status === "running";
  const finished = ["completed", "cancelled", "error"].includes(c.status);

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4" data-testid="pacing-panel">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Ritmo de envio — ao vivo</div>
        <span className="text-xs text-muted-foreground">Status: {c.status}{c.pause_reason ? ` (${c.pause_reason})` : ""}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
        <div><div className="text-xs text-muted-foreground">Ciclo atual</div><b>{s.cycle ?? "—"}</b> {s.phase === "pause" ? "(em pausa)" : ""}</div>
        <div><div className="text-xs text-muted-foreground">Mensagens do ciclo (sorteado)</div><b>{s.cycle_sent ?? 0}/{s.cycle_target ?? "—"}</b></div>
        <div><div className="text-xs text-muted-foreground">Progresso da lista</div><b>{done}/{total}</b></div>
        <div><div className="text-xs text-muted-foreground">Último intervalo sorteado</div><b>{fmtWait(s.last_interval_s)}</b></div>
        <div><div className="text-xs text-muted-foreground">Última pausa sorteada</div><b>{fmtWait(s.last_pause_s)}</b></div>
        <div><div className="text-xs text-muted-foreground">Próximo envio</div>
          <b>{running && nextMs ? `${new Date(nextMs).toLocaleTimeString("pt-BR")} (em ${remaining}s)` : finished ? "—" : running ? "agora" : "pausado"}</b>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        Faixas: {cfg.msgs_min}–{cfg.msgs_max} msg/ciclo · intervalo {cfg.interval_min_s}–{cfg.interval_max_s}s · pausa {fmtWait(cfg.pause_min_s)}–{fmtWait(cfg.pause_max_s)}
      </div>
      {!finished && (
        <div className="flex gap-2">
          {running
            ? <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate("pause")}><Pause className="mr-1 h-4 w-4" />Pausar</Button>
            : <Button size="sm" variant="outline" disabled={act.isPending || c.status !== "paused"} onClick={() => act.mutate("resume")}><Play className="mr-1 h-4 w-4" />Retomar</Button>}
          <Button size="sm" variant="destructive" disabled={act.isPending} onClick={() => { if (confirm("Cancelar a demanda? Os pendentes não serão enviados.")) act.mutate("cancel"); }}><XCircle className="mr-1 h-4 w-4" />Cancelar</Button>
        </div>
      )}
    </div>
  );
}
