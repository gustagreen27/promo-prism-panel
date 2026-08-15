import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorCard } from "@/components/admin/query-state";
import { RenameReportButton } from "@/components/admin/rename-report-button";
import { Download, FileText } from "lucide-react";
import { getImportedReport, listImportedRecords, renameImportedReport } from "@/lib/imported-reports.functions";
import { ReportSharingCard } from "@/components/admin/report-sharing-card";


export const Route = createFileRoute("/_authenticated/admin/relatorios/importados/$id")({
  head: () => ({
    meta: [
      { title: "Relatório importado — Painel" },
      { name: "description", content: "Resumo, leads e logs individuais de um relatório de disparo importado." },
      { property: "og:title", content: "Relatório importado" },
      { property: "og:description", content: "Resumo, leads e logs individuais de um relatório de disparo importado." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
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

function Page() {
  const { id } = Route.useParams();
  const reportFn = useServerFn(getImportedReport);
  const recordsFn = useServerFn(listImportedRecords);

  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState<"all" | "completed" | "error">("all");
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(50);
  const [selected, setSelected] = useState<any | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data: report, refetch: refetchReport } = useQuery({
    queryKey: ["imported-report", id],
    queryFn: () => reportFn({ data: { id } }),
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["imported-records", id, term, status, page, perPage],
    queryFn: () => recordsFn({ data: { reportId: id, search: term, status, page, perPage } }),
    placeholderData: keepPreviousData,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / perPage));

  const applySearch = () => { setTerm(search); setPage(0); };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const head = ["status", "nome", "telefone", "email", "lead_id", "item_id", "criado_em", "entrou_na_fila", "iniciado", "alteracao_status", "instancia", "ultima_msg_enviada_id", "ultima_msg_enviada_em", "ultima_msg_recebida_id", "ultima_msg_recebida_em", "error_code", "error_message", "message_status"];
      const all: any[] = [];
      const size = 1000;
      for (let p = 0; p * size < total; p++) {
        const chunk = await recordsFn({ data: { reportId: id, search: term, status, page: p, perPage: size } });
        all.push(...chunk.rows);
      }
      const body = all.map((r) => [
        statusLabel(r.status), r.name, r.phone, r.email, r.lead_id, r.boost_item_id,
        dt(r.created_at_source), dt(r.entered_at), dt(r.started_at), dt(r.status_changed_at),
        r.whatsapp_instance_id, r.last_sent_message_id, dt(r.last_sent_at),
        r.last_received_message_id, dt(r.last_received_at),
        r.error_code, r.error_message, r.message_status,
      ].map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","));
      const blob = new Blob(["\uFEFF" + [head.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${(report?.name ?? "relatorio").replace(/\s+/g, "-").toLowerCase()}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title={report?.name ?? "Relatório importado"}
        description="Relatório de disparo importado via arquivo."
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={exporting || !total}>
            <Download className="size-4" /> {exporting ? "Exportando…" : "Exportar CSV"}
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Total" value={nf(report?.total ?? 0)} />
        <Kpi label="Mensagens Entregues" value={nf(report?.completed ?? 0)} hint={pctFmt(report?.completion_rate ?? 0)} />
        <Kpi label="Com erro" value={nf(report?.errors ?? 0)} hint={pctFmt(report?.error_rate ?? 0)} />
      </div>

      <Card className="mt-4 grid gap-3 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Info label="Primeiro início" value={dt(report?.first_started_at)} />
        <Info label="Primeiro envio registrado" value={dt(report?.first_sent_at)} />
        <Info label="Último envio registrado" value={dt(report?.last_sent_at)} />
        <Info label="Boost ID" value={report?.boost_id ?? "Não informado"} />
      </Card>

      <ReportSharingCard
        reportId={id}
        name={report?.name}
        publicSlug={report?.public_slug ?? null}
        isPublic={!!report?.is_public}
        onChanged={() => refetchReport()}
      />

      <Card className="mt-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="max-w-sm"
            placeholder="Pesquisar por nome, telefone, e-mail ou ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") applySearch(); }}
          />
          <Button variant="secondary" onClick={applySearch}>Pesquisar</Button>
          <div className="flex gap-1">
            {(["all", "completed", "error"] as const).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={status === s ? "default" : "outline"}
                onClick={() => { setStatus(s); setPage(0); }}
              >
                {s === "all" ? "Todos" : s === "completed" ? "Mensagens Entregues" : "Falhou"}
              </Button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{nf(total)} registros encontrados</span>
            <Select value={String(perPage)} onValueChange={(v) => { setPerPage(Number(v)); setPage(0); }}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[50, 100, 250, 500].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border">
          {error ? (
            <div className="p-4"><ErrorCard error={error} onRetry={() => refetch()} /></div>
          ) : isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
          ) : !rows.length ? (
            <div className="p-10 text-center">
              <FileText className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">Nenhum registro encontrado</p>
            </div>
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
          <SheetHeader>
            <SheetTitle>Logs do registro</SheetTitle>
          </SheetHeader>
          {selected && (
            <div className="space-y-6 p-4 pt-2 text-sm">
              <Section title="Lead">
                <Info label="Nome" value={selected.name ?? "Não informado"} />
                <Info label="Telefone" value={selected.phone ?? "Não informado"} />
                <Info label="E-mail" value={selected.email ?? "Não informado"} />
                <Info label="Lead ID" value={selected.lead_id ?? "Não informado"} />
                <Info label="Item ID" value={selected.boost_item_id ?? "Não informado"} />
              </Section>
              <Section title="Execução">
                <Info label="Criado em" value={dt(selected.created_at_source)} />
                <Info label="Entrou na fila" value={dt(selected.entered_at)} />
                <Info label="Iniciado" value={dt(selected.started_at)} />
                <Info label="Alteração de status" value={dt(selected.status_changed_at)} />
              </Section>
              <Section title="WhatsApp">
                <Info label="Instância" value={selected.whatsapp_instance_id ?? "Não informado"} />
                <Info label="Último ID de mensagem enviada" value={selected.last_sent_message_id ?? "Não informado"} />
                <Info label="Data da última mensagem enviada" value={dt(selected.last_sent_at)} />
                <Info label="Último ID de mensagem recebida" value={selected.last_received_message_id ?? "Não informado"} />
                <Info label="Data da última mensagem recebida" value={dt(selected.last_received_at)} />
                <Info label="isPending" value={selected.is_pending == null ? "Não informado" : selected.is_pending ? "true" : "false"} />
              </Section>
              <Section title="Erros">
                <Info label="errorCode" value={selected.error_code ?? "Não informado"} />
                <Info label="errorMessage" value={selected.error_message ?? "Não informado"} />
                <Info label="messageStatus" value={selected.message_status ?? "Não informado"} />
                <Info label="lastSentErrorCode" value={selected.last_sent_error_code ?? "Não informado"} />
                <Info label="lastReceivedErrorCode" value={selected.last_received_error_code ?? "Não informado"} />
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
    </>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
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
