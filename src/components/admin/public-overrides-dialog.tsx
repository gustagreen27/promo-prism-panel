import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Trash2, Plus, Sparkles } from "lucide-react";
import {
  getCampaignPublicOverrides,
  updateCampaignPublicOverrides,
} from "@/lib/campaigns.functions";

type Row = { label: string; count: string };
type NumField = "total_clicks" | "sent" | "delivered" | "failed";

export function PublicOverridesDialog({
  campaignId,
  campaignName,
  open,
  onOpenChange,
}: {
  campaignId: string;
  campaignName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const load = useServerFn(getCampaignPublicOverrides);
  const save = useServerFn(updateCampaignPublicOverrides);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nums, setNums] = useState<Record<NumField, string>>({
    total_clicks: "",
    sent: "",
    delivered: "",
    failed: "",
  });
  const [countries, setCountries] = useState<Row[]>([]);
  const [cities, setCities] = useState<Row[]>([]);
  const [devices, setDevices] = useState<Row[]>([]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    load({ data: { id: campaignId } })
      .then((res) => {
        const o = res.overrides ?? {};
        setNums({
          total_clicks: o.total_clicks != null ? String(o.total_clicks) : "",
          sent: o.sent != null ? String(o.sent) : "",
          delivered: o.delivered != null ? String(o.delivered) : "",
          failed: o.failed != null ? String(o.failed) : "",
        });
        const toRows = (arr?: { label: string; count: number }[] | null): Row[] =>
          arr && arr.length > 0 ? arr.map((r) => ({ label: r.label, count: String(r.count) })) : [];
        setCountries(toRows(o.countries));
        setCities(toRows(o.cities));
        setDevices(toRows(o.devices));
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Falha ao carregar"))
      .finally(() => setLoading(false));
  }, [open, campaignId, load]);

  const parseNum = (s: string): number | null => {
    const t = s.trim();
    if (t === "") return null;
    const n = Number(t.replace(/[^\d]/g, ""));
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
  };

  const rowsToPayload = (rows: Row[]) =>
    rows
      .map((r) => ({ label: r.label.trim(), count: parseNum(r.count) ?? 0 }))
      .filter((r) => r.label.length > 0);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        total_clicks: parseNum(nums.total_clicks),
        sent: parseNum(nums.sent),
        delivered: parseNum(nums.delivered),
        failed: parseNum(nums.failed),
        countries: rowsToPayload(countries),
        cities: rowsToPayload(cities),
        devices: rowsToPayload(devices),
      };
      await save({ data: { id: campaignId, overrides: payload } });
      toast.success("Valores personalizados salvos");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!confirm("Remover todos os valores personalizados desta página pública?")) return;
    setSaving(true);
    try {
      await save({ data: { id: campaignId, overrides: {} } });
      toast.success("Valores personalizados removidos");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao remover");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Personalizar página pública
          </DialogTitle>
          <DialogDescription>
            Ajuste os números exibidos publicamente para{" "}
            <span className="font-medium text-foreground">{campaignName}</span>. Deixe em branco para
            usar os dados reais. Estas alterações <strong>não afetam</strong> disparos, destinatários,
            fila ou métricas internas em /admin/disparos.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <div className="space-y-6">
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <NumInput label="Cliques totais" value={nums.total_clicks} onChange={(v) => setNums({ ...nums, total_clicks: v })} />
              <NumInput label="Enviados" value={nums.sent} onChange={(v) => setNums({ ...nums, sent: v })} />
              <NumInput label="Entregues" value={nums.delivered} onChange={(v) => setNums({ ...nums, delivered: v })} />
              <NumInput label="Falhas" value={nums.failed} onChange={(v) => setNums({ ...nums, failed: v })} />
            </section>

            <Separator />

            <BreakdownEditor title="Países" rows={countries} onChange={setCountries} labelPlaceholder="Brasil" />
            <BreakdownEditor title="Cidades" rows={cities} onChange={setCities} labelPlaceholder="São Paulo" />
            <BreakdownEditor title="Dispositivos" rows={devices} onChange={setDevices} labelPlaceholder="mobile" />
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={handleClear} disabled={saving || loading} className="text-destructive hover:text-destructive">
            Limpar todos
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || loading}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NumInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        inputMode="numeric"
        placeholder="—"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
      />
    </div>
  );
}

function BreakdownEditor({
  title,
  rows,
  onChange,
  labelPlaceholder,
}: {
  title: string;
  rows: Row[];
  onChange: (rows: Row[]) => void;
  labelPlaceholder: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{title}</h4>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange([...rows, { label: "", count: "" }])}
        >
          <Plus className="mr-1 h-3 w-3" /> Adicionar
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Vazio — usará os dados reais dos cliques.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex gap-2">
              <Input
                placeholder={labelPlaceholder}
                value={r.label}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...next[i], label: e.target.value };
                  onChange(next);
                }}
              />
              <Input
                className="w-32"
                inputMode="numeric"
                placeholder="0"
                value={r.count}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...next[i], count: e.target.value.replace(/[^\d]/g, "") };
                  onChange(next);
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
