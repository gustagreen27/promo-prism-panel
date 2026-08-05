import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Gauge, Loader2 } from "lucide-react";
import { updateCampaignSpeed } from "@/lib/wa-campaigns.functions";
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
    onSuccess: () => {
      toast.success("Velocidade atualizada — vale já no próximo ciclo");
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
