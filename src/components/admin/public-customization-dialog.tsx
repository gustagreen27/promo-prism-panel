import { useEffect, useMemo, useState } from "react";
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

  Shuffle,
  Sparkles,
  Trash2,
} from "lucide-react";
import { generateBrazilPreset, shuffleGeoList } from "@/lib/geo-preset-generator";

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
  computeDispatchSnapshot,
  type DispatchSimRow,
} from "@/lib/dispatch-simulation";
import {
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
      <DialogContent className="max-w-5xl h-[92vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b bg-gradient-to-b from-muted/40 to-transparent">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            Personalização da página pública
            {data?.settings?.enabled && (
              <Badge className="ml-1 border-emerald-500/30 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300">
                Ativa
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="mt-1">
            <span className="font-medium text-foreground">{campaignName}</span>
            <span className="mx-1.5 text-muted-foreground/60">·</span>
            Camada de apresentação isolada — não afeta disparos reais nem métricas operacionais.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Carregando...
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col gap-4 px-6 pt-4">
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
              <TabsList className="w-full justify-start rounded-lg bg-muted/60 p-1">
                <TabsTrigger value="general" className="data-[state=active]:shadow-sm">
                  Métricas gerais
                </TabsTrigger>
                <TabsTrigger value="dispatches" className="data-[state=active]:shadow-sm">
                  Disparos
                  <span className="ml-2 rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {data.waDispatches.length}
                  </span>
                </TabsTrigger>
              </TabsList>
              <TabsContent value="general" className="flex-1 min-h-0 mt-3">
                <ScrollArea className="h-full pr-3">
                  <GeneralTab data={data} campaignId={campaignId} onChange={invalidate} />
                </ScrollArea>
              </TabsContent>
              <TabsContent value="dispatches" className="flex-1 min-h-0 mt-3">
                <ScrollArea className="h-full pr-3">
                  <DispatchesTab data={data} campaignId={campaignId} onChange={invalidate} />
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        )}

        <DialogFooter className="border-t bg-muted/30 px-6 py-3">
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
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border bg-card p-4 shadow-sm sm:flex sm:flex-wrap " +
        (attention
          ? "border-amber-500/60 ring-2 ring-amber-500/30"
          : enabled
            ? "border-emerald-500/30 bg-emerald-500/[0.03]"
            : "")
      }
    >
      <div className="flex min-w-0 items-center gap-3">
        <Switch
          checked={enabled}
          onCheckedChange={(v) => toggle.mutate(v)}
          className="data-[state=checked]:bg-emerald-500"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            {attention && <AlertTriangle className="h-4 w-4 text-amber-500" />}
            <span
              className={
                "h-2 w-2 rounded-full " +
                (enabled ? "bg-emerald-500 shadow-[0_0_0_3px] shadow-emerald-500/20" : "bg-muted-foreground/40")
              }
            />
            {enabled ? "Personalização ativa" : "Personalização desativada"}
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            {enabled
              ? "A página pública está exibindo os valores personalizados."
              : "A página pública está exibindo apenas dados reais."}
          </p>
        </div>
      </div>

      <div className="col-span-full flex flex-wrap items-center gap-2 sm:col-auto sm:ml-auto">
        {slug && (
          <Button variant="outline" size="sm" asChild>
            <a href={`/campaigns/${campaignId}`} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1 h-4 w-4" /> Ver pública
            </a>
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive"
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
        masterEnabled={data.settings?.enabled ?? false}
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
  const [contRate, setContRate] = useState<string>("120");
  // Quando preenchido, o ritmo é derivado automaticamente do tempo desejado.
  const [contFinishMin, setContFinishMin] = useState<string>("");

  const realSentNow = Number(wa.sent_count ?? 0);
  const defaultTarget = Math.max(realSentNow, Number(wa.total_recipients ?? 0));
  const [tgtSent, setTgtSent] = useState<string>(String(defaultTarget));
  const [tgtDelivered, setTgtDelivered] = useState<string>(String(Math.round(defaultTarget * 0.95)));
  const [tgtFailed, setTgtFailed] = useState<string>(String(defaultTarget - Math.round(defaultTarget * 0.95)));

  // Recalcula o ritmo necessário sempre que os números finais ou o tempo desejado mudam.
  const remainingNow = Math.max(0, Math.max(realSentNow, Number(tgtSent || 0)) - realSentNow);
  useEffect(() => {
    const mins = Number(contFinishMin || 0);
    if (mins > 0) {
      setContRate(String(Math.max(1, Math.ceil(remainingNow / mins))));
    }
  }, [remainingNow, contFinishMin]);


  // "Continuar do real": mantém os números reais como ponto de partida e segue
  // a progressão só na página pública (dados reais + simulados), mesmo com o
  // disparo real pausado. Nunca toca no disparo real.
  const continueFromReal = useMutation({
    mutationFn: async () => {
      const rate = Math.max(1, Number(contRate || 120));
      const realSent = Number(wa.sent_count ?? 0);
      const realDelivered = Number(wa.delivered_count ?? 0);
      const realFailed = Number(wa.failed_count ?? 0);
      const total = Math.max(realSent, Number(tgtSent || defaultTarget));
      const endDelivered = Math.min(total, Math.max(realDelivered, Number(tgtDelivered || 0)));
      const endFailed = Math.min(total, Math.max(realFailed, Number(tgtFailed || 0)));
      const remaining = Math.max(0, total - realSent);
      const durationSec = Math.max(60, Math.ceil((remaining / rate) * 60));

      await upsertFn({
        data: {
          waCampaignId: wa.id,
          campaignId,
          enabled: true,
          mode: "auto" as const,
          public_name: publicName || null,
          public_status: publicStatus || null,
        },
      });
      await simUpsertFn({
        data: {
          waCampaignId: wa.id,
          campaignId,
          start_at: new Date().toISOString(),
          end_at: null,
          duration_sec: durationSec,
          refresh_interval_sec: 5,
          sent_start: realSent,
          sent_end: total,
          delivered_ratio: total > 0 ? Math.min(1, endDelivered / total) : 0.95,
          failed_ratio: total > 0 ? Math.min(1, endFailed / total) : 0.05,
          delivered_start: realDelivered,
          failed_start: realFailed,
          delivered_end: endDelivered,
          failed_end: endFailed,
          growth: "random" as const,
          growth_params: { floor_real: true, random_min: 0.97, random_max: 1.03 },
          pauses: [],
          status_label: "Em execução",
        },
      });
      await simCtrlFn({ data: { waCampaignId: wa.id, action: "start" as const } });
    },

    onSuccess: () => {
      setEnabled(true);
      setMode("auto");
      toast.success("Continuando do ponto real na página pública");
      onChange();
    },
    onError: (e) => toast.error((e as Error).message),
  });

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

  const modeLabel =
    mode === "auto" ? "Progressão automática" : mode === "fixed" ? "Valores fixos" : "Dados reais";
  const modeDot =
    mode === "auto" ? "bg-sky-500" : mode === "fixed" ? "bg-violet-500" : "bg-muted-foreground/50";

  return (
    <Card
      className={
        "overflow-hidden border shadow-sm transition-colors " +
        (enabled ? "border-primary/30 ring-1 ring-primary/10" : "")
      }
    >
      <CardHeader className="border-b bg-muted/30 pb-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className={"h-2.5 w-2.5 shrink-0 rounded-full " + modeDot} />
            <div className="min-w-0">
              <CardTitle className="truncate text-base">{wa.name || "Sem nome"}</CardTitle>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
                  Real: {wa.status}
                </span>
                <span className="text-muted-foreground/40">·</span>
                <span>{modeLabel}</span>
              </div>
            </div>
          </div>
          <label className="flex shrink-0 items-center gap-2 rounded-full border bg-background px-2.5 py-1">
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              className="data-[state=checked]:bg-primary"
            />
            <span className="text-xs font-medium">Personalizar</span>
          </label>
        </div>

        {(() => {
          const sent = Number(wa.sent_count ?? 0);
          const total = Math.max(sent, Number(wa.total_recipients ?? 0));
          const pct = total ? Math.min(100, Math.round((sent / total) * 100)) : 0;
          return (
            <div className="mt-3 space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">
                  {sent.toLocaleString("pt-BR")} / {total.toLocaleString("pt-BR")}
                </span>
                <span className="text-muted-foreground/40">·</span>
                <span>{pct}% real</span>
                <span className="ml-auto inline-flex items-center gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {Number(wa.delivered_count ?? 0).toLocaleString("pt-BR")} entregues
                  </span>
                  <span className="text-rose-600 dark:text-rose-400">
                    {Number(wa.failed_count ?? 0).toLocaleString("pt-BR")} falhas
                  </span>
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })()}
      </CardHeader>

      <CardContent className={"space-y-4 pt-4 " + (enabled ? "" : "opacity-60")}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">Modo</Label>
            <div className="grid grid-cols-3 gap-1 rounded-lg border bg-muted/50 p-1">
              {[
                { v: "real", l: "Real" },
                { v: "fixed", l: "Fixo" },
                { v: "auto", l: "Auto" },
              ].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setMode(o.v)}
                  className={
                    "rounded-md px-2 py-1.5 text-xs font-medium transition-colors " +
                    (mode === o.v
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground")
                  }
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">Nome público</Label>
            <Input value={publicName} onChange={(e) => setPublicName(e.target.value)} placeholder={wa.name ?? ""} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">Status público</Label>
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
              className="mt-1 h-8 text-xs"
              placeholder="ou digite personalizado"
              value={publicStatus}
              onChange={(e) => setPublicStatus(e.target.value)}
            />
          </div>
        </div>

        {mode === "fixed" && (
          <section className="rounded-lg border bg-muted/20 p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Valores fixos
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <NumField label="Total" value={fTotal} onChange={setFTotal} />
              <NumField label="Enviados" value={fSent} onChange={setFSent} />
              <NumField label="Entregues" value={fDelivered} onChange={setFDelivered} />
              <NumField label="Falhas" value={fFailed} onChange={setFFailed} />
              <NumField label="Progresso %" value={fPercent} onChange={setFPercent} />
              <div className="space-y-1">
                <Label className="text-xs">Início</Label>
                <Input type="datetime-local" value={fStarted?.slice(0, 16) ?? ""} onChange={(e) => setFStarted(e.target.value ? new Date(e.target.value).toISOString() : "")} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">ETA</Label>
                <Input type="datetime-local" value={fEta?.slice(0, 16) ?? ""} onChange={(e) => setFEta(e.target.value ? new Date(e.target.value).toISOString() : "")} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Velocidade (texto)</Label>
                <Input value={fSpeed} onChange={(e) => setFSpeed(e.target.value)} placeholder="ex: 5k/min" />
              </div>
            </div>
          </section>
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

        {(() => {
          const realSent = Number(wa.sent_count ?? 0);
          const realDelivered = Number(wa.delivered_count ?? 0);
          const realFailed = Number(wa.failed_count ?? 0);
          const total = Math.max(realSent, Number(tgtSent || 0));
          const remaining = Math.max(0, total - realSent);
          const rateNum = Math.max(1, Number(contRate || 120));
          const etaMin = Math.ceil(remaining / rateNum);
          const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}min` : `${m} min`);
          const etaLabel = remaining === 0 ? "já no total" : `~${fmtMin(etaMin)}`;
          const etaClock =
            remaining === 0
              ? null
              : new Date(Date.now() + etaMin * 60_000).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                });
          const wantMin = Number(contFinishMin || 0);
          const neededRate = wantMin > 0 ? Math.max(1, Math.ceil(remaining / wantMin)) : null;
          const remDelivered = Math.max(0, Math.min(total, Number(tgtDelivered || 0)) - realDelivered);
          const remFailed = Math.max(0, Math.min(total, Number(tgtFailed || 0)) - realFailed);
          const sumWarn = Number(tgtDelivered || 0) + Number(tgtFailed || 0) > total;

          return (
            <section className="rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.08] to-transparent p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-500/15 text-emerald-600">
                  <Play className="h-3.5 w-3.5" />
                </span>
                <div className="text-sm font-semibold">Continuar do real</div>
                <Badge variant="outline" className="border-emerald-500/40 text-[10px] text-emerald-700 dark:text-emerald-300">
                  real + simulado
                </Badge>
              </div>

              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                A página pública parte dos números reais de agora e continua avançando sozinha — mesmo com o
                disparo pausado. Se o real voltar a andar, o público acompanha e nunca volta atrás.
              </p>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <MiniStat label="Ponto de partida" value={realSent.toLocaleString("pt-BR")} />
                <MiniStat label="Restam" value={remaining.toLocaleString("pt-BR")} />
                <MiniStat
                  label="Real hoje (entr./falhas)"
                  value={`${realDelivered.toLocaleString("pt-BR")} / ${realFailed.toLocaleString("pt-BR")}`}
                />
              </div>

              <div className="mt-3 rounded-lg border bg-background/60 p-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Números finais desejados
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <NumField label="Enviados (final)" value={tgtSent} onChange={setTgtSent} />
                  <NumField label="Entregues (final)" value={tgtDelivered} onChange={setTgtDelivered} />
                  <NumField label="Falhas (final)" value={tgtFailed} onChange={setTgtFailed} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">Atalhos entrega:</span>
                  {[90, 95, 98].map((p) => (
                    <Button
                      key={p}
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        const t = Math.max(0, Number(tgtSent || 0));
                        const d = Math.round((t * p) / 100);
                        setTgtDelivered(String(d));
                        setTgtFailed(String(t - d));
                      }}
                    >
                      {p}%
                    </Button>
                  ))}
                  {sumWarn && (
                    <span className="text-[11px] text-amber-600">
                      Entregues + falhas maior que enviados — será limitado ao total.
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div className="w-32 space-y-1">
                  <Label className="text-xs">Ritmo (msg/min)</Label>
                  <Input
                    value={contRate}
                    inputMode="numeric"
                    onChange={(e) => {
                      setContFinishMin("");
                      setContRate(e.target.value.replace(/\D/g, ""));
                    }}
                  />
                </div>
                <div className="w-32 space-y-1">
                  <Label className="text-xs">Concluir em (min)</Label>
                  <Input
                    value={contFinishMin}
                    placeholder="auto"
                    inputMode="numeric"
                    onChange={(e) => setContFinishMin(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5 pb-0.5">
                  {[60, 120, 300, 600].map((r) => (
                    <Button
                      key={r}
                      type="button"
                      size="sm"
                      variant={Number(contRate) === r && !contFinishMin ? "secondary" : "ghost"}
                      className="h-8 px-2.5 text-xs"
                      onClick={() => {
                        setContFinishMin("");
                        setContRate(String(r));
                      }}
                    >
                      {r}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border bg-background/60 p-3">
                <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
                  <MiniStat label="Restam enviar" value={remaining.toLocaleString("pt-BR")} />
                  <MiniStat
                    label="Restam entr./falhas"
                    value={`${remDelivered.toLocaleString("pt-BR")} / ${remFailed.toLocaleString("pt-BR")}`}
                  />
                  <MiniStat
                    label="Ritmo necessário"
                    value={neededRate ? `${neededRate.toLocaleString("pt-BR")}/min` : `${rateNum.toLocaleString("pt-BR")}/min`}
                  />
                  <MiniStat
                    label="Conclusão pública"
                    value={etaClock ? `${etaLabel} (${etaClock})` : etaLabel}
                  />
                </div>
                <Button
                  size="sm"
                  className="bg-emerald-600 text-white hover:bg-emerald-600/90"
                  disabled={continueFromReal.isPending}
                  onClick={() => continueFromReal.mutate()}
                >
                  <Play className="mr-1 h-4 w-4" />
                  {continueFromReal.isPending ? "Aplicando..." : "Continuar daqui"}
                </Button>
              </div>

            </section>
          );
        })()}



        <div className="-mx-4 flex flex-wrap items-center gap-2 border-t bg-muted/20 px-4 py-3 sm:-mx-6 sm:px-6">
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="mr-1 h-4 w-4" /> Salvar disparo
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Select value={dupTo || "__none"} onValueChange={(v) => setDupTo(v === "__none" ? "" : v)}>
              <SelectTrigger className="w-56 h-9"><SelectValue placeholder="Duplicar config para…" /></SelectTrigger>
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background/70 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}


function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function fmtClock(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function fmtDur(sec: number): string {
  if (!sec || sec <= 0) return "—";
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}min`;
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
  const simKey = `${wa.id}:${s.updated_at ?? "new"}:${s.runtime?.started_at ?? ""}:${s.runtime?.paused_at ?? ""}`;

  const realSent = Number(wa.sent_count ?? 0);
  const realDelivered = Number(wa.delivered_count ?? 0);
  const realFailed = Number(wa.failed_count ?? 0);
  const realTotal = Math.max(realSent, Number(wa.total_recipients ?? 0));

  const [startAt, setStartAt] = useState<string>(toLocalInput(s.start_at));
  const [endAt, setEndAt] = useState<string>(toLocalInput(s.end_at));
  const [durationSec, setDurationSec] = useState<string>(s.duration_sec != null ? String(s.duration_sec) : "3600");
  const [refresh, setRefresh] = useState<string>(String(s.refresh_interval_sec ?? 5));
  const [sentStart, setSentStart] = useState<string>(String(s.sent_start ?? realSent));
  const [sentEnd, setSentEnd] = useState<string>(String(s.sent_end ?? realTotal ?? 0));
  const [deliveredStart, setDeliveredStart] = useState<string>(String(s.delivered_start ?? realDelivered));
  const [failedStart, setFailedStart] = useState<string>(String(s.failed_start ?? realFailed));
  const [deliveredEnd, setDeliveredEnd] = useState<string>(
    s.delivered_end != null ? String(s.delivered_end) : String(Math.round(Number(s.sent_end ?? realTotal ?? 0) * 0.95)),
  );
  const [failedEnd, setFailedEnd] = useState<string>(
    s.failed_end != null ? String(s.failed_end) : String(Math.round(Number(s.sent_end ?? realTotal ?? 0) * 0.05)),
  );
  const [growth, setGrowth] = useState<string>(s.growth ?? "linear");
  const gp = (s.growth_params ?? {}) as Record<string, any>;
  const [randMin, setRandMin] = useState<string>(String(gp.random_min ?? 0.9));
  const [randMax, setRandMax] = useState<string>(String(gp.random_max ?? 1.1));
  const [batchSize, setBatchSize] = useState<string>(String(gp.batch_size ?? 100));
  const [batchInterval, setBatchInterval] = useState<string>(String(gp.batch_interval_sec ?? 30));
  const [offset, setOffset] = useState<string>(String(gp.offset ?? 0));
  const [manualValue, setManualValue] = useState<string>(String(s.runtime?.manual_value ?? 0));
  const [floorReal, setFloorReal] = useState<boolean>(Boolean(gp.floor_real));
  const [pauses, setPauses] = useState<any[]>(s.pauses ?? []);
  const [statusLabel, setStatusLabel] = useState<string>(s.status_label ?? "");
  const [busy, setBusy] = useState<string>("");

  // Ressincroniza o formulário sempre que a simulação salva mudar no servidor.
  useEffect(() => {
    const n = simulation ?? {};
    setStartAt(toLocalInput(n.start_at));
    setEndAt(toLocalInput(n.end_at));
    setDurationSec(n.duration_sec != null ? String(n.duration_sec) : "3600");
    setRefresh(String(n.refresh_interval_sec ?? 5));
    setSentStart(String(n.sent_start ?? realSent));
    setSentEnd(String(n.sent_end ?? realTotal ?? 0));
    setDeliveredStart(String(n.delivered_start ?? realDelivered));
    setFailedStart(String(n.failed_start ?? realFailed));
    setDeliveredEnd(
      n.delivered_end != null ? String(n.delivered_end) : String(Math.round(Number(n.sent_end ?? realTotal ?? 0) * 0.95)),
    );
    setFailedEnd(
      n.failed_end != null ? String(n.failed_end) : String(Math.round(Number(n.sent_end ?? realTotal ?? 0) * 0.05)),
    );
    setGrowth(n.growth ?? "linear");
    const p = (n.growth_params ?? {}) as Record<string, any>;
    setRandMin(String(p.random_min ?? 0.9));
    setRandMax(String(p.random_max ?? 1.1));
    setBatchSize(String(p.batch_size ?? 100));
    setBatchInterval(String(p.batch_interval_sec ?? 30));
    setOffset(String(p.offset ?? 0));
    setFloorReal(Boolean(p.floor_real));
    setManualValue(String(n.runtime?.manual_value ?? 0));
    setPauses(Array.isArray(n.pauses) ? n.pauses : []);
    setStatusLabel(n.status_label ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simKey]);

  // Relógio para a pré-visualização ao vivo.
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const ms = Math.max(1, Number(refresh || 5)) * 1000;
    const t = setInterval(() => setNow(new Date()), Math.min(ms, 5000));
    return () => clearInterval(t);
  }, [refresh]);

  const runtime = s.runtime ?? { active: false };
  const runState = runtime.paused_at ? "paused" : runtime.active ? "running" : "idle";
  const runBadge =
    runState === "running"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : runState === "paused"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : "border-muted-foreground/20 bg-muted text-muted-foreground";
  const runDot =
    runState === "running"
      ? "bg-emerald-500 animate-pulse"
      : runState === "paused"
        ? "bg-amber-500"
        : "bg-muted-foreground/40";

  const nSentStart = Math.max(0, Number(sentStart || 0));
  const nSentEnd = Math.max(nSentStart, Number(sentEnd || 0));
  const nDur = Math.max(1, Number(durationSec || 0) || 3600);
  const ratePerMin = Math.round(((nSentEnd - nSentStart) / nDur) * 60);
  const sumWarn = Number(deliveredEnd || 0) + Number(failedEnd || 0) > nSentEnd;

  const growthParams = useMemo(() => {
    const p: Record<string, unknown> = { floor_real: floorReal };
    if (growth === "random") {
      p.random_min = Number(randMin || 0.9);
      p.random_max = Number(randMax || 1.1);
    }
    if (growth === "batches") {
      p.batch_size = Number(batchSize || 100);
      p.batch_interval_sec = Number(batchInterval || 30);
    }
    if (growth === "real_plus") p.offset = Number(offset || 0);
    return p;
  }, [growth, floorReal, randMin, randMax, batchSize, batchInterval, offset]);

  const patch = useMemo(
    () => ({
      start_at: fromLocalInput(startAt),
      end_at: fromLocalInput(endAt),
      duration_sec: nDur,
      refresh_interval_sec: Math.max(1, Number(refresh || 5)),
      sent_start: nSentStart,
      sent_end: nSentEnd,
      delivered_start: Math.max(0, Number(deliveredStart || 0)),
      failed_start: Math.max(0, Number(failedStart || 0)),
      delivered_end: Math.max(0, Number(deliveredEnd || 0)),
      failed_end: Math.max(0, Number(failedEnd || 0)),
      delivered_ratio: nSentEnd > 0 ? Math.min(1, Number(deliveredEnd || 0) / nSentEnd) : null,
      failed_ratio: nSentEnd > 0 ? Math.min(1, Number(failedEnd || 0) / nSentEnd) : null,
      growth: growth as any,
      growth_params: growthParams,
      pauses,
      status_label: statusLabel || null,
    }),
    [startAt, endAt, nDur, refresh, nSentStart, nSentEnd, deliveredStart, failedStart, deliveredEnd, failedEnd, growth, growthParams, pauses, statusLabel],
  );

  // Pré-visualização ao vivo com a mesma função usada na página pública.
  const previewRow: DispatchSimRow = useMemo(
    () => ({
      wa_campaign_id: wa.id,
      campaign_id: null,
      start_at: patch.start_at,
      end_at: patch.end_at,
      duration_sec: patch.duration_sec,
      refresh_interval_sec: patch.refresh_interval_sec,
      sent_start: patch.sent_start,
      sent_end: patch.sent_end,
      delivered_ratio: patch.delivered_ratio,
      failed_ratio: patch.failed_ratio,
      delivered_start: patch.delivered_start,
      delivered_end: patch.delivered_end,
      failed_start: patch.failed_start,
      failed_end: patch.failed_end,
      percent_start: null,
      percent_end: null,
      growth: patch.growth,
      growth_params: { ...patch.growth_params, ...(growth === "manual" ? {} : {}) },
      pauses: patch.pauses as any,
      runtime: {
        active: true,
        started_at:
          runtime.started_at ?? patch.start_at ?? new Date(now.getTime() - 1000).toISOString(),
        paused_at: null,
        accumulated_pause_ms: runtime.accumulated_pause_ms ?? 0,
        manual_value: Number(manualValue || 0),
      },
      status_label: patch.status_label,
    }),
    [patch, wa.id, runtime.started_at, runtime.accumulated_pause_ms, manualValue, growth, now],
  );

  const previewAt = (offsetMs: number) =>
    computeDispatchSnapshot(
      { wa_campaign_id: wa.id, campaign_id: null, enabled: true, mode: "auto", public_name: null, public_status: null, fixed: null },
      previewRow,
      { name: wa.name ?? null, status: wa.status ?? null, total: realTotal, sent: realSent, delivered: realDelivered, failed: realFailed },
      new Date(now.getTime() + offsetMs),
    );

  const snapNow = previewAt(0);
  const snap5 = previewAt(5 * 60_000);
  const snap30 = previewAt(30 * 60_000);
  const snap60 = previewAt(60 * 60_000);

  const doSave = async () => {
    setBusy("save");
    try {
      await onSave(patch);
    } finally {
      setBusy("");
    }
  };
  const doControl = async (action: "start" | "pause" | "resume" | "restart" | "sync_real" | "disable") => {
    setBusy(action);
    try {
      // Salva antes para garantir que a linha exista e use os valores da tela.
      if (action !== "disable" && action !== "sync_real") await onSave(patch);
      await onControl(action);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const applyRate = (perMin: number) => {
    const delta = Math.max(0, nSentEnd - nSentStart);
    if (perMin <= 0 || delta <= 0) return;
    const sec = Math.max(1, Math.round((delta / perMin) * 60));
    setDurationSec(String(sec));
    const base = fromLocalInput(startAt) ?? new Date().toISOString();
    setEndAt(toLocalInput(new Date(new Date(base).getTime() + sec * 1000).toISOString()));
  };

  return (
    <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Progressão automática
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {ratePerMin > 0 ? `${ratePerMin.toLocaleString("pt-BR")} msg/min · ${fmtDur(nDur)}` : fmtDur(nDur)}
          </span>
          <span
            className={
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium " + runBadge
            }
          >
            <span className={"h-1.5 w-1.5 rounded-full " + runDot} />
            {runState === "running" ? "Rodando" : runState === "paused" ? "Pausada" : "Parada"}
          </span>
        </div>
      </div>

      {/* Pré-visualização ao vivo */}
      <div className="rounded-md border bg-background p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
            Pré-visualização pública
          </div>
          <span className="text-[11px] text-muted-foreground">
            atualiza a cada {Math.max(1, Number(refresh || 5))}s · {snapNow.status}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniStat label="Enviados agora" value={snapNow.sent.toLocaleString("pt-BR")} />
          <MiniStat label="Entregues" value={snapNow.delivered.toLocaleString("pt-BR")} />
          <MiniStat label="Falhas" value={snapNow.failed.toLocaleString("pt-BR")} />
          <MiniStat label="Progresso" value={`${snapNow.percent.toFixed(1)}%`} />
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${snapNow.percent}%` }} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniStat label="+5 min" value={snap5.sent.toLocaleString("pt-BR")} />
          <MiniStat label="+30 min" value={snap30.sent.toLocaleString("pt-BR")} />
          <MiniStat label="+1 h" value={snap60.sent.toLocaleString("pt-BR")} />
          <MiniStat label="Conclusão (ETA)" value={fmtClock(snapNow.eta_at)} />
        </div>
        {runState === "idle" && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Projeção considerando início agora. Clique em <strong>Iniciar</strong> para valer na página pública.
          </p>
        )}
      </div>

      {/* Janela de tempo */}
      <div>
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
          Janela de tempo
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Início</Label>
            <Input
              type="datetime-local"
              value={startAt}
              onChange={(e) => {
                setStartAt(e.target.value);
                const iso = fromLocalInput(e.target.value);
                if (iso) setEndAt(toLocalInput(new Date(new Date(iso).getTime() + nDur * 1000).toISOString()));
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fim</Label>
            <Input
              type="datetime-local"
              value={endAt}
              onChange={(e) => {
                setEndAt(e.target.value);
                const endIso = fromLocalInput(e.target.value);
                const startIso = fromLocalInput(startAt) ?? new Date().toISOString();
                if (endIso) {
                  const sec = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000);
                  if (sec > 0) setDurationSec(String(sec));
                }
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Duração (min)</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={String(Math.max(1, Math.round(nDur / 60)))}
              onChange={(e) => {
                const min = Math.max(1, Number(e.target.value || 1));
                setDurationSec(String(min * 60));
                const base = fromLocalInput(startAt) ?? new Date().toISOString();
                setEndAt(toLocalInput(new Date(new Date(base).getTime() + min * 60_000).toISOString()));
              }}
            />
          </div>
          <NumField label="Intervalo refresh (s)" value={refresh} onChange={setRefresh} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Atalhos:</span>
          {[15, 30, 60, 120, 240].map((m) => (
            <Button
              key={m}
              type="button"
              size="sm"
              variant={Math.round(nDur / 60) === m ? "secondary" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={() => {
                setDurationSec(String(m * 60));
                const base = fromLocalInput(startAt) ?? new Date().toISOString();
                if (!startAt) setStartAt(toLocalInput(base));
                setEndAt(toLocalInput(new Date(new Date(base).getTime() + m * 60_000).toISOString()));
              }}
            >
              {m < 60 ? `${m}min` : `${m / 60}h`}
            </Button>
          ))}
          <span className="mx-1 h-4 w-px bg-border" />
          <span className="text-[11px] text-muted-foreground">Ritmo:</span>
          {[60, 120, 300, 600].map((r) => (
            <Button
              key={r}
              type="button"
              size="sm"
              variant={ratePerMin === r ? "secondary" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={() => applyRate(r)}
            >
              {r}/min
            </Button>
          ))}
        </div>
      </div>

      {/* Volume */}
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
            Volume (início → fim)
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px]"
            onClick={() => {
              setSentStart(String(realSent));
              setDeliveredStart(String(realDelivered));
              setFailedStart(String(realFailed));
            }}
          >
            <RefreshCw className="mr-1 h-3 w-3" /> Usar números reais como início
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <NumField label="Enviados início" value={sentStart} onChange={setSentStart} />
          <NumField label="Entregues início" value={deliveredStart} onChange={setDeliveredStart} />
          <NumField label="Falhas início" value={failedStart} onChange={setFailedStart} />
          <NumField
            label="Enviados fim"
            value={sentEnd}
            onChange={(v) => {
              setSentEnd(v);
              const t = Math.max(0, Number(v || 0));
              setDeliveredEnd(String(Math.round(t * 0.95)));
              setFailedEnd(String(t - Math.round(t * 0.95)));
            }}
          />
          <NumField label="Entregues fim" value={deliveredEnd} onChange={setDeliveredEnd} />
          <NumField label="Falhas fim" value={failedEnd} onChange={setFailedEnd} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Atalhos entrega:</span>
          {[90, 95, 98, 100].map((p) => (
            <Button
              key={p}
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => {
                const d = Math.round((nSentEnd * p) / 100);
                setDeliveredEnd(String(d));
                setFailedEnd(String(nSentEnd - d));
              }}
            >
              {p}%
            </Button>
          ))}
          {sumWarn && (
            <span className="text-[11px] text-amber-600">
              Entregues + falhas maior que enviados — será limitado ao total.
            </span>
          )}
        </div>
      </div>

      {/* Comportamento */}
      <div>
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
          Comportamento
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Curva</Label>
            <Select value={growth} onValueChange={setGrowth}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="linear">Linear (constante)</SelectItem>
                <SelectItem value="random">Aleatória (variação natural)</SelectItem>
                <SelectItem value="batches">Em lotes</SelectItem>
                <SelectItem value="stepped">Por etapas</SelectItem>
                <SelectItem value="real_plus">Real + offset</SelectItem>
                <SelectItem value="manual">Manual (valor fixo)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status durante execução</Label>
            <Input value={statusLabel} onChange={(e) => setStatusLabel(e.target.value)} placeholder="ex: Em execução" />
          </div>
        </div>

        {growth === "random" && (
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <NumField label="Variação mín. (x)" value={randMin} onChange={setRandMin} />
            <NumField label="Variação máx. (x)" value={randMax} onChange={setRandMax} />
          </div>
        )}
        {growth === "batches" && (
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <NumField label="Tamanho do lote" value={batchSize} onChange={setBatchSize} />
            <NumField label="Intervalo do lote (s)" value={batchInterval} onChange={setBatchInterval} />
          </div>
        )}
        {growth === "real_plus" && (
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <NumField label="Offset sobre o real" value={offset} onChange={setOffset} />
          </div>
        )}
        {growth === "manual" && (
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <NumField label="Valor manual (enviados)" value={manualValue} onChange={setManualValue} />
          </div>
        )}

        <label className="mt-3 flex items-center gap-2 rounded-md border bg-background px-3 py-2">
          <Switch checked={floorReal} onCheckedChange={setFloorReal} />
          <span className="text-xs">
            Nunca ficar abaixo dos números reais (real + simulado)
          </span>
        </label>
      </div>

      {/* Pausas */}
      <div className="rounded-md border bg-background p-3 space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
            Pausas programadas
          </Label>
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() =>
              setPauses([
                ...pauses,
                {
                  after_sent: Math.round((nSentStart + nSentEnd) / 2),
                  duration_sec: 300,
                  status_label: "Pausada",
                  recalc_eta: true,
                },
              ])
            }
          >
            <Plus className="mr-1 h-3 w-3" /> Nova pausa
          </Button>
        </div>
        {pauses.length === 0 && (
          <p className="text-[11px] text-muted-foreground">Nenhuma pausa programada.</p>
        )}
        {pauses.map((p, i) => (
          <div key={i} className="grid grid-cols-5 gap-2 items-end rounded-md border bg-muted/30 p-2">
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
            <div className="col-span-2 space-y-1">
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

      {/* Ações da simulação */}
      <div className="rounded-md border bg-background p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
            Controle
          </div>
          {runtime.started_at && (
            <span className="text-[11px] text-muted-foreground">
              Iniciada em {fmtClock(runtime.started_at)}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={doSave} disabled={!!busy}>
            <Save className="mr-1 h-4 w-4" /> {busy === "save" ? "Salvando..." : "Salvar simulação"}
          </Button>

          <div className="ml-auto inline-flex flex-wrap items-center gap-1 rounded-md border bg-muted/40 p-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1"
              disabled={!!busy || runState === "running"}
              onClick={() => doControl("start")}
            >
              <Play className="h-3 w-3 text-emerald-600" /> {busy === "start" ? "..." : "Iniciar"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1"
              disabled={!!busy || runState !== "running"}
              onClick={() => doControl("pause")}
            >
              <Pause className="h-3 w-3 text-amber-600" /> Pausar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1"
              disabled={!!busy || runState !== "paused"}
              onClick={() => doControl("resume")}
            >
              <Play className="h-3 w-3 text-sky-600" /> Retomar
            </Button>
            <Button size="sm" variant="ghost" className="h-7 gap-1" disabled={!!busy} onClick={() => doControl("restart")}>
              <RotateCcw className="h-3 w-3" /> Reiniciar
            </Button>
            <Button size="sm" variant="ghost" className="h-7 gap-1" disabled={!!busy} onClick={() => doControl("sync_real")}>
              <RefreshCw className="h-3 w-3" /> Sincronizar
            </Button>
            <span className="mx-1 h-4 w-px bg-border" />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={!!busy}
              onClick={() => doControl("disable")}
            >
              <Trash2 className="h-3 w-3" /> Remover
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Iniciar/Reiniciar já salvam os campos acima automaticamente.
        </p>
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
  masterEnabled,
  waDispatches,
  publicDispatches,
  publicSimulations,
  onChange,
}: {
  campaignId: string;
  settings: any;
  masterEnabled: boolean;
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
  const [clicksPerMinute, setClicksPerMinute] = useState<string>(
    cfg.clicks_per_minute != null ? String(cfg.clicks_per_minute) : "",
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
    clicks_per_minute: clicksPerMinute === "" ? null : Number(clicksPerMinute),
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
  const previewNow = computeGeneratedClicks(sourceDelivered, previewCfg, seed, 0);
  const previewIn1Min = computeGeneratedClicks(sourceDelivered, previewCfg, seed, 60_000);
  const projected =
    previewCfg.max_clicks != null
      ? Math.min(
          previewCfg.max_clicks,
          computeGeneratedClicks(sourceDelivered * 2, previewCfg, seed, 60_000),
        )
      : computeGeneratedClicks(sourceDelivered * 2, previewCfg, seed, 60_000);

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
            clicks_per_minute: clicksPerMinute === "" ? null : Number(clicksPerMinute),
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

  const needsActivation =
    !masterEnabled && (parsedCountries.length > 0 || parsedCities.length > 0);

  const activateFn = useServerFn(upsertCampaignPublicSettings);
  const activate = useMutation({
    mutationFn: () => activateFn({ data: { campaignId, enabled: true } }),
    onSuccess: () => {
      toast.success("Personalização pública ativada e distribuição aplicada com sucesso.");
      onChange();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card className={needsActivation ? "border-amber-500 ring-2 ring-amber-500/40" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          {needsActivation && <AlertTriangle className="h-4 w-4 text-amber-500" />}
          Gerar cliques com base nos entregues
          {enabled && <Badge variant="secondary">Ativo</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {needsActivation && (
          <div className="rounded-md border border-amber-500/60 bg-amber-500/10 p-3 text-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="font-medium">Personalização desativada</div>
                <p className="text-xs text-muted-foreground">
                  As distribuições personalizadas de países e cidades estão preenchidas,
                  mas ainda não serão exibidas na página pública. Ative
                  “Ativar personalização” e salve as alterações para aplicar esses dados.
                </p>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => activate.mutate()}
                  disabled={activate.isPending}
                >
                  Ativar personalização
                </Button>
              </div>
            </div>
          </div>
        )}

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
          <NumField
            label="Cliques por minuto"
            value={clicksPerMinute}
            onChange={setClicksPerMinute}
            placeholder="0 (desativado)"
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
              <div className="text-muted-foreground">Cliques em 1 min</div>
              <div className="font-mono">{previewIn1Min.toLocaleString("pt-BR")}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Projeção (2× entregues, +1 min)</div>
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
            Nunca diminui. Respeita o limite máximo. Com "Cliques por minuto" &gt; 0,
            o total continua subindo mesmo sem novos entregues. Sem esse valor,
            o total só aumenta conforme os entregues crescem.
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
                const preset = generateBrazilPreset();
                setCountryList(preset.countries);
                setCityList(preset.cities);
                setHierarchical(true);
                if (!masterEnabled) {
                  toast.warning(
                    "Preset aplicado. Ative “Personalização” e salve para exibir na página pública.",
                  );
                } else {
                  toast.success("Preset Brasil aleatório gerado. Salve para publicar.");
                }
              }}
            >
              <Sparkles className="h-3 w-3 mr-1" /> Gerar preset Brasil (aleatório)
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={countryList.length === 0 && cityList.length === 0}
              onClick={() => {
                setCountryList((l) => shuffleGeoList(l.map((c) => ({ ...c, country: "" })), 0.15));
                setCityList((l) => shuffleGeoList(l, 0.3));
                toast.success("Listas intercaladas e percentuais redistribuídos.");
              }}
            >
              <Shuffle className="h-3 w-3 mr-1" /> Intercalar
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
  { value: "__keep", label: "Manter status original" },
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
                  value={map[s.key] ? map[s.key] : "__keep"}
                  onValueChange={(v) =>
                    setMap((m) => ({ ...m, [s.key]: v === "__keep" ? "" : v }))
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
