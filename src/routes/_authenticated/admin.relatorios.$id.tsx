import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Printer, Trash2, ArrowLeft, User, Calendar, Tag, Folder, Wallet, MailCheck, Send, Hourglass, XCircle, Layers, BarChart3, Clock } from "lucide-react";
import { toast } from "sonner";
import {
  applyFinalValue,
  computeCampaign,
  computeTotals,
  fmtBRL,
  fmtNum,
  fmtPct,
  formatBRDate,
  formatBRDateTime,
  type Campaign,
} from "@/lib/report-utils";

type ReportRow = {
  id: string;
  client_name: string;
  report_date: string;
  reference: string | null;
  project: string | null;
  final_value: number | null;
  campaigns: Campaign[];
  created_at: string;
  generated_at: string | null;
};

export const Route = createFileRoute("/_authenticated/admin/relatorios/$id")({
  head: () => ({ meta: [{ title: "Relatório — Painel" }] }),
  component: ReportPage,
});

function ReportPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [generatedIso, setGeneratedIso] = useState<string>("");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["report", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("id, client_name, report_date, reference, project, final_value, campaigns, created_at, generated_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as ReportRow | null;
    },
  });

  useEffect(() => {
    if (!data) return;
    const base = data.generated_at ?? data.created_at;
    setGeneratedIso(toLocalInputValue(new Date(base)));
  }, [data]);

  async function handleDelete() {
    if (!confirm("Excluir este relatório?")) return;
    const { error } = await supabase.from("reports").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Excluído");
    navigate({ to: "/admin/relatorios" });
  }

  async function handleSaveGenerated() {
    const iso = fromLocalInputValue(generatedIso).toISOString();
    const { error } = await supabase.from("reports").update({ generated_at: iso } as never).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Data de geração atualizada");
    refetch();
  }

  if (isLoading) return <div className="p-8 text-muted-foreground">Carregando…</div>;
  if (error || !data) return <div className="p-8">Relatório não encontrado. <Button variant="link" onClick={() => refetch()}>Tentar novamente</Button></div>;

  const totals = applyFinalValue(computeTotals(data.campaigns ?? []), data.final_value);
  const generatedAt = formatBRDateTime(fromLocalInputValue(generatedIso));

  return (
    <div className="print-root">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/admin/relatorios" })}>
          <ArrowLeft className="size-4" /> Voltar
        </Button>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1"><Clock className="size-3" /> Data de geração</Label>
            <div className="flex gap-1">
              <Input
                type="datetime-local"
                value={generatedIso}
                onChange={(e) => setGeneratedIso(e.target.value)}
                className="h-9 w-[210px]"
              />
              <Button variant="outline" size="sm" onClick={() => setGeneratedIso(toLocalInputValue(new Date()))}>
                Agora
              </Button>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleDelete}>
            <Trash2 className="size-4" /> Excluir
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="size-4" /> Imprimir / PDF
          </Button>
        </div>
      </div>

      <ReportDocument report={data} totals={totals} generatedAt={generatedAt} />
    </div>
  );
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInputValue(v: string): Date {
  if (!v) return new Date();
  const d = new Date(v);
  return isNaN(d.getTime()) ? new Date() : d;
}

