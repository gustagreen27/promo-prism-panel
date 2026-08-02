import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Layers, Plus, Trash2, Play, Pause, XCircle, Rocket } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { metaVarsIn } from "@/lib/wa-variables";
import { listSplitTargets, createSplitDispatch, listSplitGroups, splitGroupAction } from "@/lib/wa-split.functions";

export const Route = createFileRoute("/_authenticated/admin/disparos/multi")({
  head: () => ({ meta: [{ title: "Disparo multi-BM — WhatsApp" }] }),
  component: MultiBmPage,
});

type Leg = { connection_id: string; template_id: string; weight: number };

function MultiBmPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/disparos"><ArrowLeft className="mr-2 h-4 w-4" />Voltar para disparos</Link>
        </Button>
      </div>
      <PageHeader
        title="Disparo multi-BM"
        description="Suba uma lista única e divida os contatos entre várias BMs — cada BM usa seu próprio número e template aprovado."
      />
      <Tabs defaultValue="novo">
        <TabsList>
          <TabsTrigger value="novo">Novo disparo dividido</TabsTrigger>
          <TabsTrigger value="grupos">Grupos criados</TabsTrigger>
        </TabsList>
        <TabsContent value="novo" className="pt-4"><NewSplit /></TabsContent>
        <TabsContent value="grupos" className="pt-4"><Groups /></TabsContent>
      </Tabs>
    </div>
  );
}

