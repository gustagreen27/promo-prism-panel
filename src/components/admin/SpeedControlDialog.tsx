import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Gauge, Info, Loader2 } from "lucide-react";
import { getCampaignSpeedLimits, updateCampaignSpeed } from "@/lib/wa-campaigns.functions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  campaignId: string;
  currentRate?: number | null;
  currentBatch?: number | null;
  currentJitter?: number | null;
  onSaved?: () => void;
};

const PRESETS = [
  { label: "Lenta", rate: 30, batch: 10, jitter: 1500 },
  { label: "Normal", rate: 120, batch: 25, jitter: 500 },
  { label: "Rápida", rate: 400, batch: 60, jitter: 0 },
  { label: "Máxima", rate: 1200, batch: 150, jitter: 0 },
];

export function SpeedControlDialog({
  open, onOpenChange, campaignId, currentRate, currentBatch, currentJitter, onSaved,
}: Props) {
  const [rate, setRate] = useState(30);
  const [batch, setBatch] = useState(25);
  const [jitter, setJitter] = useState(0);
  const save = useServerFn(updateCampaignSpeed);
  const fetchLimits = useServerFn(getCampaignSpeedLimits);

  const limitsQ = useQuery({
    queryKey: ["campaign-speed-limits", campaignId],
    queryFn: () => fetchLimits({ data: { id: campaignId } }),
    enabled: open,
    staleTime: 60_000,
  });
  const limits: any = limitsQ.data;
  const cap = Number(limits?.cap_rate_per_second ?? 0) || null;
  const capPerMin = cap ? cap * 60 : null;
  const requestedPerSecond = Math.max(1, Math.ceil(rate / 60));
  const willCap = !!cap && requestedPerSecond > cap;
  const nearCap = !!cap && !willCap && requestedPerSecond >= cap * 0.85;
  const quality = String(limits?.quality_rating ?? "").toUpperCase();
  const lowQuality = quality === "RED" || quality === "YELLOW" || quality === "LOW" || quality === "MEDIUM";
  const connSuspended = ["suspenso", "suspended", "restricted"].includes(
    String(limits?.connection_status ?? "").toLowerCase(),
  );
  const batchTooBig = !!cap && batch > cap * 20;

  useEffect(() => {
    if (!open) return;
    setRate(Number(currentRate ?? 30) || 30);
    setBatch(Number(currentBatch ?? 25) || 25);
    setJitter(Number(currentJitter ?? 0) || 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const m = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: campaignId,
          send_rate_per_min: Math.max(1, Math.min(6000, Math.round(rate))),
          batch_size: Math.max(1, Math.min(500, Math.round(batch))),
          jitter_ms: Math.max(0, Math.min(60000, Math.round(jitter))),
        },
      }),
    onSuccess: (r: any) => {
      const eff = r?.effective_rate_per_second;
      if (r?.capped) {
        toast.warning(
          `Velocidade salva, mas limitada pelo número: teto ~${r.cap_rate_per_second} msg/s (~${Number(r.cap_rate_per_second) * 60}/min)`,
        );
        onSaved?.();
        onOpenChange(false);
        return;
      }
      toast.success(
        eff
          ? `Velocidade atualizada — ~${eff} msg/s efetivo (vale no próximo ciclo)`
          : "Velocidade atualizada — vale já no próximo ciclo",
      );
      onSaved?.();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao atualizar velocidade"),

  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gauge className="h-4 w-4" /> Velocidade de disparo
          </DialogTitle>
          <DialogDescription>
            Ajuste ao vivo, sem pausar a campanha. A mudança vale no próximo ciclo de envio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Button
                key={p.label}
                type="button"
                size="sm"
                variant={rate === p.rate && batch === p.batch ? "default" : "outline"}
                onClick={() => { setRate(p.rate); setBatch(p.batch); setJitter(p.jitter); }}
              >
                {p.label} · {p.rate}/min
              </Button>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Taxa (msg/min)</Label>
              <Input
                type="number"
                min={1}
                max={6000}
                className="h-8 w-24 text-right"
                value={rate}
                onChange={(e) => setRate(Number(e.target.value) || 1)}
              />
            </div>
            <Slider value={[Math.min(rate, 2000)]} min={1} max={2000} step={10} onValueChange={(v) => setRate(v[0])} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Lote por ciclo</Label>
              <Input
                type="number"
                min={1}
                max={500}
                className="h-8 w-24 text-right"
                value={batch}
                onChange={(e) => setBatch(Number(e.target.value) || 1)}
              />
            </div>
            <Slider value={[Math.min(batch, 500)]} min={1} max={500} step={1} onValueChange={(v) => setBatch(v[0])} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Jitter (ms entre envios)</Label>
              <Input
                type="number"
                min={0}
                max={60000}
                className="h-8 w-24 text-right"
                value={jitter}
                onChange={(e) => setJitter(Number(e.target.value) || 0)}
              />
            </div>
            <Slider value={[Math.min(jitter, 5000)]} min={0} max={5000} step={100} onValueChange={(v) => setJitter(v[0])} />
          </div>

          {willCap && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Acima do teto do número</AlertTitle>
              <AlertDescription>
                {limits?.phone_label ? `${limits.phone_label} ` : "Este número "}
                aceita no máximo ~{cap} msg/s (~{capPerMin}/min). Você pediu {rate}/min
                (~{requestedPerSecond} msg/s) — o excedente será descartado pelo controle de taxa e o
                disparo continuará em ~{capPerMin}/min.
              </AlertDescription>
            </Alert>
          )}

          {nearCap && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Perto do limite da conta</AlertTitle>
              <AlertDescription>
                Você está usando ~{Math.round((requestedPerSecond / (cap || 1)) * 100)}% do teto do número
                (~{capPerMin}/min). Picos podem gerar erros 130429 (rate limit) da Meta.
              </AlertDescription>
            </Alert>
          )}

          {lowQuality && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Qualidade do número: {quality}</AlertTitle>
              <AlertDescription>
                Com qualidade abaixo de verde, a Meta pode reduzir seu limite diário. Recomendado manter
                a velocidade em modo Lenta/Normal até a qualidade se recuperar.
              </AlertDescription>
            </Alert>
          )}

          {connSuspended && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Número restrito</AlertTitle>
              <AlertDescription>
                A conexão está com status “{limits?.connection_status}”. Aumentar a velocidade não terá efeito
                enquanto a restrição da Meta não for removida.
              </AlertDescription>
            </Alert>
          )}

          {batchTooBig && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Lote grande demais para a taxa</AlertTitle>
              <AlertDescription>
                Um lote de {batch} com teto de ~{cap} msg/s leva ~{Math.round(batch / (cap || 1))}s por ciclo e
                pode estourar o tempo de execução. Reduza o lote para ~{Math.max(1, Math.round((cap || 1) * 10))}.
              </AlertDescription>
            </Alert>
          )}

          {cap && !willCap && !nearCap && (
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Teto atual do número: ~{cap} msg/s (~{capPerMin}/min). Taxas acima disso são limitadas
              automaticamente pela Meta.
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            Taxas muito altas dependem do limite da conta na Meta — se aparecerem erros de rate limit, reduza.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