function ReportDocument({
  report,
  totals,
  generatedAt,
}: {
  report: ReportRow;
  totals: ReturnType<typeof applyFinalValue>;
  generatedAt: string;
}) {
  return (
    <div className="print-page bg-white text-foreground rounded-lg shadow-sm border overflow-hidden">
      <div className="px-6 pt-6 pb-3 flex items-end justify-between border-b-4 border-report-blue">
        <div>
          <div className="text-xl font-extrabold tracking-tight text-report-blue">Painel SaaS</div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mt-2">
            Relatório de fechamento
          </p>
        </div>
        <div className="text-xs text-muted-foreground">Gerado em {generatedAt}</div>
      </div>

      <div className="px-6 py-3 bg-report-band-bg border-b">
        <h2 className="text-sm font-bold tracking-wide text-report-blue flex items-center gap-2">
          📋 RELATÓRIO DE DISPAROS
        </h2>
      </div>

      <div className="bg-report-header-bg text-report-header-foreground">
        <div className="px-6 py-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs uppercase tracking-wider opacity-90">
          <MetaLabel icon={<User className="size-3.5" />}>Cliente</MetaLabel>
          <MetaLabel icon={<Calendar className="size-3.5" />}>Data</MetaLabel>
          <MetaLabel icon={<Tag className="size-3.5" />}>Referência</MetaLabel>
          <MetaLabel icon={<Folder className="size-3.5" />}>
            Projeto <span className="opacity-60 normal-case">(opcional)</span>
          </MetaLabel>
        </div>
        <div className="px-6 py-2 text-xs uppercase tracking-wider opacity-90 flex items-center gap-1.5">
          <Wallet className="size-3.5 text-report-success" /> Valor vendido (R$)
        </div>
        <div className="px-6 pb-5 grid grid-cols-1 md:grid-cols-2 gap-3">
          <ValueBox label="Cliente" value={report.client_name} />
          <ValueBox label="Data" value={formatBRDate(report.report_date)} />
          {(report.reference || report.project) && (
            <>
              <ValueBox label="Referência" value={report.reference || "—"} />
              <ValueBox label="Projeto" value={report.project || "—"} />
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-border">
        <Kpi icon={<MailCheck className="size-4" />} label="Entregues" value={fmtPct(totals.rate)} sub="taxa" />
        <Kpi icon={<Send className="size-4" />} label="Enviadas" value={fmtNum(totals.sent)} sub="total" />
        <Kpi icon={<Hourglass className="size-4" />} label="Pendentes" value={fmtNum(totals.pending)} sub="aguardando" />
        <Kpi icon={<XCircle className="size-4" />} label="Falhou" value={fmtNum(totals.failed)} sub="não entregues" tone="danger" />
        <Kpi icon={<Layers className="size-4" />} label="Lotes" value={fmtNum(totals.batches)} sub="entradas" />
      </div>

      <div>
        <div className="grid grid-cols-12 bg-report-blue text-report-blue-foreground text-[11px] font-bold uppercase tracking-wider px-4 py-2.5">
          <div className="col-span-1">#</div>
          <div className="col-span-3">Descrição / Campanha</div>
          <div className="col-span-1 text-center">Enviadas</div>
          <div className="col-span-1 text-center">Pendentes</div>
          <div className="col-span-1 text-center">Falhou</div>
          <div className="col-span-1 text-center">R$/msg</div>
          <div className="col-span-2 text-center">Entregues</div>
          <div className="col-span-2 text-right">Total</div>
        </div>
        {report.campaigns.map((c, i) => {
          const effective = totals.finalValue != null
            ? { ...c, pricePerMsg: totals.effectivePricePerMsg }
            : c;
          const r = computeCampaign(effective);
          return (
            <div key={i} className="grid grid-cols-12 items-center px-4 py-3 border-b text-sm">
              <div className="col-span-1">
                <span className="inline-flex items-center justify-center size-6 rounded bg-foreground text-background text-xs font-bold">
                  {i + 1}
                </span>
              </div>
              <div className="col-span-3 font-medium">{c.description || "—"}</div>
              <div className="col-span-1 text-center">{fmtNum(r.sent)}</div>
              <div className="col-span-1 text-center">0</div>
              <div className="col-span-1 text-center">
                <span className="inline-block px-2 py-0.5 rounded bg-red-50 text-report-danger font-medium">{fmtNum(r.failed)}</span>
              </div>
              <div className="col-span-1 text-center tabular-nums">{(effective.pricePerMsg || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
              <div className="col-span-2 text-center">
                <div className="font-semibold">{fmtNum(r.delivered)}</div>
                <div className="text-[10px] text-muted-foreground">{fmtPct(r.rate)}</div>
              </div>
              <div className="col-span-2 text-right text-xs space-y-0.5">
                <div className="line-through text-muted-foreground">{fmtBRL(r.gross)}</div>
                <div className="text-report-danger">- {fmtBRL(r.discount)}</div>
                <div className="text-report-blue font-bold text-base">{fmtBRL(r.net)}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-report-blue text-report-blue-foreground px-6 py-5 grid grid-cols-2 md:grid-cols-6 gap-4 text-sm">
        <SummaryCell label="Enviadas" value={fmtNum(totals.sent)} />
        <SummaryCell label="Pendentes" value={fmtNum(totals.pending)} />
        <SummaryCell label="Falhou" value={fmtNum(totals.failed)} />
        <SummaryCell label="Entregues" value={fmtNum(totals.delivered)} />
        <div className="col-span-2 md:col-span-2 text-right space-y-0.5">
          <div className="text-[10px] uppercase opacity-80">Bruto</div>
          <div className="line-through opacity-80 text-sm">{fmtBRL(totals.gross)}</div>
          <div className="text-[10px] uppercase opacity-80 text-report-danger">Desconto</div>
          <div className="font-semibold">- {fmtBRL(totals.discount)}</div>
          <div className="text-[10px] uppercase opacity-80">Líquido</div>
          <div className="text-xl font-extrabold">{fmtBRL(totals.net)}</div>
        </div>
      </div>

      <div className="bg-report-band-bg px-6 py-4 grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
        <div className="md:col-span-1">
          <div className="text-xs uppercase tracking-wider font-semibold text-report-blue flex items-center gap-1.5">
            <BarChart3 className="size-3.5" /> Total de cobranças
          </div>
          <div className="text-muted-foreground text-xs mt-1">
            {fmtNum(totals.delivered)} mensagens entregues de {fmtNum(totals.sent)} enviadas
          </div>
        </div>
        <FooterCell label="Bruto" value={<span className="line-through">{fmtBRL(totals.gross)}</span>} />
        <FooterCell label="Desconto (falhas)" value={<>- {fmtBRL(totals.discount)}</>} tone="danger" />
        <FooterCell label="Líquido" value={fmtBRL(totals.net)} tone="primary" big />
      </div>
    </div>
  );
}

function MetaLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <div className="flex items-center gap-1.5 font-semibold">{icon} {children}</div>;
}

function ValueBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-black/15 rounded px-3 py-2 border border-white/10">
      <div className="text-[10px] uppercase tracking-wider text-report-blue-foreground/70">{label}</div>
      <div className="font-semibold text-sm">{value}</div>
    </div>
  );
}

function Kpi({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub: string; tone?: "danger" }) {
  return (
    <div className="bg-card px-3 py-4 text-center">
      <div className="flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
        {icon} {label}
      </div>
      <div className={`mt-1 text-2xl font-extrabold ${tone === "danger" ? "text-report-danger" : "text-foreground"}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-[10px] uppercase opacity-80">{label}</div>
      <div className="font-bold text-lg">{value}</div>
    </div>
  );
}

function FooterCell({ label, value, tone, big }: { label: string; value: React.ReactNode; tone?: "danger" | "primary"; big?: boolean }) {
  const color = tone === "primary" ? "text-report-blue" : tone === "danger" ? "text-report-danger" : "";
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`${big ? "text-xl font-extrabold" : "font-semibold"} ${color}`}>{value}</div>
    </div>
  );
}
