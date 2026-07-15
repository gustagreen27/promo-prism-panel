import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Copy,
  ExternalLink,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  clearAllPublicOverrides,
  controlPublicSimulation,
  deleteMetricOverride,
  duplicatePublicDispatchConfig,
  getCampaignPublicCustomization,
  reorderMetricOverrides,
  upsertCampaignPublicSettings,
  upsertMetricOverride,
  upsertPublicDispatch,
  upsertPublicSimulation,
} from "@/lib/public-overrides.functions";
import {
  computeGeneratedClicks,
  seedFromString,
  type ClicksGeneratorConfig,
} from "@/lib/public-clicks-generator";

type Kind = "country" | "city" | "device" | "browser";
const KIND_LABEL: Record<Kind, string> = {
  country: "Países",
  city: "Cidades",
  device: "Dispositivos",
  browser: "Navegadores",
};

const STATUS_OPTIONS = [
  "Agendada",
  "Preparando",
  "Em execução",
  "Processando",
  "Pausada",
  "Retomando",
  "Finalizando",
  "Concluída",
  "Cancelada",
];

export function PublicCustomizationDialog({
  campaignId,
  campaignName,
  campaignSlug,
  open,
  onOpenChange,
}: {
  campaignId: string;
  campaignName: string;
  campaignSlug?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const getFn = useServerFn(getCampaignPublicCustomization);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["public-customization", campaignId],
    queryFn: () => getFn({ data: { campaignId } }),
    enabled: open,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["public-customization", campaignId] });
    qc.invalidateQueries({ queryKey: ["public-campaign-report", campaignId] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Personalização da página pública
            {data?.settings?.enabled && (
              <Badge variant="secondary" className="ml-2">Ativa</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {campaignName} — camada de apresentação isolada, não afeta disparos reais nem métricas
            operacionais.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Carregando...
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col gap-3">
            <HeaderActions
              campaignId={campaignId}
              slug={campaignSlug}
              enabled={data.settings?.enabled ?? false}
              attention={
                !(data.settings?.enabled ?? false) &&
                (((data.settings as any)?.clicks_generator?.countries?.length ?? 0) > 0 ||
                  ((data.settings as any)?.clicks_generator?.cities?.length ?? 0) > 0)
              }
              onChange={invalidate}
            />

            <Tabs defaultValue="general" className="flex-1 min-h-0 flex flex-col">
              <TabsList>
                <TabsTrigger value="general">Métricas gerais</TabsTrigger>
                <TabsTrigger value="dispatches">
                  Disparos ({data.waDispatches.length})
                </TabsTrigger>
              </TabsList>
              <TabsContent value="general" className="flex-1 min-h-0">
                <ScrollArea className="h-full pr-3">
                  <GeneralTab data={data} campaignId={campaignId} onChange={invalidate} />
                </ScrollArea>
              </TabsContent>
              <TabsContent value="dispatches" className="flex-1 min-h-0">
                <ScrollArea className="h-full pr-3">
                  <DispatchesTab data={data} campaignId={campaignId} onChange={invalidate} />
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="mr-1 h-4 w-4" /> Recarregar
          </Button>
          <Button onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HeaderActions({
  campaignId,
  slug,
  enabled,
  attention = false,
  onChange,
}: {
  campaignId: string;
  slug?: string;
  enabled: boolean;
  attention?: boolean;
  onChange: () => void;
}) {
  const upsertFn = useServerFn(upsertCampaignPublicSettings);
  const clearFn = useServerFn(clearAllPublicOverrides);
  const toggle = useMutation({
    mutationFn: (v: boolean) => upsertFn({ data: { campaignId, enabled: v } }),
    onSuccess: (_d, v) => {
      if (v) toast.success("Personalização pública ativada e distribuição aplicada com sucesso.");
      else toast.success("Personalização atualizada");
      onChange();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const clear = useMutation({
    mutationFn: () => clearFn({ data: { campaignId } }),
    onSuccess: () => {
      toast.success("Personalizações removidas");
      onChange();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div
      className={
        "flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 p-3 " +
        (attention ? "border-amber-500 ring-2 ring-amber-500/40" : "")
      }
    >
      <div className="flex items-center gap-2">
        <Switch checked={enabled} onCheckedChange={(v) => toggle.mutate(v)} />
        <span className="text-sm font-medium flex items-center gap-1">
          {attention && <AlertTriangle className="h-4 w-4 text-amber-500" />}
          {enabled ? "Personalização ativa" : "Personalização desativada"}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {slug && (
          <Button variant="outline" size="sm" asChild>
            <a href={`/campaigns/${campaignId}`} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1 h-4 w-4" /> Ver pública
            </a>
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (confirm("Remover TODAS as personalizações desta campanha?")) clear.mutate();
          }}
        >
          <RotateCcw className="mr-1 h-4 w-4" /> Restaurar reais
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// MÉTRICAS GERAIS
// ============================================================================
function GeneralTab({
  data,
  campaignId,
  onChange,
}: {
  data: NonNullable<Awaited<ReturnType<ReturnType<typeof useServerFn<typeof getCampaignPublicCustomization>>>>>;
  campaignId: string;
  onChange: () => void;
}) {
  const s = data.settings ?? {
    metrics_mode: "real",
    custom_totals: {},
    clicks_series: [],
    hourly_series: [],
  };
  const upsertFn = useServerFn(upsertCampaignPublicSettings);
  const [mode, setMode] = useState<string>((s as any).metrics_mode ?? "real");
  const totals = ((s as any).custom_totals ?? {}) as Record<string, number | null>;
  const [clicks, setClicks] = useState<string>(String(totals.clicks ?? ""));
  const [cCount, setCCount] = useState<string>(String(totals.countries_count ?? ""));
  const [ciCount, setCiCount] = useState<string>(String(totals.cities_count ?? ""));
  const [dCount, setDCount] = useState<string>(String(totals.devices_count ?? ""));

  const save = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          campaignId,
          metrics_mode: mode as "real" | "replace" | "merge",
          custom_totals: {
            clicks: clicks === "" ? null : Number(clicks),
            countries_count: cCount === "" ? null : Number(cCount),
            cities_count: ciCount === "" ? null : Number(ciCount),
            devices_count: dCount === "" ? null : Number(dCount),
          },
        },
      }),
    onSuccess: () => {
      toast.success("Métricas salvas");
      onChange();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-4 pb-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Modo das listas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Select value={mode} onValueChange={setMode}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="real">Somente reais</SelectItem>
              <SelectItem value="replace">Substituir pelos personalizados</SelectItem>
              <SelectItem value="merge">Somar aos reais</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Aplica-se a países, cidades, dispositivos e navegadores.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Totais globais</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <NumField label="Cliques" value={clicks} onChange={setClicks} />
          <NumField label="Países" value={cCount} onChange={setCCount} />
          <NumField label="Cidades" value={ciCount} onChange={setCiCount} />
          <NumField label="Dispositivos" value={dCount} onChange={setDCount} />
          <div className="col-span-full">
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
              <Save className="mr-1 h-4 w-4" /> Salvar totais e modo
            </Button>
          </div>
        </CardContent>
      </Card>

      <ClicksGeneratorCard
        campaignId={campaignId}
        settings={data.settings}
        waDispatches={data.waDispatches ?? []}
        publicDispatches={data.dispatches ?? []}
        publicSimulations={data.simulations ?? []}
        onChange={onChange}
      />

      <StatusMapCard
        campaignId={campaignId}
        settings={data.settings}
        onChange={onChange}
      />



      {(["country", "city", "device", "browser"] as Kind[]).map((kind) => (
        <MetricListEditor
          key={kind}
          kind={kind}
          campaignId={campaignId}
          items={(data.metrics ?? []).filter((m: any) => m.kind === kind)}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        inputMode="numeric"
        value={value}
        placeholder={placeholder ?? "vazio = usar real"}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function MetricListEditor({
  kind,
  campaignId,
  items,
  onChange,
}: {
  kind: Kind;
  campaignId: string;
  items: any[];
  onChange: () => void;
}) {
  const upsertFn = useServerFn(upsertMetricOverride);
  const delFn = useServerFn(deleteMetricOverride);
  const reorderFn = useServerFn(reorderMetricOverrides);
  const [newLabel, setNewLabel] = useState("");
  const [newCount, setNewCount] = useState("");

  const add = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          campaignId,
          kind,
          label: newLabel,
          count: Number(newCount || 0),
          position: items.length,
        },
      }),
    onSuccess: () => {
      setNewLabel("");
      setNewCount("");
      onChange();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const upd = useMutation({
    mutationFn: (v: {
      id: string;
      label: string;
      count: number;
      position: number;
      percent?: number | null;
    }) => upsertFn({ data: { ...v, campaignId, kind } }),
    onSuccess: onChange,
    onError: (e) => toast.error((e as Error).message),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: onChange,
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => reorderFn({ data: { ids } }),
    onSuccess: onChange,
  });

  const move = (idx: number, dir: -1 | 1) => {
    const arr = [...items];
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    reorder.mutate(arr.map((i) => i.id));
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{KIND_LABEL[kind]}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhum item personalizado.</p>
        )}
        {items.map((it, idx) => (
          <div key={it.id} className="flex flex-wrap items-center gap-2">
            <Input
              defaultValue={it.label}
              className="min-w-[10rem] flex-1"
              onBlur={(e) =>
                e.target.value !== it.label &&
                upd.mutate({
                  id: it.id,
                  label: e.target.value,
                  count: it.count,
                  position: it.position,
                  percent: it.percent ?? null,
                })
              }
            />
            <Input
              type="number"
              defaultValue={it.count}
              className="w-24"
              placeholder="qtd"
              onBlur={(e) =>
                Number(e.target.value) !== it.count &&
                upd.mutate({
                  id: it.id,
                  label: it.label,
                  count: Number(e.target.value),
                  position: it.position,
                  percent: it.percent ?? null,
                })
              }
            />
            <div className="flex items-center gap-1">
              <Input
                type="number"
                defaultValue={it.percent ?? ""}
                className="w-20"
                placeholder="% "
                onBlur={(e) => {
                  const v = e.target.value === "" ? null : Number(e.target.value);
                  if (v !== (it.percent ?? null)) {
                    upd.mutate({
                      id: it.id,
                      label: it.label,
                      count: it.count,
                      position: it.position,
                      percent: v,
                    });
                  }
                }}
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
            <Button variant="ghost" size="icon" onClick={() => move(idx, -1)}>
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => move(idx, 1)}>
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => del.mutate(it.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
        <div className="flex items-center gap-2 border-t pt-2">
          <Input
            placeholder="Novo item"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="flex-1"
          />
          <Input
            type="number"
            placeholder="0"
            value={newCount}
            onChange={(e) => setNewCount(e.target.value)}
            className="w-28"
          />
          <Button size="sm" onClick={() => newLabel.trim() && add.mutate()}>
            <Plus className="mr-1 h-4 w-4" /> Adicionar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// DISPARO POR DISPARO
// ============================================================================
function DispatchesTab({
  data,
  campaignId,
  onChange,
}: {
  data: any;
  campaignId: string;
  onChange: () => void;
}) {
  const waList = data.waDispatches as any[];
  if (waList.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Nenhum disparo vinculado a esta campanha. Vincule em "Disparos WhatsApp vinculados" primeiro.
      </p>
    );
  }
  return (
    <div className="space-y-4 pb-6">
      {waList.map((wa) => {
        const override = (data.dispatches ?? []).find((d: any) => d.wa_campaign_id === wa.id) ?? null;
        const sim = (data.simulations ?? []).find((s: any) => s.wa_campaign_id === wa.id) ?? null;
        return (
          <DispatchCard
            key={wa.id}
            wa={wa}
            override={override}
            simulation={sim}
            campaignId={campaignId}
            allWa={waList}
            onChange={onChange}
          />
        );
      })}
    </div>
  );
}

function DispatchCard({
  wa,
  override,
  simulation,
  campaignId,
  allWa,
  onChange,
}: {
  wa: any;
  override: any | null;
  simulation: any | null;
  campaignId: string;
  allWa: any[];
  onChange: () => void;
}) {
  const upsertFn = useServerFn(upsertPublicDispatch);
  const simUpsertFn = useServerFn(upsertPublicSimulation);
  const simCtrlFn = useServerFn(controlPublicSimulation);
  const dupFn = useServerFn(duplicatePublicDispatchConfig);

  const [enabled, setEnabled] = useState<boolean>(override?.enabled ?? false);
  const [mode, setMode] = useState<string>(override?.mode ?? "real");
  const [publicName, setPublicName] = useState<string>(override?.public_name ?? "");
  const [publicStatus, setPublicStatus] = useState<string>(override?.public_status ?? "");

  const f = override?.fixed ?? {};
  const [fTotal, setFTotal] = useState<string>(f.total != null ? String(f.total) : "");
  const [fSent, setFSent] = useState<string>(f.sent != null ? String(f.sent) : "");
  const [fDelivered, setFDelivered] = useState<string>(f.delivered != null ? String(f.delivered) : "");
  const [fFailed, setFFailed] = useState<string>(f.failed != null ? String(f.failed) : "");
  const [fPercent, setFPercent] = useState<string>(f.percent != null ? String(f.percent) : "");
  const [fStarted, setFStarted] = useState<string>(f.started_at ?? "");
  const [fEta, setFEta] = useState<string>(f.eta_at ?? "");
  const [fSpeed, setFSpeed] = useState<string>(f.speed_label ?? "");

  const [dupTo, setDupTo] = useState<string>("");

  const save = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          waCampaignId: wa.id,
          campaignId,
          enabled,
          mode: mode as any,
          public_name: publicName || null,
          public_status: publicStatus || null,
          fixed: {
            total: fTotal === "" ? null : Number(fTotal),
            sent: fSent === "" ? null : Number(fSent),
            delivered: fDelivered === "" ? null : Number(fDelivered),
            failed: fFailed === "" ? null : Number(fFailed),
            percent: fPercent === "" ? null : Number(fPercent),
            started_at: fStarted || null,
            eta_at: fEta || null,
            speed_label: fSpeed || null,
            updated_at: new Date().toISOString(),
          },
        },
      }),
    onSuccess: () => {
      toast.success(`"${wa.name}" salvo`);
      onChange();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const dup = useMutation({
    mutationFn: () => dupFn({ data: { fromWaId: wa.id, toWaId: dupTo } }),
    onSuccess: () => {
      toast.success("Configuração duplicada");
      setDupTo("");
      onChange();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{wa.name || "Sem nome"}</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Real: {wa.status}</Badge>
            <div className="flex items-center gap-1.5">
              <Switch checked={enabled} onCheckedChange={setEnabled} />
              <span className="text-xs">Personalizar</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs">Modo</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="real">Dados reais</SelectItem>
                <SelectItem value="fixed">Personalizados fixos</SelectItem>
                <SelectItem value="auto">Progressão automática</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Nome público</Label>
            <Input value={publicName} onChange={(e) => setPublicName(e.target.value)} placeholder={wa.name ?? ""} />
          </div>
          <div>
            <Label className="text-xs">Status público</Label>
            <Select value={publicStatus || "__none"} onValueChange={(v) => setPublicStatus(v === "__none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Usar real</SelectItem>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="mt-1"
              placeholder="ou digite personalizado"
              value={publicStatus}
              onChange={(e) => setPublicStatus(e.target.value)}
            />
          </div>
        </div>

        {mode === "fixed" && (
          <div className="rounded-md border p-3 space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Valores fixos</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <NumField label="Total" value={fTotal} onChange={setFTotal} />
              <NumField label="Enviados" value={fSent} onChange={setFSent} />
              <NumField label="Entregues" value={fDelivered} onChange={setFDelivered} />
              <NumField label="Falhas" value={fFailed} onChange={setFFailed} />
              <NumField label="Progresso %" value={fPercent} onChange={setFPercent} />
              <div>
                <Label className="text-xs">Início</Label>
                <Input type="datetime-local" value={fStarted?.slice(0, 16) ?? ""} onChange={(e) => setFStarted(e.target.value ? new Date(e.target.value).toISOString() : "")} />
              </div>
              <div>
                <Label className="text-xs">ETA</Label>
                <Input type="datetime-local" value={fEta?.slice(0, 16) ?? ""} onChange={(e) => setFEta(e.target.value ? new Date(e.target.value).toISOString() : "")} />
              </div>
              <div>
                <Label className="text-xs">Velocidade (texto)</Label>
                <Input value={fSpeed} onChange={(e) => setFSpeed(e.target.value)} placeholder="ex: 5k/min" />
              </div>
            </div>
          </div>
        )}

        {mode === "auto" && (
          <AutoSimForm
            wa={wa}
            campaignId={campaignId}
            simulation={simulation}
            onSave={(patch) =>
              simUpsertFn({ data: { waCampaignId: wa.id, campaignId, ...patch } }).then(() => {
                toast.success("Simulação salva");
                onChange();
              })
            }
            onControl={(action) =>
              simCtrlFn({ data: { waCampaignId: wa.id, action } }).then(() => {
                toast.success(`Ação "${action}" executada`);
                onChange();
              })
            }
          />
        )}

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="mr-1 h-4 w-4" /> Salvar disparo
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Select value={dupTo || "__none"} onValueChange={(v) => setDupTo(v === "__none" ? "" : v)}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Duplicar config para..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">—</SelectItem>
                {allWa.filter((w) => w.id !== wa.id).map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" disabled={!dupTo} onClick={() => dup.mutate()}>
              <Copy className="mr-1 h-4 w-4" /> Duplicar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AutoSimForm({
  wa,
  campaignId: _campaignId,
  simulation,
  onSave,
  onControl,
}: {
  wa: any;
  campaignId: string;
  simulation: any | null;
  onSave: (patch: any) => Promise<any>;
  onControl: (action: "start" | "pause" | "resume" | "restart" | "sync_real" | "disable") => Promise<any>;
}) {
  const s = simulation ?? {};
  const [startAt, setStartAt] = useState<string>(s.start_at ? s.start_at.slice(0, 16) : "");
  const [endAt, setEndAt] = useState<string>(s.end_at ? s.end_at.slice(0, 16) : "");
  const [durationSec, setDurationSec] = useState<string>(s.duration_sec ?? "");
  const [refresh, setRefresh] = useState<string>(String(s.refresh_interval_sec ?? 5));
  const [sentStart, setSentStart] = useState<string>(String(s.sent_start ?? 0));
  const [sentEnd, setSentEnd] = useState<string>(String(s.sent_end ?? wa.total_recipients ?? 0));
  const [dRatio, setDRatio] = useState<string>(String(s.delivered_ratio ?? 0.95));
  const [fRatio, setFRatio] = useState<string>(String(s.failed_ratio ?? 0.05));
  const [growth, setGrowth] = useState<string>(s.growth ?? "linear");
  const [pauses, setPauses] = useState<any[]>(s.pauses ?? []);
  const [statusLabel, setStatusLabel] = useState<string>(s.status_label ?? "");

  const runtime = s.runtime ?? { active: false };

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-muted-foreground">Progressão automática</div>
        <Badge variant={runtime.active ? "default" : "outline"}>
          {runtime.paused_at ? "Pausada" : runtime.active ? "Rodando" : "Parada"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div>
          <Label className="text-xs">Início</Label>
          <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Fim</Label>
          <Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
        </div>
        <NumField label="Duração (s)" value={String(durationSec)} onChange={setDurationSec} />
        <NumField label="Intervalo refresh (s)" value={refresh} onChange={setRefresh} />
        <NumField label="Enviados início" value={sentStart} onChange={setSentStart} />
        <NumField label="Enviados fim" value={sentEnd} onChange={setSentEnd} />
        <div>
          <Label className="text-xs">Taxa entrega (0–1)</Label>
          <Input value={dRatio} onChange={(e) => setDRatio(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Taxa falha (0–1)</Label>
          <Input value={fRatio} onChange={(e) => setFRatio(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Curva</Label>
          <Select value={growth} onValueChange={setGrowth}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="linear">Linear</SelectItem>
              <SelectItem value="random">Aleatória</SelectItem>
              <SelectItem value="batches">Em lotes</SelectItem>
              <SelectItem value="stepped">Por etapas</SelectItem>
              <SelectItem value="real_plus">Real + offset</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Status durante execução</Label>
          <Input value={statusLabel} onChange={(e) => setStatusLabel(e.target.value)} placeholder="ex: Em execução" />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Pausas programadas (públicas)</Label>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setPauses([...pauses, { after_sent: 0, duration_sec: 60, status_label: "Pausada", recalc_eta: true }])
            }
          >
            <Plus className="mr-1 h-3 w-3" /> Nova
          </Button>
        </div>
        {pauses.map((p, i) => (
          <div key={i} className="grid grid-cols-5 gap-2 items-end">
            <NumField
              label="Após enviados"
              value={String(p.after_sent)}
              onChange={(v) => {
                const c = [...pauses]; c[i] = { ...p, after_sent: Number(v || 0) }; setPauses(c);
              }}
            />
            <NumField
              label="Duração (s)"
              value={String(p.duration_sec)}
              onChange={(v) => {
                const c = [...pauses]; c[i] = { ...p, duration_sec: Number(v || 0) }; setPauses(c);
              }}
            />
            <div className="col-span-2">
              <Label className="text-xs">Status</Label>
              <Input
                value={p.status_label ?? ""}
                onChange={(e) => { const c = [...pauses]; c[i] = { ...p, status_label: e.target.value }; setPauses(c); }}
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPauses(pauses.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-2">
        <Button
          size="sm"
          onClick={() =>
            onSave({
              start_at: startAt ? new Date(startAt).toISOString() : null,
              end_at: endAt ? new Date(endAt).toISOString() : null,
              duration_sec: durationSec === "" ? null : Number(durationSec),
              refresh_interval_sec: Number(refresh || 5),
              sent_start: Number(sentStart || 0),
              sent_end: Number(sentEnd || 0),
              delivered_ratio: Number(dRatio || 0),
              failed_ratio: Number(fRatio || 0),
              growth: growth as any,
              growth_params: {},
              pauses,
              status_label: statusLabel || null,
            })
          }
        >
          <Save className="mr-1 h-4 w-4" /> Salvar simulação
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => onControl("start")}>
            <Play className="mr-1 h-3 w-3" /> Iniciar
          </Button>
          <Button size="sm" variant="outline" onClick={() => onControl("pause")}>
            <Pause className="mr-1 h-3 w-3" /> Pausar
          </Button>
          <Button size="sm" variant="outline" onClick={() => onControl("resume")}>
            <Play className="mr-1 h-3 w-3" /> Retomar
          </Button>
          <Button size="sm" variant="outline" onClick={() => onControl("restart")}>
            <RotateCcw className="mr-1 h-3 w-3" /> Reiniciar
          </Button>
          <Button size="sm" variant="outline" onClick={() => onControl("sync_real")}>
            <RefreshCw className="mr-1 h-3 w-3" /> Sincronizar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onControl("disable")}>
            <Trash2 className="mr-1 h-3 w-3" /> Remover
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// GERADOR DE CLIQUES A PARTIR DOS ENTREGUES
// ============================================================================

function ClicksGeneratorCard({
  campaignId,
  settings,
  waDispatches,
  publicDispatches,
  publicSimulations,
  onChange,
}: {
  campaignId: string;
  settings: any;
  waDispatches: any[];
  publicDispatches: any[];
  publicSimulations: any[];
  onChange: () => void;
}) {
  const upsertFn = useServerFn(upsertCampaignPublicSettings);
  const cfg = (settings?.clicks_generator ?? {}) as ClicksGeneratorConfig;

  const [enabled, setEnabled] = useState<boolean>(cfg.enabled ?? false);
  const [initial, setInitial] = useState<string>(String(cfg.initial ?? 0));
  const [rate, setRate] = useState<string>(String(cfg.rate ?? 10));
  const [minPct, setMinPct] = useState<string>(
    cfg.min_pct != null ? String(cfg.min_pct) : "",
  );
  const [maxPct, setMaxPct] = useState<string>(
    cfg.max_pct != null ? String(cfg.max_pct) : "",
  );
  const [maxClicks, setMaxClicks] = useState<string>(
    cfg.max_clicks != null ? String(cfg.max_clicks) : "",
  );
  const [refresh, setRefresh] = useState<string>(
    String(cfg.refresh_interval_sec ?? 10),
  );
  const [growth, setGrowth] = useState<"linear" | "random">(
    cfg.growth ?? "random",
  );
  const [useSource, setUseSource] = useState<"real" | "public">(
    cfg.use_source ?? "public",
  );
  const [replaceOrAdd, setReplaceOrAdd] = useState<"replace" | "add">(
    cfg.replace_or_add ?? "replace",
  );
  const [hierarchical, setHierarchical] = useState<boolean>(
    cfg.hierarchical ?? false,
  );
  const [cityList, setCityList] = useState<
    { label: string; percent: string; country: string }[]
  >(
    (cfg.cities ?? []).map((c) => ({
      label: c.label,
      percent: String(c.percent ?? 0),
      country: c.country ?? "",
    })),
  );
  const [countryList, setCountryList] = useState<
    { label: string; percent: string }[]
  >(
    (cfg.countries ?? []).map((c) => ({
      label: c.label,
      percent: String(c.percent ?? 0),
    })),
  );

  // Total público de entregues (soma dos disparos com override ativo, senão reais).
  const publicDelivered = useMemo(() => {
    let total = 0;
    for (const wa of waDispatches) {
      const ov = publicDispatches.find((d) => d.wa_campaign_id === wa.id);
      if (ov?.enabled && ov?.mode === "fixed") {
        total += Number(ov?.fixed?.delivered ?? wa.delivered_count ?? 0);
        continue;
      }
      if (ov?.enabled && ov?.mode === "auto") {
        const sim = publicSimulations.find((s) => s.wa_campaign_id === wa.id);
        total += Number(sim?.delivered_end ?? wa.delivered_count ?? 0);
        continue;
      }
      total += Number(wa.delivered_count ?? 0);
    }
    return total;
  }, [waDispatches, publicDispatches, publicSimulations]);

  const realDelivered = useMemo(
    () => waDispatches.reduce((s, w) => s + Number(w.delivered_count ?? 0), 0),
    [waDispatches],
  );

  const parsedCities = cityList
    .filter((c) => c.label.trim())
    .map((c) => ({
      label: c.label.trim(),
      percent: Number(c.percent || 0),
      country: c.country.trim() || null,
    }));
  const parsedCountries = countryList
    .filter((c) => c.label.trim())
    .map((c) => ({
      label: c.label.trim(),
      percent: Number(c.percent || 0),
    }));

  const previewCfg: ClicksGeneratorConfig = {
    enabled,
    initial: Number(initial || 0),
    rate: Number(rate || 0),
    min_pct: minPct === "" ? null : Number(minPct),
    max_pct: maxPct === "" ? null : Number(maxPct),
    max_clicks: maxClicks === "" ? null : Number(maxClicks),
    refresh_interval_sec: Number(refresh || 10),
    growth,
    use_source: useSource,
    replace_or_add: replaceOrAdd,
    hierarchical,
    cities: parsedCities,
    countries: parsedCountries,
  };
  const seed = useMemo(() => seedFromString(campaignId), [campaignId]);
  const sourceDelivered =
    useSource === "real" ? realDelivered : publicDelivered;
  const previewNow = computeGeneratedClicks(sourceDelivered, previewCfg, seed);
  const projected =
    previewCfg.max_clicks != null
      ? Math.min(
          previewCfg.max_clicks,
          computeGeneratedClicks(sourceDelivered * 2, previewCfg, seed),
        )
      : computeGeneratedClicks(sourceDelivered * 2, previewCfg, seed);

  const citySum = parsedCities.reduce((a, b) => a + (b.percent || 0), 0);
  const countrySum = parsedCountries.reduce((a, b) => a + (b.percent || 0), 0);

  const save = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          campaignId,
          clicks_generator: {
            enabled,
            initial: Number(initial || 0),
            rate: Number(rate || 0),
            min_pct: minPct === "" ? null : Number(minPct),
            max_pct: maxPct === "" ? null : Number(maxPct),
            max_clicks: maxClicks === "" ? null : Number(maxClicks),
            refresh_interval_sec: Number(refresh || 10),
            growth,
            use_source: useSource,
            replace_or_add: replaceOrAdd,
            hierarchical,
            cities: parsedCities,
            countries: parsedCountries,
          },
        },
      }),
    onSuccess: () => {
      toast.success("Gerador de cliques salvo");
      onChange();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          Gerar cliques com base nos entregues
          {enabled && <Badge variant="secondary">Ativo</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Switch checked={enabled} onCheckedChange={setEnabled} />
          <span className="text-sm">
            {enabled ? "Cliques públicos derivados dos entregues" : "Desativado"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <NumField label="Cliques iniciais" value={initial} onChange={setInitial} />
          <NumField label="Taxa média (%)" value={rate} onChange={setRate} />
          <NumField
            label="% mínimo"
            value={minPct}
            onChange={setMinPct}
            placeholder="opcional"
          />
          <NumField
            label="% máximo"
            value={maxPct}
            onChange={setMaxPct}
            placeholder="opcional"
          />
          <NumField
            label="Máx. de cliques"
            value={maxClicks}
            onChange={setMaxClicks}
            placeholder="sem limite"
          />
          <NumField
            label="Intervalo (s)"
            value={refresh}
            onChange={setRefresh}
          />
          <div className="space-y-1">
            <Label className="text-xs">Crescimento</Label>
            <Select value={growth} onValueChange={(v) => setGrowth(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="random">Aleatório dentro da faixa</SelectItem>
                <SelectItem value="linear">Linear (taxa média)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fonte dos entregues</Label>
            <Select value={useSource} onValueChange={(v) => setUseSource(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Entregues públicos (real ou personalizado)</SelectItem>
                <SelectItem value="real">Somente entregues reais</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cliques reais</Label>
            <Select
              value={replaceOrAdd}
              onValueChange={(v) => setReplaceOrAdd(v as any)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="replace">Substituir</SelectItem>
                <SelectItem value="add">Somar aos reais</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-md border bg-muted/30 p-3 text-xs">
          <div className="mb-2 font-medium text-sm">Prévia</div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <div>
              <div className="text-muted-foreground">Entregues públicos</div>
              <div className="font-mono">{publicDelivered.toLocaleString("pt-BR")}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Entregues reais</div>
              <div className="font-mono">{realDelivered.toLocaleString("pt-BR")}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Taxa</div>
              <div className="font-mono">
                {minPct !== "" && maxPct !== ""
                  ? `${minPct}% – ${maxPct}%`
                  : `${rate}%`}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Cliques agora</div>
              <div className="font-mono">{previewNow.toLocaleString("pt-BR")}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Projeção (2× entregues)</div>
              <div className="font-mono">{projected.toLocaleString("pt-BR")}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Limite máximo</div>
              <div className="font-mono">
                {maxClicks === "" ? "—" : Number(maxClicks).toLocaleString("pt-BR")}
              </div>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Nunca diminui. Nunca ultrapassa entregues + iniciais. Pausa quando os
            entregues param ou a simulação pública está pausada.
            Distribuição por categoria usa os % definidos em cada lista abaixo.
          </p>
        </div>

        <div className="rounded-md border p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">Distribuição hierárquica</div>
              <div className="text-[11px] text-muted-foreground">
                Aloca o total primeiro por país e depois divide entre as
                cidades daquele país. Evita concentração em uma única cidade.
              </div>
            </div>
            <Switch checked={hierarchical} onCheckedChange={setHierarchical} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setCountryList([
                  { label: "Brasil", percent: "92" },
                  { label: "Portugal", percent: "3" },
                  { label: "Estados Unidos", percent: "2" },
                  { label: "Argentina", percent: "2" },
                  { label: "Paraguai", percent: "1" },
                ]);
                setCityList([
                  { label: "São Paulo", percent: "18", country: "Brasil" },
                  { label: "Rio de Janeiro", percent: "12", country: "Brasil" },
                  { label: "Belo Horizonte", percent: "8", country: "Brasil" },
                  { label: "Salvador", percent: "7", country: "Brasil" },
                  { label: "Brasília", percent: "7", country: "Brasil" },
                  { label: "Fortaleza", percent: "6", country: "Brasil" },
                  { label: "Curitiba", percent: "6", country: "Brasil" },
                  { label: "Manaus", percent: "5", country: "Brasil" },
                  { label: "Recife", percent: "5", country: "Brasil" },
                  { label: "Porto Alegre", percent: "5", country: "Brasil" },
                  { label: "Goiânia", percent: "4", country: "Brasil" },
                  { label: "Belém", percent: "3", country: "Brasil" },
                  { label: "Campinas", percent: "3", country: "Brasil" },
                  { label: "São Luís", percent: "3", country: "Brasil" },
                  { label: "Lisboa", percent: "2", country: "Portugal" },
                  { label: "Porto", percent: "1", country: "Portugal" },
                  { label: "Miami", percent: "1", country: "Estados Unidos" },
                  { label: "Orlando", percent: "1", country: "Estados Unidos" },
                  { label: "Buenos Aires", percent: "2", country: "Argentina" },
                  { label: "Assunção", percent: "1", country: "Paraguai" },
                ]);
                setHierarchical(true);
              }}
            >
              <Sparkles className="h-3 w-3 mr-1" /> Aplicar preset Brasil
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setCountryList([]);
                setCityList([]);
              }}
            >
              <Trash2 className="h-3 w-3 mr-1" /> Limpar listas
            </Button>
          </div>


          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">
                Países ({countryList.length}) — soma {countrySum.toFixed(1)}%
              </Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  setCountryList((l) => [...l, { label: "", percent: "0" }])
                }
              >
                <Plus className="h-3 w-3 mr-1" /> País
              </Button>
            </div>
            {countryList.map((c, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input
                  className="h-8"
                  placeholder="País"
                  value={c.label}
                  onChange={(e) =>
                    setCountryList((l) =>
                      l.map((it, j) =>
                        j === i ? { ...it, label: e.target.value } : it,
                      ),
                    )
                  }
                />
                <Input
                  className="h-8 w-24"
                  type="number"
                  placeholder="%"
                  value={c.percent}
                  onChange={(e) =>
                    setCountryList((l) =>
                      l.map((it, j) =>
                        j === i ? { ...it, percent: e.target.value } : it,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() =>
                    setCountryList((l) => l.filter((_, j) => j !== i))
                  }
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">
                Cidades ({cityList.length}) — soma {citySum.toFixed(1)}%
              </Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  setCityList((l) => [
                    ...l,
                    { label: "", percent: "0", country: "" },
                  ])
                }
              >
                <Plus className="h-3 w-3 mr-1" /> Cidade
              </Button>
            </div>
            {cityList.map((c, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input
                  className="h-8"
                  placeholder="Cidade"
                  value={c.label}
                  onChange={(e) =>
                    setCityList((l) =>
                      l.map((it, j) =>
                        j === i ? { ...it, label: e.target.value } : it,
                      ),
                    )
                  }
                />
                <Input
                  className="h-8 w-32"
                  placeholder="País (opcional)"
                  value={c.country}
                  onChange={(e) =>
                    setCityList((l) =>
                      l.map((it, j) =>
                        j === i ? { ...it, country: e.target.value } : it,
                      ),
                    )
                  }
                />
                <Input
                  className="h-8 w-24"
                  type="number"
                  placeholder="%"
                  value={c.percent}
                  onChange={(e) =>
                    setCityList((l) =>
                      l.map((it, j) =>
                        j === i ? { ...it, percent: e.target.value } : it,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => setCityList((l) => l.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">
              Quando a distribuição hierárquica está ativa, o campo "País" da
              cidade define a qual país ela pertence (case-insensitive).
              Cidades sem país recebem sobras proporcionais.
            </p>
          </div>
        </div>

        <div>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="mr-1 h-4 w-4" /> Salvar gerador
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// STATUS MAP CARD — remapeia status reais para status exibidos publicamente.
// Somente apresentação: nunca altera campaign_recipients.
// ============================================================================
const REMAPPABLE_STATUSES = [
  { key: "failed", label: "Falhou" },
  { key: "accepted", label: "Aceito" },
  { key: "pending", label: "Pendente" },
  { key: "processing", label: "Processando" },
  { key: "sent", label: "Enviado" },
  { key: "delivered", label: "Entregue" },
  { key: "read", label: "Lido" },
  { key: "replied", label: "Respondido" },
  { key: "opt_out", label: "Opt-out" },
  { key: "cancelled", label: "Cancelado" },
  { key: "skipped", label: "Ignorado" },
] as const;

const TARGET_STATUS_OPTIONS = [
  { value: "", label: "Manter status original" },
  { value: "sent", label: "Enviado" },
  { value: "delivered", label: "Entregue" },
  { value: "read", label: "Lido" },
  { value: "replied", label: "Respondido" },
  { value: "accepted", label: "Aceito" },
  { value: "pending", label: "Pendente" },
  { value: "failed", label: "Falhou" },
];

function StatusMapCard({
  campaignId,
  settings,
  onChange,
}: {
  campaignId: string;
  settings: any;
  onChange: () => void;
}) {
  const upsertFn = useServerFn(upsertCampaignPublicSettings);
  const initial = (settings?.status_map ?? {}) as Record<string, string | null>;

  const [failedAsSent, setFailedAsSent] = useState<boolean>(
    initial.failed === "sent",
  );
  const [map, setMap] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const s of REMAPPABLE_STATUSES) {
      const v = initial[s.key];
      if (typeof v === "string" && v) out[s.key] = v;
    }
    return out;
  });

  const effectiveMap = useMemo(() => {
    const out: Record<string, string | null> = { ...map };
    if (failedAsSent) out.failed = "sent";
    // Remove entradas vazias
    for (const k of Object.keys(out)) {
      if (!out[k]) delete out[k];
    }
    return out;
  }, [map, failedAsSent]);

  const save = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          campaignId,
          status_map: effectiveMap,
        },
      }),
    onSuccess: () => {
      toast.success("Mapeamento de status salvo");
      onChange();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          Mapeamento de status no histórico público
          {Object.keys(effectiveMap).length > 0 && (
            <Badge variant="secondary">
              {Object.keys(effectiveMap).length} regra(s)
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border p-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">
              Substituir status "Falhou" por "Enviado" no histórico público
            </div>
            <p className="text-[11px] text-muted-foreground">
              Atalho rápido. Registros com status real "failed" aparecem como
              "Enviado" apenas na página pública e no PDF. Números e horários
              originais são mantidos.
            </p>
          </div>
          <Switch checked={failedAsSent} onCheckedChange={setFailedAsSent} />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">
            Mapeamento detalhado (opcional) — sobrescreve o atalho acima
          </Label>
          <div className="grid gap-2">
            {REMAPPABLE_STATUSES.map((s) => (
              <div key={s.key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <div className="text-sm">{s.label}</div>
                <div className="text-xs text-muted-foreground">→</div>
                <Select
                  value={map[s.key] ?? ""}
                  onValueChange={(v) =>
                    setMap((m) => ({ ...m, [s.key]: v }))
                  }
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Manter status original" />
                  </SelectTrigger>
                  <SelectContent>
                    {TARGET_STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value || "keep"} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Aplica-se aos 100 destinatários mais recentes exibidos em cada
            bloco de "Histórico de disparos" na página pública. Não altera
            dados reais, métricas operacionais nem os disparos em /admin.
            Desligar as opções restaura imediatamente o status real.
          </p>
        </div>

        <div>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="mr-1 h-4 w-4" /> Salvar mapeamento
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
