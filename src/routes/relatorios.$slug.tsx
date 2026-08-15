import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { FileText, Download, FileSpreadsheet, Printer, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getPublicReport, getPublicReportStats, listPublicReportRecords } from "@/lib/public-reports.functions";

export const Route = createFileRoute("/relatorios/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: "Relatório de disparo" },
      { name: "description", content: `Relatório público de disparo (${params.slug}) com resumo, taxa de conclusão e logs.` },
      { property: "og:title", content: "Relatório de disparo" },
      { property: "og:description", content: "Resumo, taxa de conclusão e logs do disparo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PublicReportPage,
});

const nf = (n: number) => Number(n || 0).toLocaleString("pt-BR");
const pctFmt = (n: number) => `${Number(n || 0).toFixed(2).replace(".", ",")}%`;
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "—");
const dt = (v?: string | null) =>
  v
    ? new Date(v).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      })
    : "Não informado";
const dts = (v?: string | null) =>
  v
    ? new Date(v).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
      })
    : "—";
const statusLabel = (s?: string | null) => (s === "completed" ? "Concluído" : s === "error" ? "Com erro" : (s ?? "—"));

function PublicReportPage() {
  const { slug } = Route.useParams();
  const reportFn = useServerFn(getPublicReport);
  const recordsFn = useServerFn(listPublicReportRecords);
  const statsFn = useServerFn(getPublicReportStats);

  const [showLogs, setShowLogs] = useState(false);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState<"all" | "completed" | "error">("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<any | null>(null);
  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);
  const perPage = 50;

  const { data: report, isLoading: loadingReport } = useQuery({
    queryKey: ["public-report", slug],
    queryFn: () => reportFn({ data: { slug } }),
  });

  const { data: stats } = useQuery({
    queryKey: ["public-report-stats", slug],
    queryFn: () => statsFn({ data: { slug } }),
    enabled: !!report,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (report?.name) {
      document.title = `${report.name} — Relatório de disparo`;
    }
  }, [report?.name]);

  const { data, isLoading } = useQuery({
    queryKey: ["public-report-records", slug, term, status, page],
    queryFn: () => recordsFn({ data: { slug, search: term, status, page, perPage } }),
    placeholderData: keepPreviousData,
    enabled: !!report && showLogs,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / perPage));

  const HEAD = [
    "nome", "telefone", "email", "status", "criado_em", "entrou_na_fila", "iniciado_em",
    "enviado_em", "respondeu_em", "status_mensagem", "codigo_erro", "mensagem_erro",
  ];

  const toRow = (r: any) => [
    r.name ?? "", r.phone ?? "", r.email ?? "", statusLabel(r.status),
    dt(r.created_at_source), dt(r.entered_at), dt(r.started_at),
    dt(r.last_sent_at), dt(r.last_received_at),
    r.message_status ?? "", r.error_code ?? "", r.error_message ?? "",
  ];

  const download = (blob: Blob, filename: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const fetchAll = async () => {
    const chunk = 200;
    const out: any[] = [];
    for (let p = 0; ; p++) {
      const res: any = await recordsFn({ data: { slug, search: term, status, page: p, perPage: chunk } });
      const batch = res?.rows ?? [];
      out.push(...batch);
      if (batch.length < chunk || out.length >= (res?.total ?? 0) || p > 500) break;
    }
    return out;
  };

  const runExport = async (kind: "csv" | "xlsx") => {
    setExporting(kind);
    try {
      const all = await fetchAll();
      if (!all.length) {
        toast.error("Nenhum registro para exportar");
        return;
      }
      if (kind === "csv") {
        const body = all.map((r) => toRow(r).map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"));
        download(
          new Blob(["\uFEFF" + [HEAD.join(";"), ...body].join("\n")], { type: "text/csv;charset=utf-8" }),
          `${slug}-logs.csv`,
        );
      } else {
        const XLSX = await import("xlsx");
        const ws = XLSX.utils.aoa_to_sheet([HEAD, ...all.map(toRow)]);
        ws["!cols"] = HEAD.map(() => ({ wch: 20 }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Logs");
        const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        download(
          new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
          `${slug}-logs.xlsx`,
        );
      }
      toast.success(`${nf(all.length)} registros exportados`);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao exportar");
    } finally {
      setExporting(null);
    }
  };

  if (loadingReport) {
    return <div className="p-10 text-center text-sm text-muted-foreground">Carregando relatório…</div>;
  }

  if (!report) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-3 px-6 text-center">
        <FileText className="size-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Relatório indisponível</h1>
        <p className="text-sm text-muted-foreground">
          Este relatório não existe ou o acesso público foi desativado pelo administrador.
        </p>
      </main>
    );
  }

  const totalRecords = report.total ?? 0;
  const sent = stats?.sent ?? 0;
  const replied = stats?.replied ?? 0;
  const maxDdd = Math.max(1, ...(stats?.ddd ?? []).map((d) => d.v));

  const groups: {
    title: string;
    cols: number;
    items: { label: string; value: string; hint?: string; tone?: "default" | "success" | "danger" }[];
  }[] = [
    {
      title: "Leads no disparo",
      cols: 1,
      items: [{ label: "Total de leads", value: nf(totalRecords) }],
    },
    {
      title: "Envio",
      cols: 2,
      items: [
        { label: "Mensagens enviadas", value: nf(sent), hint: pct(sent, totalRecords) + " da base" },
        { label: "Números inválidos", value: nf(stats?.noSend ?? 0) },
      ],
    },
    {
      title: "Resultado do processamento",
      cols: 2,
      items: [
        { label: "Mensagens Entregues", value: nf(report.completed ?? 0), hint: pct(report.completed ?? 0, totalRecords), tone: "success" },
        { label: "Falhou", value: nf(report.errors ?? 0), hint: pct(report.errors ?? 0, totalRecords), tone: "danger" },
      ],
    },
    {
      title: "Engajamento",
      cols: 3,
      items: [
        { label: "Responderam", value: nf(replied), hint: pct(replied, sent) + " dos enviados" },
        { label: "Resposta mediana", value: stats ? `${Math.round((stats.medianReplySec || 0) / 60)} min` : "—" },
        { label: "Taxa de conclusão", value: pctFmt(report.completion_rate ?? 0) },
      ],
    },
  ];

  return (
    <main className="min-h-screen bg-gradient-to-b from-accent/40 via-background to-background print:bg-background">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-12">
        <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-primary text-primary-foreground shadow-[var(--shadow-lg)] print:hidden">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary-foreground/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-28 left-1/3 h-72 w-72 rounded-full bg-primary-foreground/10 blur-3xl" />
          <div className="relative flex flex-col gap-8 p-6 sm:p-10">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <span className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/25 bg-primary-foreground/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em]">
                  <FileText className="h-3.5 w-3.5" /> Relatório de disparo
                </span>
                <h1 className="mt-4 text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                  {report.name}
                </h1>
                <p className="mt-2 text-sm text-primary-foreground/70">
                  Gerado a partir de {nf(totalRecords)} leads processados
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="border-0 bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/25"
                  onClick={() => runExport("csv")}
                  disabled={!!exporting}
                >
                  {exporting === "csv" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  CSV
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="border-0 bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/25"
                  onClick={() => runExport("xlsx")}
                  disabled={!!exporting}
                >
                  {exporting === "xlsx" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
                  XLSX
                </Button>
                <Button
                  size="sm"
                  className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
                  onClick={() => window.print()}
                >
                  <Printer className="mr-2 h-4 w-4" /> Imprimir / PDF
                </Button>
              </div>
            </div>

            <div className="grid gap-px overflow-hidden rounded-2xl bg-primary-foreground/15 sm:grid-cols-3">
              {[
                { label: "Mensagens enviadas", value: nf(sent) },
                { label: "Mensagens entregues", value: nf(report.completed ?? 0) },
                { label: "Taxa de conclusão", value: pctFmt(report.completion_rate ?? 0) },
              ].map((h) => (
                <div key={h.label} className="bg-primary px-5 py-4">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-primary-foreground/65">{h.label}</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums sm:text-3xl">{h.value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="mb-8 hidden text-center print:block">
          <h1 className="text-2xl font-bold">{report.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Relatório de disparo</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Impresso em {new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>

        <div className="mt-8 grid gap-4">
          {groups.map((g) => (
            <Card key={g.title} className="border-border/60 shadow-[var(--shadow-sm)]">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  <span className="h-3 w-1 rounded-full bg-primary" />
                  {g.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className={`grid gap-4 ${g.cols === 1 ? "grid-cols-1 max-w-xs" : g.cols === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}
                >
                  {g.items.map((k) => (
                    <div
                      key={k.label}
                      className="rounded-2xl border border-border/60 bg-secondary/40 p-4 transition-colors hover:border-primary/30 hover:bg-accent/40"
                    >
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

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card className="border-border/60 shadow-[var(--shadow-sm)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Envios por minuto</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats?.timeline ?? []}>
                  <defs>
                    <linearGradient id="barSent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.45} />
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
                  <Bar dataKey="v" fill="url(#barSent)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-[var(--shadow-sm)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Respostas por hora</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats?.replyTimeline ?? []}>
                  <defs>
                    <linearGradient id="barReply" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-chart-2)" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="var(--color-chart-2)" stopOpacity={0.45} />
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
                  <Bar dataKey="v" fill="url(#barReply)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {!!stats?.ddd?.length && (
          <Card className="mt-4 border-border/60 shadow-[var(--shadow-sm)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Top DDDs da base</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                {stats.ddd.map((d) => (
                  <div key={d.ddd} className="flex items-center gap-3">
                    <span className="w-14 shrink-0 text-xs font-medium text-muted-foreground">DDD {d.ddd}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary/80"
                        style={{ width: `${Math.max(4, (d.v / maxDdd) * 100)}%` }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right text-xs font-semibold tabular-nums">{nf(d.v)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}


      <Card className="mt-4 print:hidden">

        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Logs detalhados</CardTitle>
          {!showLogs ? (
            <Button className="print:hidden" onClick={() => setShowLogs(true)}>
              <FileText className="mr-2 h-4 w-4" /> Clique aqui e veja os logs
            </Button>
          ) : (
            <div className="flex flex-wrap gap-2 print:hidden">
              <Button variant="outline" onClick={() => runExport("csv")} disabled={!!exporting || !total}>
                {exporting === "csv" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Exportar CSV
              </Button>
              <Button variant="outline" onClick={() => runExport("xlsx")} disabled={!!exporting || !total}>
                {exporting === "xlsx" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
                Exportar XLSX
              </Button>
              <Button variant="secondary" onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" /> Imprimir / PDF
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {!showLogs ? (
            <p className="text-sm text-muted-foreground">
              {nf(totalRecords)} registros disponíveis — lead a lead, com horário de envio, resposta e status.
            </p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap gap-2 print:hidden">
                <Input
                  className="max-w-xs"
                  placeholder="Buscar por nome, telefone ou e-mail…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { setTerm(search); setPage(0); } }}
                />
                <Button variant="secondary" onClick={() => { setTerm(search); setPage(0); }}>Pesquisar</Button>
                <Select value={status} onValueChange={(v) => { setStatus(v as any); setPage(0); }}>
                  <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="completed">Mensagens Entregues</SelectItem>
                    <SelectItem value="error">Falhou</SelectItem>
                  </SelectContent>
                </Select>
                <div className="ml-auto self-center text-xs text-muted-foreground">{nf(total)} registros</div>
              </div>

              <div className="overflow-x-auto rounded-lg border">
                {isLoading ? (
                  <div className="p-6 text-sm text-muted-foreground">Carregando logs…</div>
                ) : !rows.length ? (
                  <div className="p-10 text-center text-sm text-muted-foreground">Nenhum registro encontrado</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lead</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Enviado</TableHead>
                        <TableHead>Respondeu</TableHead>
                        <TableHead className="text-right">Logs</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r: any) => (
                        <TableRow key={r.id}>
                          <TableCell className="max-w-[220px] truncate font-medium">{r.name || "—"}</TableCell>
                          <TableCell className="text-xs tabular-nums">{r.phone || "—"}</TableCell>
                          <TableCell>
                            <Badge variant={r.status === "completed" ? "outline" : "destructive"}>
                              {statusLabel(r.status)}
                            </Badge>
                            {r.last_received_at && <Badge variant="secondary" className="ml-1">respondeu</Badge>}
                          </TableCell>
                          <TableCell className="text-xs">{dts(r.last_sent_at)}</TableCell>
                          <TableCell className="text-xs">{dts(r.last_received_at)}</TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="ghost" onClick={() => setSelected(r)}>Ver logs</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between print:hidden">
                <span className="text-xs text-muted-foreground">Página {page + 1} de {nf(pages)}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
                  <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader><SheetTitle>Logs do registro</SheetTitle></SheetHeader>
          {selected && (
            <div className="space-y-6 p-4 pt-2 text-sm">
              <Section title="Lead">
                <Info label="Nome" value={selected.name ?? "Não informado"} />
                <Info label="Telefone" value={selected.phone ?? "Não informado"} />
                <Info label="E-mail" value={selected.email ?? "Não informado"} />
              </Section>
              <Section title="Execução">
                <Info label="Criado em" value={dt(selected.created_at_source)} />
                <Info label="Entrou na fila" value={dt(selected.entered_at)} />
                <Info label="Iniciado" value={dt(selected.started_at)} />
                <Info label="Alteração de status" value={dt(selected.status_changed_at)} />
              </Section>
              <Section title="WhatsApp">
                <Info label="ID da última mensagem enviada" value={selected.last_sent_message_id ?? "Não informado"} />
                <Info label="Horário da mensagem enviada" value={dt(selected.last_sent_at)} />
                <Info label="ID da última mensagem recebida" value={selected.last_received_message_id ?? "Não informado"} />
                <Info label="Horário da mensagem recebida" value={dt(selected.last_received_at)} />
              </Section>
              <Section title="Resultado">
                <Info label="Status" value={statusLabel(selected.status)} />
                <Info label="Código de erro" value={selected.error_code ?? "Não informado"} />
                <Info label="Mensagem de erro" value={selected.error_message ?? "Não informado"} />
                <Info label="Status da mensagem" value={selected.message_status ?? "Não informado"} />
                {selected.status === "error" && !selected.error_code && !selected.error_message && (
                  <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                    O registro foi marcado como erro pela origem, mas não foi fornecido um código ou motivo técnico.
                  </p>
                )}
              </Section>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="break-all font-medium">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="space-y-2 rounded-lg border p-3">{children}</div>
    </div>
  );
}
