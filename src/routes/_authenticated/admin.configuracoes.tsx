import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listSettings, upsertSetting } from "@/lib/settings.functions";
import { getBillingSettings, adminUpdateBillingSettings } from "@/lib/billing.functions";

export const Route = createFileRoute("/_authenticated/admin/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Painel" }] }),
  component: Page,
});

function Page() {
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
      <PageHeader title="Configurações" description="Metas, preferências e dados da empresa." />

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
  useEffect(() => {
    if (data) {
      setPrice(((data.default_price_cents ?? 15) / 100).toFixed(2).replace(".", ","));
      setMinimum(((data.minimum_deposit_cents ?? 15000) / 100).toFixed(2).replace(".", ","));
    }
  }, [data]);

  const parse = (s: string) => Math.round(Number(s.replace(/\./g, "").replace(",", ".")) * 100);

  const save = useMutation({
    mutationFn: () => updateBilling({ data: { default_price_cents: parse(price), minimum_deposit_cents: parse(minimum) } }),
    onSuccess: () => { toast.success("Cobrança atualizada"); qc.invalidateQueries({ queryKey: ["billing-settings"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  return (
    <section className="rounded-xl border bg-card p-5">
      <h3 className="text-sm font-semibold">Cobrança (carteira SaaS)</h3>
      <p className="text-xs text-muted-foreground">Valor cobrado do saldo do cliente por cada mensagem enviada, e valor mínimo de depósito.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Preço por mensagem (R$)</Label>
          <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,15" />
        </div>
        <div>
          <Label>Depósito mínimo (R$)</Label>
          <Input inputMode="decimal" value={minimum} onChange={(e) => setMinimum(e.target.value)} placeholder="150,00" />
        </div>
      </div>
      <div className="mt-3">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>Salvar cobrança</Button>
      </div>
    </section>
  );
}
