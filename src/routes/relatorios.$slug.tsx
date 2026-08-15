import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText } from "lucide-react";
import { getPublicReport, listPublicReportRecords } from "@/lib/public-reports.functions";

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
const dt = (v?: string | null) =>
  v
    ? new Date(v).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      })
    : "Não informado";
const statusLabel = (s?: string | null) => (s === "completed" ? "Concluído" : s === "error" ? "Com erro" : (s ?? "—"));

function PublicReportPage() {
  const { slug } = Route.useParams();
  const reportFn = useServerFn(getPublicReport);
  const recordsFn = useServerFn(listPublicReportRecords);

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

  const { data, isLoading } = useQuery({
    queryKey: ["public-report-records", slug, term, status, page],
    queryFn: () => recordsFn({ data: { slug, search: term, status, page, perPage } }),
    placeholderData: keepPreviousData,
    enabled: !!report,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / perPage));

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

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Relatório de disparo</p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{report.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gerado em {dt(report.created_at)}
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total" value={nf(report.total ?? 0)} />
        <Kpi label="Concluídos" value={nf(report.completed ?? 0)} />
        <Kpi label="Com erro" value={nf(report.errors ?? 0)} />
        <Kpi label="Taxa de conclusão" value={pctFmt(report.completion_rate ?? 0)} />
      </div>

      <Card className="mt-4 grid gap-3 p-4 text-sm sm:grid-cols-3">
        <Info label="Primeiro início" value={dt(report.first_started_at)} />
        <Info label="Primeiro envio registrado" value={dt(report.first_sent_at)} />
        <Info label="Último envio registrado" value={dt(report.last_sent_at)} />
      </Card>

      <Card className="mt-6 p-4">
        <h2 className="mb-3 text-sm font-semibold">Logs do disparo</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="max-w-sm"
            placeholder="Pesquisar por nome, telefone, e-mail ou ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setTerm(search); setPage(0); } }}
          />
          <Button variant="secondary" onClick={() => { setTerm(search); setPage(0); }}>Pesquisar</Button>
          <div className="flex gap-1">
            {(["all", "completed", "error"] as const).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={status === s ? "default" : "outline"}
                onClick={() => { setStatus(s); setPage(0); }}
              >
                {s === "all" ? "Todos" : s === "completed" ? "Concluídos" : "Com erro"}
              </Button>
            ))}
          </div>
          <span className="ml-auto text-xs text-muted-foreground">{nf(total)} registros</span>
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
          ) : !rows.length ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Nenhum registro encontrado</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Iniciado</TableHead>
                  <TableHead className="text-right">Logs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Badge variant={r.status === "completed" ? "outline" : "destructive"}>{statusLabel(r.status)}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate font-medium">{r.name || "—"}</TableCell>
                    <TableCell className="text-xs tabular-nums">{r.phone || "—"}</TableCell>
                    <TableCell className="max-w-[220px] truncate text-xs">{r.email || "—"}</TableCell>
                    <TableCell className="text-xs">{dt(r.started_at)}</TableCell>
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

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </Card>
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
