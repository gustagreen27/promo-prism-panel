import { useEffect, useMemo, useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Trash2, Plus, Sparkles, Play, Pause, PlayCircle,
  RotateCcw, RefreshCw, PowerOff,
} from "lucide-react";
import {
  getCampaignPublicOverrides,
  updateCampaignPublicOverrides,
  controlCampaignSimulation,
} from "@/lib/campaigns.functions";
import {
  DEFAULT_SIMULATION,
  DEFAULT_STATUS_LABELS,
  SIM_STATUS_KEYS,
  coerceSimulation,
  computeSimulationSnapshot,
  type SimulationConfig,
  type SimStatusKey,
  type SimUnit,
} from "@/lib/public-simulation";

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
  const control = useServerFn(controlCampaignSimulation);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("numeros");
  const [nums, setNums] = useState<Record<NumField, string>>({
    total_clicks: "", sent: "", delivered: "", failed: "",
  });
  const [countries, setCountries] = useState<Row[]>([]);
  const [cities, setCities] = useState<Row[]>([]);
  const [devices, setDevices] = useState<Row[]>([]);
  const [sim, setSim] = useState<SimulationConfig>(DEFAULT_SIMULATION);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const isPersonalized = useMemo(() => {
    return (
      nums.total_clicks !== "" || nums.sent !== "" ||
      nums.delivered !== "" || nums.failed !== "" ||
      countries.length > 0 || cities.length > 0 || devices.length > 0 ||
      sim.mode !== "real" || sim.runtime.active
    );
  }, [nums, countries, cities, devices, sim]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    load({ data: { id: campaignId } })
      .then((res) => {
        const o = (res.overrides ?? {}) as Record<string, unknown>;
        setNums({
          total_clicks: o.total_clicks != null ? String(o.total_clicks) : "",
          sent: o.sent != null ? String(o.sent) : "",
          delivered: o.delivered != null ? String(o.delivered) : "",
          failed: o.failed != null ? String(o.failed) : "",
        });
        const toRows = (arr?: { label: string; count: number }[] | null): Row[] =>
          arr && arr.length > 0 ? arr.map((r) => ({ label: r.label, count: String(r.count) })) : [];
        setCountries(toRows(o.countries as { label: string; count: number }[] | undefined));
        setCities(toRows(o.cities as { label: string; count: number }[] | undefined));
        setDevices(toRows(o.devices as { label: string; count: number }[] | undefined));
        const s = coerceSimulation(o.simulation ?? {});
        setSim(s);
        setUpdatedAt(s.updated_at ?? null);
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

  const buildPayload = () => ({
    total_clicks: parseNum(nums.total_clicks),
    sent: parseNum(nums.sent),
    delivered: parseNum(nums.delivered),
    failed: parseNum(nums.failed),
    countries: rowsToPayload(countries),
    cities: rowsToPayload(cities),
    devices: rowsToPayload(devices),
    simulation: sim,
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      await save({ data: { id: campaignId, overrides: buildPayload() } });
      toast.success("Valores personalizados salvos");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleControl = async (action: Parameters<typeof control>[0]["data"]["action"]) => {
    setSaving(true);
    try {
      const res = await control({ data: { id: campaignId, action } });
      if (action === "disable") {
        setNums({ total_clicks: "", sent: "", delivered: "", failed: "" });
        setCountries([]); setCities([]); setDevices([]);
        setSim(DEFAULT_SIMULATION);
        toast.success("Personalizações desativadas");
        onOpenChange(false);
        return;
      }
      const s = coerceSimulation((res.overrides as { simulation?: SimulationConfig } | undefined)?.simulation ?? {});
      setSim(s);
      setUpdatedAt(s.updated_at ?? null);
      const msg: Record<string, string> = {
        start: "Simulação iniciada",
        pause: "Simulação pausada",
        resume: "Simulação retomada",
        restart: "Simulação reiniciada",
        sync_real: "Sincronizado com dados reais",
      };
      toast.success(msg[action] ?? "Atualizado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na ação");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Personalizar página pública
            {isPersonalized && (
              <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                Personalizado
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Configuração aplicada apenas em <code className="rounded bg-muted px-1">/campaigns/{campaignId.slice(0, 8)}…</code> —{" "}
            <span className="font-medium text-foreground">{campaignName}</span>. Não afeta disparos,
            fila, workers, destinatários, webhooks ou métricas em /admin/disparos.
            {updatedAt && (
              <span className="mt-1 block text-xs">
                Última alteração: {new Date(updatedAt).toLocaleString("pt-BR")}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="numeros">Números fixos</TabsTrigger>
              <TabsTrigger value="simulacao">Progresso em tempo real</TabsTrigger>
              <TabsTrigger value="previa">Prévia</TabsTrigger>
            </TabsList>

            <TabsContent value="numeros" className="space-y-5 pt-4">
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
            </TabsContent>

            <TabsContent value="simulacao" className="space-y-6 pt-4">
              <SimulationForm sim={sim} onChange={setSim} />
              <Separator />
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="mb-2 text-sm font-semibold">Controles da simulação pública</div>
                <div className="mb-3 text-xs text-muted-foreground">
                  Estes botões afetam apenas a página pública. O disparo real continua rodando normalmente em /admin/disparos.
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="default" disabled={saving} onClick={() => handleControl("start")}>
                    <Play className="mr-1 h-3.5 w-3.5" /> Iniciar
                  </Button>
                  <Button size="sm" variant="outline" disabled={saving || !sim.runtime.active} onClick={() => handleControl("pause")}>
                    <Pause className="mr-1 h-3.5 w-3.5" /> Pausar
                  </Button>
                  <Button size="sm" variant="outline" disabled={saving || !sim.runtime.sim_paused_at} onClick={() => handleControl("resume")}>
                    <PlayCircle className="mr-1 h-3.5 w-3.5" /> Retomar
                  </Button>
                  <Button size="sm" variant="outline" disabled={saving} onClick={() => handleControl("restart")}>
                    <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reiniciar
                  </Button>
                  <Button size="sm" variant="outline" disabled={saving} onClick={() => handleControl("sync_real")}>
                    <RefreshCw className="mr-1 h-3.5 w-3.5" /> Sincronizar com real
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={saving} onClick={() => {
                    if (confirm("Desativar TODAS as personalizações da página pública?")) void handleControl("disable");
                  }}>
                    <PowerOff className="mr-1 h-3.5 w-3.5" /> Desativar tudo
                  </Button>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Estado atual:</span>
                  <Badge variant={sim.runtime.active ? "default" : "secondary"}>
                    {sim.runtime.active ? (sim.runtime.sim_paused_at ? "Pausada" : "Ativa") : "Inativa"}
                  </Badge>
                  {sim.runtime.sim_started_at && (
                    <span className="text-muted-foreground">
                      Iniciada em {new Date(sim.runtime.sim_started_at).toLocaleString("pt-BR")}
                    </span>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="previa" className="space-y-3 pt-4">
              <PreviewPanel sim={sim} />
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {isPersonalized ? "⚠ Página pública está com dados personalizados" : "Sem personalização — usa dados reais"}
          </div>
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

// ============================================================================
// Simulation form
// ============================================================================

function SimulationForm({
  sim, onChange,
}: {
  sim: SimulationConfig;
  onChange: (s: SimulationConfig) => void;
}) {
  const update = (patch: Partial<SimulationConfig>) => onChange({ ...sim, ...patch });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Modo de exibição</Label>
          <Select value={sim.mode} onValueChange={(v) => update({ mode: v as SimulationConfig["mode"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="real">Real (dados do disparo)</SelectItem>
              <SelectItem value="custom">Personalizado (valores simulados)</SelectItem>
              <SelectItem value="real_plus">Real com ajuste (real + simulado)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Intervalo de atualização (seg)</Label>
          <Input
            type="number" min={3} max={120}
            value={sim.refetch_interval_sec}
            onChange={(e) => update({ refetch_interval_sec: Math.max(3, Math.min(120, Number(e.target.value) || 5)) })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Total público de contatos</Label>
          <Input
            type="number" min={0}
            placeholder="—"
            value={sim.total_contacts ?? ""}
            onChange={(e) => update({ total_contacts: e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0) })}
          />
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Início público</Label>
          <Input
            type="datetime-local"
            value={sim.start_at ? toLocalInput(sim.start_at) : ""}
            onChange={(e) => update({ start_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Duração estimada (min)</Label>
          <Input
            type="number" min={1}
            placeholder="—"
            value={sim.duration_minutes ?? ""}
            onChange={(e) => update({ duration_minutes: e.target.value === "" ? null : Math.max(1, Number(e.target.value) || 1) })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Conclusão prevista</Label>
          <Input
            type="datetime-local"
            value={sim.ends_at ? toLocalInput(sim.ends_at) : ""}
            onChange={(e) => update({ ends_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">% inicial</Label>
          <Input type="number" min={0} max={100}
            value={sim.initial_percent}
            onChange={(e) => update({ initial_percent: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">% máximo</Label>
          <Input type="number" min={0} max={100}
            value={sim.max_percent}
            onChange={(e) => update({ max_percent: Math.max(0, Math.min(100, Number(e.target.value) || 100)) })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Concluir publicamente em</Label>
          <Input
            type="datetime-local"
            value={sim.complete_at ? toLocalInput(sim.complete_at) : ""}
            onChange={(e) => update({ complete_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
          />
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="text-sm font-semibold">Velocidades públicas</div>
        <RateRow
          label="Enviados por" value={sim.send_rate}
          onChange={(v) => update({ send_rate: v })}
        />
        <RatioRow
          label="Entregues" value={sim.delivered}
          onChange={(v) => update({ delivered: v })}
        />
        <RatioRow
          label="Falhas" value={sim.failed}
          onChange={(v) => update({ failed: v })}
        />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-muted-foreground">Cliques por intervalo</Label>
            <Input type="number" min={0}
              placeholder="0"
              value={sim.clicks?.per_interval ?? ""}
              onChange={(e) => update({
                clicks: {
                  per_interval: Number(e.target.value) || 0,
                  interval_sec: sim.clicks?.interval_sec ?? 60,
                },
              })}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Intervalo (seg)</Label>
            <Input type="number" min={1}
              placeholder="60"
              value={sim.clicks?.interval_sec ?? ""}
              onChange={(e) => update({
                clicks: {
                  per_interval: sim.clicks?.per_interval ?? 0,
                  interval_sec: Math.max(1, Number(e.target.value) || 60),
                },
              })}
            />
          </div>
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="text-sm font-semibold">Curva de crescimento</div>
        <Select
          value={sim.growth.kind}
          onValueChange={(v) => update({ growth: { ...sim.growth, kind: v as SimulationConfig["growth"]["kind"] } })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="linear">Linear</SelectItem>
            <SelectItem value="random">Aleatório dentro de faixa</SelectItem>
            <SelectItem value="stepped">Baseado em etapas</SelectItem>
            <SelectItem value="real_multiplier">Real com multiplicador</SelectItem>
            <SelectItem value="on_reload">Somente ao recarregar</SelectItem>
            <SelectItem value="realtime">Automático em tempo real</SelectItem>
          </SelectContent>
        </Select>

        {sim.growth.kind === "random" && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Multiplicador mín</Label>
              <Input type="number" step="0.05"
                value={sim.growth.random_min ?? 0.9}
                onChange={(e) => update({ growth: { ...sim.growth, random_min: Number(e.target.value) || 0 } })}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Multiplicador máx</Label>
              <Input type="number" step="0.05"
                value={sim.growth.random_max ?? 1.1}
                onChange={(e) => update({ growth: { ...sim.growth, random_max: Number(e.target.value) || 0 } })}
              />
            </div>
          </div>
        )}
        {sim.growth.kind === "real_multiplier" && (
          <div>
            <Label className="text-xs text-muted-foreground">Multiplicador visual</Label>
            <Input type="number" step="0.1"
              value={sim.growth.multiplier ?? 1}
              onChange={(e) => update({ growth: { ...sim.growth, multiplier: Number(e.target.value) || 1 } })}
            />
          </div>
        )}
        {sim.growth.kind === "stepped" && (
          <StepsEditor
            steps={sim.growth.steps ?? []}
            onChange={(steps) => update({ growth: { ...sim.growth, steps } })}
          />
        )}
      </div>

      <Separator />

      <PausesEditor pauses={sim.pauses} onChange={(pauses) => update({ pauses })} />

      <Separator />

      <StatusEditor sim={sim} onChange={onChange} />
    </div>
  );
}

function RateRow({
  label, value, onChange,
}: {
  label: string;
  value: { value: number; unit: SimUnit } | null;
  onChange: (v: { value: number; unit: SimUnit } | null) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_120px_100px] items-end gap-2">
      <div>
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <Input type="number" min={0}
          placeholder="—"
          value={value?.value ?? ""}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (e.target.value === "" || !Number.isFinite(n)) onChange(null);
            else onChange({ value: n, unit: value?.unit ?? "m" });
          }}
        />
      </div>
      <Select
        value={value?.unit ?? "m"}
        onValueChange={(u) => onChange({ value: value?.value ?? 0, unit: u as SimUnit })}
      >
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="s">por segundo</SelectItem>
          <SelectItem value="m">por minuto</SelectItem>
          <SelectItem value="h">por hora</SelectItem>
        </SelectContent>
      </Select>
      <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>Limpar</Button>
    </div>
  );
}

function RatioRow({
  label, value, onChange,
}: {
  label: string;
  value: { mode: "rate"; value: number; unit: SimUnit } | { mode: "percent"; value: number } | null;
  onChange: (v: { mode: "rate"; value: number; unit: SimUnit } | { mode: "percent"; value: number } | null) => void;
}) {
  const mode = value?.mode ?? "percent";
  return (
    <div className="grid grid-cols-[1fr_140px_110px_80px] items-end gap-2">
      <div>
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <Input type="number" min={0}
          placeholder={mode === "percent" ? "% sobre enviados" : "quantidade"}
          value={value?.value ?? ""}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (e.target.value === "") onChange(null);
            else if (mode === "percent") onChange({ mode: "percent", value: n });
            else onChange({ mode: "rate", value: n, unit: value && value.mode === "rate" ? value.unit : "m" });
          }}
        />
      </div>
      <Select value={mode} onValueChange={(m) => {
        if (m === "percent") onChange({ mode: "percent", value: value?.value ?? 0 });
        else onChange({ mode: "rate", value: value?.value ?? 0, unit: value && value.mode === "rate" ? value.unit : "m" });
      }}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="percent">% sobre enviados</SelectItem>
          <SelectItem value="rate">quantidade</SelectItem>
        </SelectContent>
      </Select>
      {mode === "rate" && value && value.mode === "rate" ? (
        <Select value={value.unit} onValueChange={(u) => onChange({ mode: "rate", value: value.value, unit: u as SimUnit })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="s">por segundo</SelectItem>
            <SelectItem value="m">por minuto</SelectItem>
            <SelectItem value="h">por hora</SelectItem>
          </SelectContent>
        </Select>
      ) : <div />}
      <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>Limpar</Button>
    </div>
  );
}

function StepsEditor({
  steps, onChange,
}: {
  steps: { t_sec: number; sent: number }[];
  onChange: (steps: { t_sec: number; sent: number }[]) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">Etapas (tempo → enviados)</Label>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...steps, { t_sec: 60, sent: 100 }])}>
          <Plus className="mr-1 h-3 w-3" /> Adicionar
        </Button>
      </div>
      {steps.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma etapa. Adicione marcos "aos X segundos, mostrar Y enviados".</p>
      ) : (
        <div className="space-y-1.5">
          {steps.map((s, i) => (
            <div key={i} className="flex gap-2">
              <Input type="number" min={0} placeholder="seg"
                value={s.t_sec}
                onChange={(e) => {
                  const next = [...steps]; next[i] = { ...next[i], t_sec: Number(e.target.value) || 0 };
                  onChange(next);
                }}
              />
              <Input type="number" min={0} placeholder="enviados"
                value={s.sent}
                onChange={(e) => {
                  const next = [...steps]; next[i] = { ...next[i], sent: Number(e.target.value) || 0 };
                  onChange(next);
                }}
              />
              <Button type="button" variant="ghost" size="icon" onClick={() => onChange(steps.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PausesEditor({
  pauses, onChange,
}: {
  pauses: SimulationConfig["pauses"];
  onChange: (p: SimulationConfig["pauses"]) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Pausas programadas</div>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...pauses, { after_sent: 1000, duration_sec: 60, status_label: "", recalc_eta: true }])}>
          <Plus className="mr-1 h-3 w-3" /> Adicionar
        </Button>
      </div>
      {pauses.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma pausa configurada.</p>
      ) : (
        <div className="space-y-2">
          {pauses.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1.4fr_auto_auto] items-end gap-2 rounded border p-2">
              <div>
                <Label className="text-[11px] text-muted-foreground">Após envios</Label>
                <Input type="number" min={0} value={p.after_sent}
                  onChange={(e) => {
                    const next = [...pauses]; next[i] = { ...next[i], after_sent: Number(e.target.value) || 0 };
                    onChange(next);
                  }}
                />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Duração (seg)</Label>
                <Input type="number" min={1} value={p.duration_sec}
                  onChange={(e) => {
                    const next = [...pauses]; next[i] = { ...next[i], duration_sec: Math.max(1, Number(e.target.value) || 1) };
                    onChange(next);
                  }}
                />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Status durante pausa</Label>
                <Input placeholder="ex.: Aguardando janela"
                  value={p.status_label ?? ""}
                  onChange={(e) => {
                    const next = [...pauses]; next[i] = { ...next[i], status_label: e.target.value };
                    onChange(next);
                  }}
                />
              </div>
              <div className="flex flex-col items-center gap-1">
                <Label className="text-[11px] text-muted-foreground">Recalc ETA</Label>
                <Switch checked={p.recalc_eta} onCheckedChange={(v) => {
                  const next = [...pauses]; next[i] = { ...next[i], recalc_eta: v }; onChange(next);
                }} />
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => onChange(pauses.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusEditor({
  sim, onChange,
}: {
  sim: SimulationConfig;
  onChange: (s: SimulationConfig) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold">Status públicos</div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Forçar exibir status</Label>
          <Select
            value={sim.status.override ?? "__auto"}
            onValueChange={(v) => onChange({ ...sim, status: { ...sim.status, override: v === "__auto" ? null : (v as SimStatusKey) } })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__auto">Automático</SelectItem>
              {SIM_STATUS_KEYS.map((k) => (
                <SelectItem key={k} value={k}>{DEFAULT_STATUS_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {SIM_STATUS_KEYS.map((k) => (
          <div key={k} className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">{DEFAULT_STATUS_LABELS[k]}</Label>
            <Input
              placeholder={DEFAULT_STATUS_LABELS[k]}
              value={sim.status.labels?.[k] ?? ""}
              onChange={(e) => onChange({
                ...sim,
                status: { ...sim.status, labels: { ...sim.status.labels, [k]: e.target.value } },
              })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewPanel({ sim }: { sim: SimulationConfig }) {
  // renderiza projeções a t=0, +5min, +30min, +60min, +240min do sim_started_at (ou now)
  const start = sim.runtime.sim_started_at ? new Date(sim.runtime.sim_started_at) : new Date();
  const offsets = [0, 5, 30, 60, 240];
  const real = { sent: 0, delivered: 0, failed: 0, total: sim.total_contacts ?? 0, status: null, clicks: 0 };
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Projeção baseada na configuração atual (não salva ainda). Início considerado: {start.toLocaleString("pt-BR")}.
      </p>
      <div className="overflow-hidden rounded border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Tempo</th>
              <th className="px-3 py-2 text-right">Enviados</th>
              <th className="px-3 py-2 text-right">Entregues</th>
              <th className="px-3 py-2 text-right">Falhas</th>
              <th className="px-3 py-2 text-right">%</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {offsets.map((min) => {
              const at = new Date(start.getTime() + min * 60_000);
              const snap = computeSimulationSnapshot({ ...sim, runtime: { ...sim.runtime, active: true, sim_started_at: start.toISOString(), sim_paused_at: null, accumulated_pause_ms: 0 }, mode: sim.mode === "real" ? "custom" : sim.mode }, real, at);
              return (
                <tr key={min} className="border-t">
                  <td className="px-3 py-1.5 text-xs">+{min} min</td>
                  <td className="px-3 py-1.5 text-right text-xs">{snap.sent.toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-1.5 text-right text-xs">{snap.delivered.toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-1.5 text-right text-xs">{snap.failed.toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-1.5 text-right text-xs">{Math.round(snap.percent)}%</td>
                  <td className="px-3 py-1.5 text-xs">{snap.status_label}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Small helpers reused from previous version
// ============================================================================

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
  title, rows, onChange, labelPlaceholder,
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
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...rows, { label: "", count: "" }])}>
          <Plus className="mr-1 h-3 w-3" /> Adicionar
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Vazio — usará os dados reais dos cliques.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex gap-2">
              <Input placeholder={labelPlaceholder} value={r.label}
                onChange={(e) => { const n = [...rows]; n[i] = { ...n[i], label: e.target.value }; onChange(n); }}
              />
              <Input className="w-32" inputMode="numeric" placeholder="0" value={r.count}
                onChange={(e) => { const n = [...rows]; n[i] = { ...n[i], count: e.target.value.replace(/[^\d]/g, "") }; onChange(n); }}
              />
              <Button type="button" variant="ghost" size="icon" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
