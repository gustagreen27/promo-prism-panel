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
  onChange,
}: {
  campaignId: string;
  slug?: string;
  enabled: boolean;
  onChange: () => void;
}) {
  const upsertFn = useServerFn(upsertCampaignPublicSettings);
  const clearFn = useServerFn(clearAllPublicOverrides);
  const toggle = useMutation({
    mutationFn: (v: boolean) => upsertFn({ data: { campaignId, enabled: v } }),
    onSuccess: () => {
      toast.success("Personalização atualizada");
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
    <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        <Switch checked={enabled} onCheckedChange={(v) => toggle.mutate(v)} />
        <span className="text-sm font-medium">
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
          <div key={it.id} className="flex items-center gap-2">
            <Input
              defaultValue={it.label}
              className="flex-1"
              onBlur={(e) =>
                e.target.value !== it.label &&
                upd.mutate({
                  id: it.id,
                  label: e.target.value,
                  count: it.count,
                  position: it.position,
                })
              }
            />
            <Input
              type="number"
              defaultValue={it.count}
              className="w-28"
              onBlur={(e) =>
                Number(e.target.value) !== it.count &&
                upd.mutate({
                  id: it.id,
                  label: it.label,
                  count: Number(e.target.value),
                  position: it.position,
                })
              }
            />
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
