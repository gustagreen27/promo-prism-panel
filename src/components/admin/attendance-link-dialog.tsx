// Vincula números de WhatsApp ao atendimento do cliente dono do disparo.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Trash2 } from "lucide-react";
import {
  getDemandAttendanceLinks, linkDemandAttendanceNumber, unlinkDemandAttendanceNumber,
} from "@/lib/client-attendance.functions";

export function AttendanceLinkDialog({
  campaignId,
  campaignName,
  onClose,
}: {
  campaignId: string | null;
  campaignName?: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(getDemandAttendanceLinks);
  const linkFn = useServerFn(linkDemandAttendanceNumber);
  const unlinkFn = useServerFn(unlinkDemandAttendanceNumber);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["demand-attendance-links", campaignId],
    queryFn: () => listFn({ data: { campaign_id: campaignId! } }),
    enabled: !!campaignId,
  });

  const linked = (data?.linked ?? []) as Array<{ id: string; phone_number_id: string; phone: string | null; label: string | null }>;
  const available = (data?.available ?? []).filter(
    (n) => !linked.some((l) => l.phone_number_id === n.phone_number_id),
  );

  async function add() {
    if (!campaignId || !selected) return;
    setBusy(true);
    try {
      await linkFn({ data: { campaign_id: campaignId, phone_number_id: selected } });
      setSelected("");
      toast.success("Número liberado no atendimento do cliente");
      qc.invalidateQueries({ queryKey: ["demand-attendance-links", campaignId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao vincular número");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await unlinkFn({ data: { id } });
      toast.success("Número removido do atendimento do cliente");
      qc.invalidateQueries({ queryKey: ["demand-attendance-links", campaignId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao remover número");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!campaignId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Atendimento do cliente{campaignName ? ` — ${campaignName}` : ""}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Os números vinculados aqui aparecem em <strong>/painel/atendimento</strong> para o cliente deste
          disparo, com todas as conversas e respostas dos leads.
        </p>

        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando números…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Números vinculados</div>
              {linked.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum número vinculado ainda.</p>
              ) : (
                <div className="space-y-2">
                  {linked.map((l) => (
                    <div key={l.id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium">{l.phone ?? l.phone_number_id}</div>
                        {l.label && <div className="truncate text-xs text-muted-foreground">{l.label}</div>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">liberado</Badge>
                        <Button size="icon" variant="ghost" disabled={busy} onClick={() => void remove(l.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Vincular novo número</div>
              <div className="flex gap-2">
                <Select value={selected} onValueChange={setSelected}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Selecione um número conectado" />
                  </SelectTrigger>
                  <SelectContent>
                    {available.map((n) => (
                      <SelectItem key={n.phone_number_id} value={n.phone_number_id}>
                        {n.phone ?? n.phone_number_id}
                        {n.label ? ` — ${n.label}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={() => void add()} disabled={!selected || busy}>
                  {busy ? "Salvando…" : "Vincular"}
                </Button>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
