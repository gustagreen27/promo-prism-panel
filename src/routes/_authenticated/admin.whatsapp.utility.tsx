import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Search } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorCard } from "@/components/admin/query-state";
import { listTemplates, syncAllTemplates } from "@/lib/whatsapp-templates.functions";

export const Route = createFileRoute("/_authenticated/admin/whatsapp/utility")({
  head: () => ({
    meta: [
      { title: "Templates de utilidade por WABA — WhatsApp" },
      { name: "description", content: "Lista de todos os templates UTILITY por WABA com status, idioma e última atualização." },
      { property: "og:title", content: "Templates de utilidade por WABA" },
      { property: "og:description", content: "Status PENDING/APPROVED/REJECTED, idioma e última atualização dos templates UTILITY." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const STATUS_META: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  approved: { label: "APPROVED", variant: "default" },
  pending: { label: "PENDING", variant: "secondary" },
  rejected: { label: "REJECTED", variant: "destructive" },
  paused: { label: "PAUSED", variant: "outline" },
  disabled: { label: "DISABLED", variant: "outline" },
};

const fmt = (d?: string | null) =>
  d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

function Page() {
  const listFn = useServerFn(listTemplates);
  const syncFn = useServerFn(syncAllTemplates);
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["wa-templates"], queryFn: () => listFn() });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");

  const syncMut = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: (r: any) => {
      toast.success(`${r?.synced ?? 0}/${r?.total ?? 0} templates sincronizados`);
      qc.invalidateQueries({ queryKey: ["wa-templates"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao sincronizar"),
  });

  const groups = useMemo(() => {
    const rows = (data ?? []).filter((r: any) => String(r.category ?? "").toUpperCase() === "UTILITY");
    const filtered = rows.filter((r: any) => {
      const okStatus = status === "all" || r.status === status;
      const term = q.trim().toLowerCase();
      const okTerm = !term || `${r.name} ${r.waba?.nome_interno ?? ""} ${r.language}`.toLowerCase().includes(term);
      return okStatus && okTerm;
    });
    const map = new Map<string, { name: string; wabaId: string | null; items: any[] }>();
    for (const r of filtered) {
      const key = r.waba?.id ?? "sem-waba";
      if (!map.has(key)) map.set(key, { name: r.waba?.nome_interno ?? "Sem WABA vinculada", wabaId: r.waba?.waba_id ?? null, items: [] });
      map.get(key)!.items.push(r);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [data, q, status]);

  const totals = useMemo(() => {
    const all = groups.flatMap((g) => g.items);
    return {
      total: all.length,
      approved: all.filter((r) => r.status === "approved").length,
      pending: all.filter((r) => r.status === "pending").length,
      rejected: all.filter((r) => r.status === "rejected").length,
    };
  }, [groups]);

  return (
    <>
      <PageHeader
        title="Templates de utilidade"
        description="Todos os templates da categoria UTILITY agrupados por WABA, com status, idioma e última atualização."
        actions={
          <Button variant="outline" disabled={syncMut.isPending} onClick={() => syncMut.mutate()}>
            <RefreshCw className={`mr-2 h-4 w-4 ${syncMut.isPending ? "animate-spin" : ""}`} />
            {syncMut.isPending ? "Sincronizando…" : "Sincronizar com a Meta"}
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        {[
          { label: "Total UTILITY", value: totals.total },
          { label: "Aprovados", value: totals.approved },
          { label: "Pendentes", value: totals.pending },
          { label: "Rejeitados", value: totals.rejected },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome, WABA ou idioma" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="pending">PENDING</SelectItem>
            <SelectItem value="approved">APPROVED</SelectItem>
            <SelectItem value="rejected">REJECTED</SelectItem>
            <SelectItem value="paused">PAUSED</SelectItem>
            <SelectItem value="disabled">DISABLED</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Carregando…</div>
      ) : error ? (
        <ErrorCard error={error} onRetry={() => refetch()} />
      ) : groups.length === 0 ? (
        <EmptyState title="Nenhum template UTILITY" description="Sincronize com a Meta ou cadastre um novo template de utilidade." />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.name} className="rounded-xl border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold">{g.name}</h2>
                  {g.wabaId && <p className="font-mono text-[11px] text-muted-foreground">WABA ID {g.wabaId}</p>}
                </div>
                <Badge variant="secondary">{g.items.length} template(s)</Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Idioma</TableHead>
                    <TableHead>Meta ID</TableHead>
                    <TableHead>Última atualização</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {g.items.map((r: any) => {
                    const s = STATUS_META[r.status] ?? { label: String(r.status ?? "—").toUpperCase(), variant: "outline" as const };
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          {r.name}
                          {r.rejection_reason && (
                            <div className="mt-1 max-w-[320px] truncate text-[11px] text-destructive" title={r.rejection_reason}>
                              {r.rejection_reason}
                            </div>
                          )}
                        </TableCell>
                        <TableCell><Badge variant={s.variant}>{s.label}</Badge></TableCell>
                        <TableCell className="text-sm">{r.language}</TableCell>
                        <TableCell className="font-mono text-xs">{r.meta_template_id ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{fmt(r.updated_at ?? r.created_at)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
