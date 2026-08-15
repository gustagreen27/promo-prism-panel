import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { FileText, Download } from "lucide-react";
import { getPublicReport, getPublicReportStats, listPublicReportRecords } from "@/lib/public-reports.functions";

export const Route = createFileRoute("/relatorios/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: "Relatório de disparo — next DISPAROS" },
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

  const { data, isLoading } = useQuery({
    queryKey: ["public-report-records", slug, term, status, page],
    queryFn: () => recordsFn({ data: { slug, search: term, status, page, perPage } }),
    placeholderData: keepPreviousData,
    enabled: !!report && showLogs,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / perPage));

  const exportCsv = () => {
    const head = ["nome", "telefone", "email", "status", "iniciado_em", "enviado_em", "respondeu_em"];
    const body = rows.map((r: any) =>
      [r.name, r.phone, r.email, statusLabel(r.status), dts(r.started_at), dts(r.last_sent_at), dts(r.last_received_at)]
        .map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob(["\uFEFF" + [head.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${slug}-logs.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
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

  const groups = [
    {
      title: "Leads no disparo",
      cols: 1,
      items: [
        { label: "Total de leads", value: nf(totalRecords) },
      ],
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
        { label: "Mensagens Entregues", value: nf(report.completed ?? 0), hint: pct(report.completed ?? 0, totalRecords) },
        { label: "Falhou", value: nf(report.errors ?? 0), hint: pct(report.errors ?? 0, totalRecords) },
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
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Relatório de disparo</p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{report.name}</h1>
      </header>

      <div className="grid gap-4">
        {groups.map((g) => (
          <Card key={g.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">{g.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`grid gap-4 ${g.cols === 1 ? "grid-cols-1 max-w-xs" : g.cols === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
                {g.items.map((k) => (
                  <div key={k.label}>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</div>
                    <div className="mt-1 text-2xl font-bold tabular-nums">{k.value}</div>
                    {k.hint && <div className="mt-1 text-xs text-muted-foreground">{k.hint}</div>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Envios por minuto</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats?.timeline ?? []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="t" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip formatter={(v: any) => nf(Number(v))} />
                <Bar dataKey="v" className="fill-primary" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Respostas por hora</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats?.replyTimeline ?? []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="t" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip formatter={(v: any) => nf(Number(v))} />
                <Bar dataKey="v" className="fill-primary" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {!!stats?.ddd?.length && (
        <Card className="mt-4">
          <CardHeader><CardTitle className="text-base">Top DDDs da base</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {stats.ddd.map((d) => (
                <Badge key={d.ddd} variant="outline" className="tabular-nums">
                  DDD {d.ddd} · {nf(d.v)}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Logs detalhados</CardTitle>
          {!showLogs ? (
            <Button onClick={() => setShowLogs(true)}>
              <FileText className="mr-2 h-4 w-4" /> Clique aqui e veja os logs
            </Button>
          ) : (
            <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
              <Download className="mr-2 h-4 w-4" /> Exportar CSV
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {!showLogs ? (
            <p className="text-sm text-muted-foreground">
              {nf(totalRecords)} registros disponíveis — lead a lead, com horário de envio, resposta e status.
            </p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap gap-2">
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

              <div className="mt-3 flex items-center justify-between">
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
