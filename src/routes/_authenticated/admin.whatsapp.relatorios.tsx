import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { whatsappReport } from "@/lib/wa-reports.functions";
import { listWabas } from "@/lib/wa-wabas.functions";
import { listNumbers } from "@/lib/whatsapp-numbers.functions";
import { listClients } from "@/lib/clients.functions";

export const Route = createFileRoute("/_authenticated/admin/whatsapp/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios WhatsApp" }] }),
  component: Page,
});

function Page() {
  const reportFn = useServerFn(whatsappReport);
  const wabasFn = useServerFn(listWabas);
  const numsFn = useServerFn(listNumbers);
  const clientsFn = useServerFn(listClients);

  const { data: wabas = [] } = useQuery({ queryKey: ["wa-wabas"], queryFn: () => wabasFn() });
  const { data: numbers = [] } = useQuery({ queryKey: ["wa-numbers"], queryFn: () => numsFn() });
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => clientsFn() });

  const [f, setF] = useState<any>({ waba_ref_id: null, connection_id: null, client_id: null, from: "", to: "" });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v === "__all" ? null : v }));

  const { data: metrics, isFetching, refetch } = useQuery({
    queryKey: ["wa-report", f],
    queryFn: () => reportFn({ data: { ...f, from: f.from || null, to: f.to || null } }),
  });

  const cards = [
    { label: "Enviadas", value: metrics?.sent ?? 0 },
    { label: "Entregues", value: metrics?.delivered ?? 0 },
    { label: "Lidas", value: metrics?.read ?? 0 },
    { label: "Falhas", value: metrics?.failed ?? 0 },
    { label: "Respostas", value: metrics?.replied ?? 0 },
    { label: "Opt-outs", value: metrics?.opt_outs ?? 0 },
    { label: "Taxa entrega", value: `${metrics?.delivery_rate ?? 0}%` },
    { label: "Taxa leitura", value: `${metrics?.read_rate ?? 0}%` },
    { label: "Custo", value: `R$ ${(metrics?.cost ?? 0).toFixed(2)}` },
    { label: "Receita", value: `R$ ${(metrics?.revenue ?? 0).toFixed(2)}` },
    { label: "Lucro", value: `R$ ${(metrics?.profit ?? 0).toFixed(2)}` },
  ];

  return (
    <>
      <PageHeader title="Relatórios WhatsApp" description="Métricas por WABA, número, cliente e período." />
      <div className="rounded-xl border bg-card p-4 mb-4 grid gap-3 md:grid-cols-5">
        <div><Label>WABA</Label>
          <Select value={f.waba_ref_id ?? "__all"} onValueChange={(v) => set("waba_ref_id", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="__all">Todas</SelectItem>{wabas.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.nome_interno}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Número</Label>
          <Select value={f.connection_id ?? "__all"} onValueChange={(v) => set("connection_id", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="__all">Todos</SelectItem>{numbers.map((n: any) => <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Cliente</Label>
          <Select value={f.client_id ?? "__all"} onValueChange={(v) => set("client_id", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="__all">Todos</SelectItem>{clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>De</Label><Input type="date" value={f.from} onChange={(e) => set("from", e.target.value)} /></div>
        <div><Label>Até</Label><Input type="date" value={f.to} onChange={(e) => set("to", e.target.value)} /></div>
        <div className="md:col-span-5 flex justify-end"><Button onClick={() => refetch()} disabled={isFetching}>{isFetching ? "Calculando…" : "Atualizar"}</Button></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border bg-card p-4">
            <div className="text-xs text-muted-foreground">{c.label}</div>
            <div className="text-2xl font-semibold mt-1">{c.value}</div>
          </div>
        ))}
      </div>
    </>
  );
}
