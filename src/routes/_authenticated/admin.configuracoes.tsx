import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { PageHeader } from "@/components/admin/page-header";
import { CONFIG_TABS } from "@/components/admin/hub-tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listSettings, upsertSetting } from "@/lib/settings.functions";
import { getBillingSettings, adminUpdateBillingSettings } from "@/lib/billing.functions";
import { getPlatformCapacity, adminUpdatePlatformCapacity, adminListPlatformCapacityAudit, adminUpdateCapacityAutomation, adminRunCapacityAutomationNow } from "@/lib/platform-capacity.functions";
import { Switch } from "@/components/ui/switch";
import { ErrorCard } from "@/components/admin/query-state";

const searchSchema = z.object({
  tab: fallback(z.string(), "geral").default("geral"),
});

export const Route = createFileRoute("/_authenticated/admin/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Painel" }] }),
  validateSearch: zodValidator(searchSchema),
  component: Page,
});


function Page() {
  const { tab } = Route.useSearch();
  const list = useServerFn(listSettings);
  const save = useServerFn(upsertSetting);
  const qc = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: () => list() });
  const { data = [], error: settingsError, refetch: refetchSettings } = settingsQuery;

  const [goal, setGoal] = useState("");
  const [costPerMsg, setCostPerMsg] = useState("");
  const [companyName, setCompanyName] = useState("");

  useEffect(() => {
    const find = (k: string) => (data as any[]).find((s) => s.key === k)?.value;
    setGoal(String(find("monthly_goal")?.amount ?? ""));
    setCostPerMsg(String(find("cost_per_message")?.amount ?? ""));
    setCompanyName(String(find("company")?.name ?? ""));
  }, [data]);

  const saveMut = useMutation({
    mutationFn: ({ key, value }: { key: string; value: any }) => save({ data: { key, value } }),
    onSuccess: () => { toast.success("Salvo"); qc.invalidateQueries({ queryKey: ["settings"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  return (
    <>
      <PageHeader tabs={CONFIG_TABS} title="Configurações" description="Metas, preferências e dados da empresa." />

      {tab === "geral" && (
        <div className="space-y-6">
          {settingsError && <ErrorCard error={settingsError} onRetry={() => refetchSettings()} />}
          <section className="rounded-xl border bg-card p-5">
            <h3 className="text-sm font-semibold">Meta mensal de faturamento</h3>
            <p className="text-xs text-muted-foreground">Usada no dashboard para a barra de progresso.</p>
            <div className="mt-3 flex items-end gap-2">
              <div className="flex-1"><Label>Valor (R$)</Label><Input type="number" step="0.01" value={goal} onChange={(e) => setGoal(e.target.value)} /></div>
              <Button onClick={() => saveMut.mutate({ key: "monthly_goal", value: { amount: Number(goal || 0) } })}>Salvar</Button>
            </div>
          </section>

          <section className="rounded-xl border bg-card p-5">
            <h3 className="text-sm font-semibold">Custo padrão por mensagem</h3>
            <p className="text-xs text-muted-foreground">Usado nos relatórios de campanha.</p>
            <div className="mt-3 flex items-end gap-2">
              <div className="flex-1"><Label>R$ por mensagem</Label><Input type="number" step="0.001" value={costPerMsg} onChange={(e) => setCostPerMsg(e.target.value)} /></div>
              <Button onClick={() => saveMut.mutate({ key: "cost_per_message", value: { amount: Number(costPerMsg || 0) } })}>Salvar</Button>
            </div>
          </section>

          <section className="rounded-xl border bg-card p-5">
            <h3 className="text-sm font-semibold">Dados da empresa</h3>
            <div className="mt-3 flex items-end gap-2">
              <div className="flex-1"><Label>Nome</Label><Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} /></div>
              <Button onClick={() => saveMut.mutate({ key: "company", value: { name: companyName } })}>Salvar</Button>
            </div>
          </section>

          <CapacitySection />

          <BillingSection />
        </div>
      )}

      {tab !== "geral" && (
        <section className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Seção <span className="font-semibold text-foreground">{tab}</span> em breve.
        </section>
      )}
    </>
  );
}


function BillingSection() {
  const getBilling = useServerFn(getBillingSettings);
  const updateBilling = useServerFn(adminUpdateBillingSettings);
  const qc = useQueryClient();
  const billingQuery = useQuery({ queryKey: ["billing-settings"], queryFn: () => getBilling() });
  const { data, error: billingError, refetch: refetchBilling } = billingQuery;

  const [price, setPrice] = useState("");
  const [minimum, setMinimum] = useState("");
  const [minMessages, setMinMessages] = useState("");
  useEffect(() => {
    if (data) {
      setPrice(((data.default_price_cents ?? 15) / 100).toFixed(2).replace(".", ","));
      setMinimum(((data.minimum_deposit_cents ?? 15000) / 100).toFixed(2).replace(".", ","));
      setMinMessages(String((data as any).default_minimum_messages ?? 2500));
    }
  }, [data]);

  const parse = (s: string) => Math.round(Number(s.replace(/\./g, "").replace(",", ".")) * 100);

  const save = useMutation({
    mutationFn: () => updateBilling({ data: {
      default_price_cents: parse(price),
      minimum_deposit_cents: parse(minimum),
      default_minimum_messages: Math.max(1, parseInt(minMessages || "0", 10)),
    } }),
    onSuccess: () => { toast.success("Cobrança atualizada"); qc.invalidateQueries({ queryKey: ["billing-settings"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const priceCents = parse(price || "0");
  const minMsgN = Math.max(0, parseInt(minMessages || "0", 10));
  const minDepCents = parse(minimum || "0");
  const requiredCents = Math.max(minDepCents, priceCents * minMsgN);
  const fmtBRL = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (billingError) {
    return <ErrorCard error={billingError} onRetry={() => refetchBilling()} />;
  }

  return (
    <section className="rounded-xl border bg-card p-5">
      <h3 className="text-sm font-semibold">Cobrança (carteira SaaS)</h3>
      <p className="text-xs text-muted-foreground">
        Cada mensagem enviada desconta do saldo do cliente. O depósito mínimo real será o maior valor entre o depósito mínimo global e (mínimo de mensagens × preço da mensagem).
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <Label>Preço por mensagem (R$)</Label>
          <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,15" />
        </div>
        <div>
          <Label>Depósito mínimo global (R$)</Label>
          <Input inputMode="decimal" value={minimum} onChange={(e) => setMinimum(e.target.value)} placeholder="150,00" />
        </div>
        <div>
          <Label>Mínimo padrão de mensagens</Label>
          <Input inputMode="numeric" value={minMessages} onChange={(e) => setMinMessages(e.target.value.replace(/\D/g, ""))} placeholder="2500" />
        </div>
      </div>
      <div className="mt-3 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
        Valor mínimo exigido para o cliente padrão:{" "}
        <span className="font-semibold text-foreground">{fmtBRL(requiredCents)}</span>
        {" "}({minMsgN.toLocaleString("pt-BR")} × {fmtBRL(priceCents)} vs mínimo global {fmtBRL(minDepCents)})
      </div>
      <div className="mt-3">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>Salvar cobrança</Button>
      </div>
    </section>
  );
}

function CapacitySection() {
  const getCap = useServerFn(getPlatformCapacity);
  const updateCap = useServerFn(adminUpdatePlatformCapacity);
  const updateAuto = useServerFn(adminUpdateCapacityAutomation);
  const runNow = useServerFn(adminRunCapacityAutomationNow);
  const listAudit = useServerFn(adminListPlatformCapacityAudit);
  const qc = useQueryClient();

  const { data, error, refetch } = useQuery({
    queryKey: ["platform-capacity"],
    queryFn: () => getCap(),
    refetchInterval: 60_000,
  });
  const { data: audit = [] } = useQuery({ queryKey: ["platform-capacity-audit"], queryFn: () => listAudit() });

  const [capacity, setCapacity] = useState("");
  const [completed, setCompleted] = useState("");
  const [note, setNote] = useState("");

  const [autoEnabled, setAutoEnabled] = useState(false);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("22:00");
  const [interval, setIntervalMin] = useState("15");
  const [minStep, setMinStep] = useState("1000");
  const [maxStep, setMaxStep] = useState("5000");
  const [target, setTarget] = useState("0");

  useEffect(() => {
    if (data) {
      setCapacity(String(data.daily_capacity));
      setCompleted(String(data.daily_completed));
      setNote(data.internal_note ?? "");
      setAutoEnabled(data.auto_enabled);
      setStartTime(data.auto_start_time);
      setEndTime(data.auto_end_time);
      setIntervalMin(String(data.auto_interval_minutes));
      setMinStep(String(data.auto_min_step));
      setMaxStep(String(data.auto_max_step));
      setTarget(String(data.auto_target_completed));
    }
  }, [data]);

  const toInt = (s: string) => Math.max(0, parseInt(s || "0", 10) || 0);
  const cap = toInt(capacity);
  const done = toInt(completed);
  const available = Math.max(cap - done, 0);

  const issues: string[] = [];
  if (cap <= 0) issues.push("A capacidade diária deve ser maior que zero.");
  if (done > cap) issues.push("O total disparado hoje não pode ultrapassar a capacidade diária.");

  const minN = toInt(minStep);
  const maxN = toInt(maxStep);
  const targetN = toInt(target);
  const autoIssues: string[] = [];
  if (maxN < minN) autoIssues.push("A quantidade máxima deve ser maior ou igual à mínima.");
  if (toInt(interval) < 1) autoIssues.push("O intervalo deve ser de pelo menos 1 minuto.");
  if (targetN > cap) autoIssues.push("O total disparado máximo não pode ultrapassar a capacidade diária.");

  const save = useMutation({
    mutationFn: () => updateCap({ data: {
      daily_capacity: cap, daily_completed: done,
      internal_note: note.trim() ? note.trim() : null,
    } }),
    onSuccess: () => {
      toast.success("Capacidade atualizada");
      qc.invalidateQueries({ queryKey: ["platform-capacity"] });
      qc.invalidateQueries({ queryKey: ["platform-capacity-audit"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const saveAuto = useMutation({
    mutationFn: () => updateAuto({ data: {
      auto_enabled: autoEnabled,
      auto_start_time: startTime,
      auto_end_time: endTime,
      auto_interval_minutes: Math.max(1, toInt(interval)),
      auto_min_step: minN,
      auto_max_step: maxN,
      auto_target_completed: targetN,
    } }),
    onSuccess: () => {
      toast.success("Automação salva");
      qc.invalidateQueries({ queryKey: ["platform-capacity"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const run = useMutation({
    mutationFn: () => runNow(),
    onSuccess: (r: any) => {
      if (r?.ran) toast.success(`Atualização executada: +${nf(Number(r.added ?? 0))}`);
      else toast.info(`Nada executado (${r?.reason ?? "sem motivo"})`);
      qc.invalidateQueries({ queryKey: ["platform-capacity"] });
      qc.invalidateQueries({ queryKey: ["platform-capacity-audit"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const previewAdd = Math.round((minN + maxN) / 2);
  const previewDone = Math.min(done + previewAdd, targetN > 0 ? Math.min(targetN, cap) : cap);
  const previewAvail = Math.max(cap - previewDone, 0);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

  if (error) return <ErrorCard error={error} onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-semibold">Capacidade diária da plataforma</h3>
        <p className="text-xs text-muted-foreground">
          Valor global da Next Disparos, igual para todas as empresas e usuários. Apenas informativo — não bloqueia disparos nem altera créditos.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Capacidade diária total</Label>
            <Input inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value.replace(/\D/g, ""))} placeholder="2600000" />
          </div>
          <div>
            <Label>Total disparado hoje</Label>
            <Input inputMode="numeric" value={completed} onChange={(e) => setCompleted(e.target.value.replace(/\D/g, ""))} placeholder="2200000" />
          </div>
          <div>
            <Label>Limite disponível hoje</Label>
            <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm font-semibold tabular-nums">
              {nf(available)}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">Calculado automaticamente</p>
          </div>
        </div>

        <div className="mt-3">
          <Label>Observação interna (opcional)</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: capacidade reduzida por manutenção" />
        </div>

        {issues.length > 0 && (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {issues.map((i) => <div key={i}>• {i}</div>)}
          </div>
        )}

        <div className="mt-3 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
          Prévia para os clientes: capacidade <span className="font-semibold text-foreground">{nf(cap)}</span> ·
          total disparado <span className="font-semibold text-foreground">{nf(done)}</span> ·
          disponível <span className="font-semibold text-foreground">{nf(available)}</span>
          {data?.updated_at ? <> · última atualização {fmtDate(data.updated_at)}</> : null}
        </div>

        <div className="mt-3">
          <Button onClick={() => save.mutate()} disabled={save.isPending || issues.length > 0}>Atualizar capacidade</Button>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Atualização automática</h3>
            <p className="text-xs text-muted-foreground">
              Roda no servidor (não depende do painel aberto). A cada intervalo soma uma quantidade aleatória ao total disparado.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{autoEnabled ? "Ativa" : "Desativada"}</span>
            <Switch checked={autoEnabled} onCheckedChange={setAutoEnabled} />
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Horário de início</Label>
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div>
            <Label>Horário de término</Label>
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
          <div>
            <Label>Intervalo (minutos)</Label>
            <Input inputMode="numeric" value={interval} onChange={(e) => setIntervalMin(e.target.value.replace(/\D/g, ""))} placeholder="15" />
          </div>
          <div>
            <Label>Quantidade mínima por atualização</Label>
            <Input inputMode="numeric" value={minStep} onChange={(e) => setMinStep(e.target.value.replace(/\D/g, ""))} placeholder="1000" />
          </div>
          <div>
            <Label>Quantidade máxima por atualização</Label>
            <Input inputMode="numeric" value={maxStep} onChange={(e) => setMaxStep(e.target.value.replace(/\D/g, ""))} placeholder="5000" />
          </div>
          <div>
            <Label>Total disparado máximo desejado</Label>
            <Input inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, ""))} placeholder="2600000" />
            <p className="mt-1 text-[11px] text-muted-foreground">0 = usar a capacidade diária. Ao atingir, a automação é pausada.</p>
          </div>
        </div>

        {autoIssues.length > 0 && (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {autoIssues.map((i) => <div key={i}>• {i}</div>)}
          </div>
        )}

        <div className="mt-3 rounded-md border bg-muted/30 p-3 text-xs">
          <div className="font-semibold">Prévia da próxima atualização</div>
          <div className="mt-1 grid gap-1 sm:grid-cols-2">
            <div>Capacidade diária: <span className="font-semibold">{nf(cap)}</span></div>
            <div>Total disparado atual: <span className="font-semibold">{nf(done)}</span></div>
            <div>Quantidade que será adicionada: <span className="font-semibold">entre {nf(minN)} e {nf(maxN)}</span> (média {nf(previewAdd)})</div>
            <div>Novo total disparado (estimado): <span className="font-semibold">{nf(previewDone)}</span></div>
            <div>Novo limite disponível calculado: <span className="font-semibold">{nf(previewAvail)}</span></div>
            <div>Última execução automática: <span className="font-semibold">{data?.auto_last_run_at ? fmtDate(data.auto_last_run_at) : "—"}</span></div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => saveAuto.mutate()} disabled={saveAuto.isPending || autoIssues.length > 0}>Salvar automação</Button>
          <Button variant="outline" onClick={() => run.mutate()} disabled={run.isPending}>Executar agora</Button>
        </div>
      </section>

      {audit.length > 0 && (
        <section className="rounded-xl border bg-card p-5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Histórico de alterações</h4>
          <div className="mt-2 space-y-2">
            {(audit as any[]).map((a) => (
              <div key={a.id} className="rounded-md border p-2 text-xs">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">{a.changed_by_name ?? (a.changed_by ? "Administrador" : "Automação")}</span>
                  <span className="text-muted-foreground">{fmtDate(a.created_at)}</span>
                </div>
                <div className="mt-1 text-muted-foreground">
                  {a.previous
                    ? <>De {nf(Number(a.previous.daily_capacity))} / {nf(Number(a.previous.daily_completed))} / {nf(Number(a.previous.daily_available))} </>
                    : <>Criação inicial </>}
                  → {nf(Number(a.next.daily_capacity))} / {nf(Number(a.next.daily_completed))} / {nf(Number(a.next.daily_available))}
                </div>
                {a.internal_note && <div className="mt-1 italic text-muted-foreground">“{a.internal_note}”</div>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const nf = (n: number) => n.toLocaleString("pt-BR");
