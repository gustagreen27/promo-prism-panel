import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { applyFinalValue, computeCampaign, computeTotals, fmtBRL, fmtNum, type Campaign } from "@/lib/report-utils";
import { PageHeader } from "@/components/admin/page-header";

export const Route = createFileRoute("/_authenticated/admin/relatorios/new")({
  head: () => ({ meta: [{ title: "Novo relatório — Painel" }] }),
  component: NewReportPage,
});

function emptyCampaign(): Campaign {
  return { description: "", sent: 0, failed: 0, pricePerMsg: 0.25 };
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function NewReportPage() {
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const [clientName, setClientName] = useState("");
  const [reportDate, setReportDate] = useState(today);
  const [generatedAt, setGeneratedAt] = useState(() => toLocalInputValue(new Date()));
  const [reference, setReference] = useState("");
  const [project, setProject] = useState("");
  const [finalValue, setFinalValue] = useState<string>("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([emptyCampaign()]);
  const [saving, setSaving] = useState(false);

  const baseTotals = computeTotals(campaigns);
  const parsedFinal = finalValue.trim() === "" ? null : Number(finalValue);
  const totals = applyFinalValue(baseTotals, parsedFinal);

  function updateCampaign(i: number, patch: Partial<Campaign>) {
    setCampaigns((arr) => arr.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientName.trim()) return toast.error("Informe o cliente");
    if (campaigns.length === 0) return toast.error("Adicione pelo menos uma campanha");
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Sessão expirada");
      const { data, error } = await supabase
        .from("reports")
        .insert({
          user_id: userData.user.id,
          client_name: clientName.trim(),
          report_date: reportDate,
          reference: reference.trim() || null,
          project: project.trim() || null,
          final_value: parsedFinal && parsedFinal > 0 ? parsedFinal : null,
          generated_at: generatedAt ? new Date(generatedAt).toISOString() : new Date().toISOString(),
          campaigns: JSON.parse(JSON.stringify(campaigns)),
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Relatório criado");
      navigate({ to: "/admin/relatorios/$id", params: { id: data.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Novo relatório de disparos" description="Preencha os dados do cliente e as campanhas." />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="p-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="client">Cliente *</Label>
              <Input id="client" value={clientName} onChange={(e) => setClientName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Data *</Label>
              <Input id="date" type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ref">Referência</Label>
              <Input id="ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="opcional" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project">Projeto</Label>
              <Input id="project" value={project} onChange={(e) => setProject(e.target.value)} placeholder="opcional" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="finalValue">Valor final cobrado (R$)</Label>
              <Input
                id="finalValue"
                type="number"
                min={0}
                step="0.01"
                value={finalValue}
                onChange={(e) => setFinalValue(e.target.value)}
                placeholder="Opcional — sobrescreve o total e recalcula o R$/msg efetivo"
              />
              {parsedFinal && parsedFinal > 0 && totals.delivered > 0 ? (
                <p className="text-xs text-muted-foreground">
                  R$/msg efetivo: <span className="font-semibold text-foreground">{fmtBRL(totals.effectivePricePerMsg)}</span> · aplicado a {fmtNum(totals.delivered)} entregues
                </p>
              ) : null}
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Campanhas</h2>
            <Button type="button" variant="outline" size="sm" onClick={() => setCampaigns((a) => [...a, emptyCampaign()])}>
              <Plus className="size-4" /> Adicionar
            </Button>
          </div>
          <div className="space-y-4">
            {campaigns.map((c, i) => {
              const r = computeCampaign(c);
              return (
                <div key={i} className="grid grid-cols-12 gap-3 items-end border rounded-lg p-3">
                  <div className="col-span-12 sm:col-span-4 space-y-1">
                    <Label className="text-xs">Descrição / campanha</Label>
                    <Input value={c.description} onChange={(e) => updateCampaign(i, { description: e.target.value })} placeholder="ex: 24-25/06" />
                  </div>
                  <div className="col-span-4 sm:col-span-2 space-y-1">
                    <Label className="text-xs">Enviadas</Label>
                    <Input type="number" min={0} value={c.sent || ""} onChange={(e) => updateCampaign(i, { sent: Number(e.target.value) })} />
                  </div>
                  <div className="col-span-4 sm:col-span-2 space-y-1">
                    <Label className="text-xs">Falhou</Label>
                    <Input type="number" min={0} value={c.failed || ""} onChange={(e) => updateCampaign(i, { failed: Number(e.target.value) })} />
                  </div>
                  <div className="col-span-4 sm:col-span-2 space-y-1">
                    <Label className="text-xs">R$/msg</Label>
                    <Input type="number" min={0} step="0.01" value={c.pricePerMsg || ""} onChange={(e) => updateCampaign(i, { pricePerMsg: Number(e.target.value) })} />
                  </div>
                  <div className="col-span-10 sm:col-span-1 text-right">
                    <div className="text-[10px] uppercase text-muted-foreground">Líquido</div>
                    <div className="font-semibold text-report-blue text-sm">{fmtBRL(r.net)}</div>
                    <div className="text-[10px] text-muted-foreground">{fmtNum(r.delivered)} entr.</div>
                  </div>
                  <div className="col-span-2 sm:col-span-1 text-right">
                    <Button type="button" variant="ghost" size="icon" onClick={() => setCampaigns((a) => a.filter((_, idx) => idx !== i))} disabled={campaigns.length === 1}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 pt-4 border-t grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Totals label="Enviadas" value={fmtNum(totals.sent)} />
            <Totals label="Entregues" value={fmtNum(totals.delivered)} />
            <Totals label="Falhou" value={fmtNum(totals.failed)} />
            <Totals label="Líquido" value={fmtBRL(totals.net)} highlight />
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/admin/relatorios" })}>Cancelar</Button>
          <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar relatório"}</Button>
        </div>
      </form>
    </>
  );
}

function Totals({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={highlight ? "font-bold text-report-blue text-base" : "font-semibold"}>{value}</div>
    </div>
  );
}
