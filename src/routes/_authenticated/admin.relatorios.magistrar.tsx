import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/admin/page-header";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { FileText, Download } from "lucide-react";
import summary from "@/data/magistrar-1408-summary.json";
import logsAsset from "@/assets/magistrar-1408-logs.json.asset.json";

export const Route = createFileRoute("/_authenticated/admin/relatorios/magistrar")({
  head: () => ({
    meta: [
      { title: "Relatório Magistrar 14/08 — Next Disparos" },
      { name: "description", content: "Relatório completo do disparo Magistrar 14/08: envios, respostas, falhas e logs detalhados por lead." },
      { property: "og:title", content: "Relatório Magistrar 14/08" },
      { property: "og:description", content: "Envios, respostas, falhas e logs detalhados do disparo Magistrar 14/08." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type LogRow = {
  n: string; p: string; s: string;
  st: string | null; fi: string | null; i: string | null;
  r: string | null; e: string | null;
};

const nf = (n: number) => n.toLocaleString("pt-BR");
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "—");
const dt = (v?: string | null) =>
  v ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
const phone = (p: string) =>
  p?.length >= 12 ? `+${p.slice(0, 2)} ${p.slice(2, 4)} ${p.slice(4, -4)}-${p.slice(-4)}` : p;

function Page() {
  const [showLogs, setShowLogs] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "completed" | "error" | "replied" | "nosend">("all");
  const [page, setPage] = useState(0);
  const perPage = 50;

  const { data: logs = [], isLoading } = useQuery<LogRow[]>({
    queryKey: ["magistrar-logs"],
    enabled: showLogs,
    staleTime: Infinity,
    queryFn: async () => {
      const res = await fetch(logsAsset.url);
      if (!res.ok) throw new Error("Falha ao carregar logs");
      return res.json();
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return logs.filter((l) => {
      if (filter === "completed" && l.s !== "completed") return false;
      if (filter === "error" && l.s !== "error") return false;
      if (filter === "replied" && !l.r) return false;
      if (filter === "nosend" && l.e) return false;
      if (term && !(l.n.toLowerCase().includes(term) || l.p.includes(term))) return false;
      return true;
    });
  }, [logs, q, filter]);

  const pageRows = filtered.slice(page * perPage, page * perPage + perPage);
  const pages = Math.max(1, Math.ceil(filtered.length / perPage));

  const exportCsv = () => {
    const head = ["nome", "telefone", "status", "iniciado_em", "enviado_em", "respondeu_em", "finalizado_em"];
    const body = filtered.map((l) => [l.n, l.p, l.s, dt(l.st), dt(l.e), dt(l.r), dt(l.fi)]
      .map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","));
    const blob = new Blob(["\uFEFF" + [head.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "magistrar-1408-logs.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const kpis = [
    { label: "Leads no disparo", value: nf(summary.total) },
    { label: "Mensagens enviadas", value: nf(summary.sent), hint: pct(summary.sent, summary.total) + " da base" },
    { label: "Concluídos", value: nf(summary.completed), hint: pct(summary.completed, summary.total) },
    { label: "Com erro no fluxo", value: nf(summary.error), hint: pct(summary.error, summary.total) },
    { label: "Sem envio", value: nf(summary.noSend) },
    { label: "Responderam", value: nf(summary.replied), hint: pct(summary.replied, summary.sent) + " dos enviados" },
    { label: "Resposta mediana", value: `${Math.round(summary.medianReplySec / 60)} min` },
    { label: "Janela do disparo", value: "08:00 → 15:05", hint: "horário de Brasília" },
  ];

  return (
    <>
      <PageHeader
        title="Relatório — Magistrar 14/08 (TODOS)"
        description="Análise operacional do disparo, sem valores financeiros."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">{k.value}</div>
              {k.hint && <div className="mt-1 text-xs text-muted-foreground">{k.hint}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Envios por minuto</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.timeline}>
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
              <BarChart data={summary.replyTimeline}>
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

      <Card className="mt-4">
        <CardHeader><CardTitle className="text-base">Top DDDs da base</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {summary.ddd.map((d: any) => (
              <Badge key={d.ddd} variant="outline" className="tabular-nums">
                DDD {d.ddd} · {nf(d.v)}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Logs detalhados</CardTitle>
          {!showLogs ? (
            <Button onClick={() => setShowLogs(true)}>
              <FileText className="mr-2 h-4 w-4" /> Clique aqui e veja os logs
            </Button>
          ) : (
            <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>
              <Download className="mr-2 h-4 w-4" /> Exportar CSV
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {!showLogs ? (
            <p className="text-sm text-muted-foreground">
              {nf(summary.total)} registros disponíveis — lead a lead, com horário de envio, resposta e status.
            </p>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando logs…</p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap gap-2">
                <Input
                  placeholder="Buscar por nome ou telefone…"
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setPage(0); }}
                  className="max-w-xs"
                />
                <Select value={filter} onValueChange={(v) => { setFilter(v as any); setPage(0); }}>
                  <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="completed">Concluídos</SelectItem>
                    <SelectItem value="error">Com erro</SelectItem>
                    <SelectItem value="replied">Responderam</SelectItem>
                    <SelectItem value="nosend">Sem envio</SelectItem>
                  </SelectContent>
                </Select>
                <div className="ml-auto self-center text-xs text-muted-foreground">
                  {nf(filtered.length)} registros
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lead</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Enviado</TableHead>
                      <TableHead>Respondeu</TableHead>
                      <TableHead>Finalizado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((l, i) => (
                      <TableRow key={`${l.p}-${i}`}>
                        <TableCell className="max-w-[220px] truncate font-medium">{l.n || "—"}</TableCell>
                        <TableCell className="tabular-nums text-xs">{phone(l.p)}</TableCell>
                        <TableCell>
                          <Badge variant={l.s === "completed" ? "outline" : "destructive"}>
                            {l.s === "completed" ? "concluído" : "erro"}
                          </Badge>
                          {l.r && <Badge variant="secondary" className="ml-1">respondeu</Badge>}
                        </TableCell>
                        <TableCell className="text-xs">{dt(l.e)}</TableCell>
                        <TableCell className="text-xs">{dt(l.r)}</TableCell>
                        <TableCell className="text-xs">{dt(l.fi)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Página {page + 1} de {nf(pages)}</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
                  <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
