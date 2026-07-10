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
  const { data = [] } = useQuery({ queryKey: ["settings"], queryFn: () => list() });

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
  const { data } = useQuery({ queryKey: ["billing-settings"], queryFn: () => getBilling() });

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