function NewSplit() {
  const targetsFn = useServerFn(listSplitTargets);
  const createFn = useServerFn(createSplitDispatch);

  const { data, isLoading } = useQuery({
    queryKey: ["split-targets"],
    queryFn: () => targetsFn({ data: {} }),
  });

  const [name, setName] = useState("");
  const [listId, setListId] = useState("");
  const [ratePerMin, setRatePerMin] = useState(60);
  const [batchSize, setBatchSize] = useState(25);
  const [maxPerDay, setMaxPerDay] = useState<string>("2000");
  const [scheduledAt, setScheduledAt] = useState("");
  const [legs, setLegs] = useState<Leg[]>([{ connection_id: "", template_id: "", weight: 1 }]);
  const [vars, setVars] = useState<Record<string, string>>({});

  const connections = data?.connections ?? [];
  const templates = data?.templates ?? [];
  const lists = data?.lists ?? [];

  const templatesFor = (connectionId: string) => {
    const conn = connections.find((c: any) => c.id === connectionId);
    if (!conn) return [];
    return templates.filter(
      (t: any) =>
        (conn.waba_ref_id && t.waba_ref_id === conn.waba_ref_id) || t.connection_id === connectionId,
    );
  };

  // Variáveis do corpo — usa o primeiro template escolhido como referência (texto igual em todas as BMs).
  const refTemplate = useMemo(() => {
    const first = legs.find((l) => l.template_id);
    return first ? templates.find((t: any) => t.id === first.template_id) : null;
  }, [legs, templates]);
  const bodyVars = useMemo(() => metaVarsIn(refTemplate?.body ?? ""), [refTemplate]);

  const totalWeight = legs.reduce((s, l) => s + (Number(l.weight) || 0), 0);

  const create = useMutation({
    mutationFn: (start: boolean) =>
      createFn({
        data: {
          name: name.trim(),
          list_id: listId,
          legs: legs.map((l) => ({
            connection_id: l.connection_id,
            template_id: l.template_id,
            weight: Math.max(1, Number(l.weight) || 1),
          })),
          variables_mapping: vars,
          send_rate_per_min: ratePerMin,
          batch_size: batchSize,
          max_per_day: maxPerDay ? Number(maxPerDay) : null,
          scheduled_at: !start && scheduledAt ? new Date(scheduledAt).toISOString() : null,
          start_now: start,
        },
      }),
    onSuccess: (r: any) => {
      const legsOut = (r?.split?.legs ?? []) as { count: number }[];
      toast.success(
        `Grupo criado: ${r.campaigns.length} campanhas · ${legsOut.reduce((s, l) => s + Number(l.count || 0), 0)} contatos divididos`,
      );
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao criar disparo dividido"),
  });

  function submit(start: boolean) {
    if (!name.trim()) return toast.error("Dê um nome ao disparo.");
    if (!listId) return toast.error("Selecione a lista de contatos.");
    if (legs.some((l) => !l.connection_id || !l.template_id))
      return toast.error("Cada BM precisa de um número e um template.");
    const dupe = new Set(legs.map((l) => l.connection_id));
    if (dupe.size !== legs.length) return toast.error("Há números repetidos entre as BMs.");
    for (const n of bodyVars) {
      if (!(vars[String(n)] ?? "").trim()) return toast.error(`Preencha a variável {{${n}}}.`);
    }
    create.mutate(start);
  }

  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">Carregando números e templates…</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Lista e identificação</CardTitle>
          <CardDescription>A mesma lista será dividida automaticamente entre as BMs escolhidas.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div>
            <Label className="text-xs">Nome do disparo</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Campanha Julho — 10 BMs" />
          </div>
          <div>
            <Label className="text-xs">Lista de contatos</Label>
            <Select value={listId} onValueChange={setListId}>
              <SelectTrigger><SelectValue placeholder="Selecione a lista" /></SelectTrigger>
              <SelectContent>
                {lists.map((l: any) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">2. BMs participantes</CardTitle>
            <CardDescription>Um número + um template aprovado por BM. O peso define a fatia da lista.</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setLegs((p) => [...p, { connection_id: "", template_id: "", weight: 1 }])}>
            <Plus className="mr-1 h-4 w-4" />Adicionar BM
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {legs.map((leg, i) => {
            const conn = connections.find((c: any) => c.id === leg.connection_id);
            const share = totalWeight > 0 ? (Number(leg.weight) || 0) / totalWeight : 0;
            return (
              <div key={i} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1.2fr_1.2fr_auto_auto] md:items-end">
                <div>
                  <Label className="text-xs">Número (BM {i + 1})</Label>
                  <Select
                    value={leg.connection_id}
                    onValueChange={(v) => setLegs((p) => p.map((l, idx) => (idx === i ? { ...l, connection_id: v, template_id: "" } : l)))}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione o número" /></SelectTrigger>
                    <SelectContent>
                      {connections.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.label} · {c.phone ?? "—"}{c.business_id ? ` · BM ${c.business_id}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {conn?.waba_name && <p className="mt-1 text-[11px] text-muted-foreground">WABA: {conn.waba_name}</p>}
                </div>
                <div>
                  <Label className="text-xs">Template aprovado</Label>
                  <Select
                    value={leg.template_id}
                    disabled={!leg.connection_id}
                    onValueChange={(v) => setLegs((p) => p.map((l, idx) => (idx === i ? { ...l, template_id: v } : l)))}
                  >
                    <SelectTrigger><SelectValue placeholder={leg.connection_id ? "Selecione o template" : "Escolha o número"} /></SelectTrigger>
                    <SelectContent>
                      {templatesFor(leg.connection_id).map((t: any) => (
                        <SelectItem key={t.id} value={t.id}>{t.name} · {t.language} · {t.status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-24">
                  <Label className="text-xs">Peso</Label>
                  <Input
                    type="number"
                    min={1}
                    value={leg.weight}
                    onChange={(e) => setLegs((p) => p.map((l, idx) => (idx === i ? { ...l, weight: Number(e.target.value) } : l)))}
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">{Math.round(share * 100)}% da lista</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={legs.length === 1}
                  onClick={() => setLegs((p) => p.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {bodyVars.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Texto das variáveis</CardTitle>
            <CardDescription>O mesmo conteúdo é aplicado ao template de todas as BMs.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {bodyVars.map((n) => (
              <div key={n}>
                <Label className="text-xs">Variável {`{{${n}}}`}</Label>
                <Input
                  value={vars[String(n)] ?? ""}
                  onChange={(e) => setVars((p) => ({ ...p, [String(n)]: e.target.value }))}
                  placeholder="Ex.: {{nome}}"
                />
              </div>
            ))}
            {refTemplate?.body && (
              <div className="md:col-span-2 rounded-md bg-muted/50 p-3 text-xs whitespace-pre-wrap">{refTemplate.body}</div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">4. Ritmo e execução</CardTitle>
          <CardDescription>Os limites valem por BM — 10 BMs a 2.000/dia = 20.000/dia no total.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div>
            <Label className="text-xs">Msg/min por BM</Label>
            <Input type="number" min={1} value={ratePerMin} onChange={(e) => setRatePerMin(Number(e.target.value))} />
          </div>
          <div>
            <Label className="text-xs">Lote por ciclo</Label>
            <Input type="number" min={1} value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))} />
          </div>
          <div>
            <Label className="text-xs">Limite diário por BM</Label>
            <Input type="number" min={1} value={maxPerDay} onChange={(e) => setMaxPerDay(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Agendar (opcional)</Label>
            <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button disabled={create.isPending} onClick={() => submit(true)}>
          <Rocket className="mr-2 h-4 w-4" />Criar e iniciar todas
        </Button>
        <Button variant="outline" disabled={create.isPending} onClick={() => submit(false)}>
          <Layers className="mr-2 h-4 w-4" />{scheduledAt ? "Criar e agendar" : "Criar como rascunho"}
        </Button>
      </div>
    </div>
  );
}

function Groups() {
  const listFn = useServerFn(listSplitGroups);
  const actionFn = useServerFn(splitGroupAction);
  const qc = useQueryClient();

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["split-groups"],
    queryFn: () => listFn(),
    refetchInterval: 15_000,
  });

  const act = useMutation({
    mutationFn: (p: { group_id: string; action: "start" | "pause" | "resume" | "cancel" | "delete" }) =>
      actionFn({ data: p }),
    onSuccess: () => { toast.success("Ação aplicada ao grupo"); qc.invalidateQueries({ queryKey: ["split-groups"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">Carregando…</p>;
  if (!groups.length) return <p className="p-6 text-sm text-muted-foreground">Nenhum grupo multi-BM criado ainda.</p>;

  return (
    <div className="space-y-4">
      {groups.map((g: any) => (
        <Card key={g.group_id}>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">{g.name}</CardTitle>
              <CardDescription>
                {g.legs.length} BMs · {g.total.toLocaleString("pt-BR")} contatos · {g.sent.toLocaleString("pt-BR")} enviados · {g.failed.toLocaleString("pt-BR")} falhas
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-1">
              <Button size="sm" variant="outline" onClick={() => act.mutate({ group_id: g.group_id, action: "start" })}>
                <Play className="mr-1 h-3.5 w-3.5" />Iniciar
              </Button>
              <Button size="sm" variant="outline" onClick={() => act.mutate({ group_id: g.group_id, action: "pause" })}>
                <Pause className="mr-1 h-3.5 w-3.5" />Pausar
              </Button>
              <Button size="sm" variant="outline" onClick={() => act.mutate({ group_id: g.group_id, action: "cancel" })}>
                <XCircle className="mr-1 h-3.5 w-3.5" />Cancelar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { if (confirm("Excluir todas as campanhas deste grupo?")) act.mutate({ group_id: g.group_id, action: "delete" }); }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {g.legs.map((l: any) => (
              <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{l.connection?.display_name ?? "—"}</span>
                  <span className="text-muted-foreground"> · {l.connection?.display_phone ?? "—"} · {l.template?.name ?? "—"}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{l.status}</Badge>
                  {(l.sent_count ?? 0).toLocaleString("pt-BR")}/{(l.total_recipients ?? 0).toLocaleString("pt-BR")}
                  <Link className="underline" to="/admin/disparos/$id" params={{ id: l.id }}>abrir</Link>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
