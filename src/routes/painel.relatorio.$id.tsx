import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { ArrowLeft, Download, FileText, Printer } from "lucide-react";
import { getMyCampaignReport } from "@/lib/client-report.functions";

export const Route = createFileRoute("/painel/relatorio/$id")({
  head: () => ({
    meta: [
      { title: "Relatório da campanha — next DISPAROS" },
      { name: "description", content: "Resumo, entrega, engajamento e linha do tempo do disparo." },
      { property: "og:title", content: "Relatório da campanha" },
      { property: "og:description", content: "Resumo, entrega, engajamento e linha do tempo do disparo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const nf = (n: number) => Number(n || 0).toLocaleString("pt-BR");
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "—");
const brl = (c: number) => (Number(c || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dt = (v?: string | null) =>
  v
    ? new Date(v).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "—";

function Page() {
  const { id } = Route.useParams();
  const fn = useServerFn(getMyCampaignReport);
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-campaign-report", id],
    queryFn: () => fn({ data: { id } }),
    refetchInterval: 60_000,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando relatório…</p>;
  if (error || !data) {
    return (
      <div className="rounded-2xl border border-dashed p-10 text-center">
        <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">Relatório indisponível</p>
        <p className="text-xs text-muted-foreground">Esta campanha não existe ou não pertence à sua conta.</p>
      </div>
    );
  }

  if ((data as any).stage && (data as any).stage !== "completed") {
    return (
      <div className="rounded-2xl border border-dashed p-10 text-center">
        <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">Relatório disponível após o envio completo</p>
        <p className="text-xs text-muted-foreground">
          O relatório consolidado é liberado quando 100% do envio for concluído.
        </p>
      </div>
    );
  }

  const c = data.campaign;
  const total = c.total_recipients ?? 0;
  const sent = c.sent_count ?? 0;
  const delivered = c.delivered_count ?? 0;
  const read = c.read_count ?? 0;
  const replied = c.replied_count ?? 0;
  const failed = c.failed_count ?? 0;
  const completion = total ? ((sent + failed) / total) * 100 : 0;
  const maxDdd = Math.max(1, ...(data.ddd ?? []).map((d) => d.v));

  const groups: {
    title: string;
    cols: number;
    items: { label: string; value: string; hint?: string; tone?: "default" | "success" | "danger" }[];
  }[] = [
    { title: "Leads no disparo", cols: 1, items: [{ label: "Total de leads", value: nf(total) }] },
    {
      title: "Envio",
      cols: 2,
      items: [
        { label: "Mensagens enviadas", value: nf(sent), hint: `${pct(sent, total)} da base` },
        { label: "Pendentes", value: nf(Math.max(0, total - sent - failed)) },
      ],
    },
    {
      title: "Resultado do processamento",
      cols: 2,
      items: [
        { label: "Mensagens entregues", value: nf(delivered), hint: pct(delivered, sent), tone: "success" },
        { label: "Falhou", value: nf(failed), hint: pct(failed, total), tone: "danger" },
      ],
    },
    {
      title: "Engajamento",
      cols: 3,
      items: [
        { label: "Lidas", value: nf(read), hint: `${pct(read, delivered)} das entregues` },
        { label: "Responderam", value: nf(replied), hint: `${pct(replied, sent)} dos enviados` },
        { label: "Taxa de conclusão", value: `${completion.toFixed(2).replace(".", ",")}%` },
      ],
    },
  ];

  const exportCsv = () => {
    const head = ["metrica", "valor"];
    const rows: Array<[string, string | number]> = [
      ["campanha", c.name],
      ["status", c.status],
      ["criada_em", dt(c.created_at)],
      ["iniciada_em", dt(c.started_at)],
      ["finalizada_em", dt(c.finished_at)],
      ["lista", data.list_name ?? ""],
      ["total_leads", total],
      ["enviadas", sent],
      ["entregues", delivered],
      ["lidas", read],
      ["respostas", replied],
      ["falhas", failed],
      ["taxa_conclusao", `${completion.toFixed(2)}%`],
      ["custo", brl(c.charged_cents ?? 0)],
    ];
    const csv = "\uFEFF" + [head.join(";"), ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `relatorio-${c.name.replace(/\W+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-primary p-6 text-primary-foreground sm:p-10 print:hidden">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary-foreground/10 blur-2xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Link to="/painel/relatorios" className="inline-flex items-center gap-1 text-xs text-primary-foreground/70 hover:text-primary-foreground">
              <ArrowLeft className="h-3.5 w-3.5" /> Voltar aos relatórios
            </Link>
            <h1 className="mt-3 text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{c.name}</h1>
            <p className="mt-2 text-sm text-primary-foreground/70">
              {nf(total)} leads processados{data.list_name ? ` · Lista: ${data.list_name}` : ""} · Criada em {dt(c.created_at)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="border-0 bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/25"
              onClick={exportCsv}
            >
              <Download className="mr-2 h-4 w-4" /> CSV
            </Button>
            <Button size="sm" className="bg-primary-foreground text-primary hover:bg-primary-foreground/90" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" /> Imprimir / PDF
            </Button>
          </div>
        </div>

        <div className="relative mt-8 grid gap-px overflow-hidden rounded-2xl bg-primary-foreground/15 sm:grid-cols-3">
          {[
            { label: "Mensagens enviadas", value: nf(sent) },
            { label: "Mensagens entregues", value: nf(delivered) },
            { label: "Taxa de conclusão", value: `${completion.toFixed(2).replace(".", ",")}%` },
          ].map((h) => (
            <div key={h.label} className="bg-primary px-5 py-4">
              <div className="text-[11px] uppercase tracking-[0.14em] text-primary-foreground/65">{h.label}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums sm:text-3xl">{h.value}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="mb-6 hidden text-center print:block">
        <h1 className="text-2xl font-bold">{c.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Relatório de disparo</p>
      </div>

      <div className="grid gap-4">
        {groups.map((g) => (
          <Card key={g.title} className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <span className="h-3 w-1 rounded-full bg-primary" />
                {g.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`grid gap-4 ${g.cols === 1 ? "max-w-xs grid-cols-1" : g.cols === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
                {g.items.map((k) => (
                  <div key={k.label} className="rounded-2xl border border-border/60 bg-secondary/40 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{k.label}</div>
                    <div
                      className={`mt-1.5 text-3xl font-semibold tabular-nums tracking-tight ${
                        k.tone === "success" ? "text-primary" : k.tone === "danger" ? "text-destructive" : "text-foreground"
                      }`}
                    >
                      {k.value}
                    </div>
                    {k.hint && <div className="mt-1 text-xs text-muted-foreground">{k.hint}</div>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Envios por hora" data={data.timeline} color="var(--color-primary)" gid="repSent" />
        <ChartCard title="Respostas por hora" data={data.reply_timeline} color="var(--color-chart-2)" gid="repReply" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {!!data.ddd?.length && (
          <Card className="border-border/60">
            <CardHeader className="pb-2"><CardTitle className="text-base">Top DDDs da base</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {data.ddd.map((d) => (
                  <div key={String(d.ddd)} className="flex items-center gap-3">
                    <span className="w-14 shrink-0 text-xs font-medium text-muted-foreground">DDD {d.ddd ?? "—"}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-primary/80" style={{ width: `${Math.max(4, (d.v / maxDdd) * 100)}%` }} />
                    </div>
                    <span className="w-16 shrink-0 text-right text-xs font-semibold tabular-nums">{nf(d.v)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-border/60">
          <CardHeader className="pb-2"><CardTitle className="text-base">Principais motivos de falha</CardTitle></CardHeader>
          <CardContent>
            {!data.errors?.length ? (
              <p className="text-sm text-muted-foreground">Nenhuma falha registrada.</p>
            ) : (
              <div className="grid gap-2">
                {data.errors.map((e) => (
                  <div key={e.code} className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/40 px-3 py-2 text-sm">
                    <span className="truncate">{e.code}</span>
                    <span className="font-semibold tabular-nums">{nf(e.v)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ChartCard({ title, data, color, gid }: { title: string; data: Array<{ t: string; v: number }>; color: string; gid: string }) {
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="h-64">
        {!data?.length ? (
          <p className="text-sm text-muted-foreground">Sem dados ainda.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.45} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
              <XAxis dataKey="t" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis fontSize={11} tickLine={false} axisLine={false} width={44} />
              <Tooltip
                cursor={{ fill: "var(--color-accent)", opacity: 0.5 }}
                contentStyle={{ borderRadius: 12, border: "1px solid var(--color-border)", fontSize: 12 }}
                formatter={(v: any) => nf(Number(v))}
              />
              <Bar dataKey="v" fill={`url(#${gid})`} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
