import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ShieldBan, Trash2, Plus } from "lucide-react";
import { addSuppression, listSuppressions, removeSuppression } from "@/lib/wa-failures.functions";

export const Route = createFileRoute("/_authenticated/admin/whatsapp/supressao")({
  head: () => ({
    meta: [
      { title: "Supressão global — Disparos FR" },
      { name: "description", content: "Lista global de números bloqueados para disparo em todas as campanhas." },
      { property: "og:title", content: "Supressão global — Disparos FR" },
      { property: "og:description", content: "Números bloqueados automaticamente ou manualmente para disparo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const REASON_LABEL: Record<string, string> = {
  manual_block: "Bloqueio manual",
  opt_out: "Opt-out",
  invalid_number: "Número inválido",
  repeated_hard_failure: "Falhas definitivas repetidas",
};

function Page() {
  const qc = useQueryClient();
  const list = useServerFn(listSuppressions);
  const add = useServerFn(addSuppression);
  const del = useServerFn(removeSuppression);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");

  const q = useQuery({
    queryKey: ["wa-suppressions", search, page],
    queryFn: () => list({ data: { search, page, page_size: 25, kind: "all" as const } }),
  });

  const addM = useMutation({
    mutationFn: () => add({ data: { phone, note: note || undefined, reason: "manual_block" as const, permanent: true } }),
    onSuccess: () => {
      toast.success("Número bloqueado para disparos");
      setPhone("");
      setNote("");
      qc.invalidateQueries({ queryKey: ["wa-suppressions"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao bloquear"),
  });

  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Removido da supressão");
      qc.invalidateQueries({ queryKey: ["wa-suppressions"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao remover"),
  });

  const rows = (q.data?.rows ?? []) as any[];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Supressão global"
        description="Números que nunca entram em disparo — bloqueio manual ou automático após falhas definitivas."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldBan className="h-4 w-4" />
            Bloquear número
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row">
          <Input placeholder="55119..." value={phone} onChange={(e) => setPhone(e.target.value)} className="sm:max-w-56" />
          <Input placeholder="Motivo/observação (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button onClick={() => addM.mutate()} disabled={!phone.trim() || addM.isPending}>
            <Plus className="mr-1 h-4 w-4" />
            Bloquear
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            Bloqueados{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({(q.data?.total ?? 0).toLocaleString("pt-BR")})
            </span>
          </CardTitle>
          <Input
            placeholder="Buscar telefone"
            value={search}
            onChange={(e) => {
              setPage(0);
              setSearch(e.target.value);
            }}
            className="max-w-56"
          />
        </CardHeader>
        <CardContent className="p-0">
          {q.isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Carregando…</p>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Nenhum número na supressão.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Falhas</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Última ocorrência</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono">{r.phone_normalized}</TableCell>
                    <TableCell>
                      {REASON_LABEL[r.reason] ?? r.reason}
                      {r.note ? <span className="block text-xs text-muted-foreground">{r.note}</span> : null}
                    </TableCell>
                    <TableCell className="tabular-nums">{r.failure_count ?? 0}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.permanent ? "Permanente" : "Temporária"}</Badge>
                    </TableCell>
                    <TableCell>{r.last_seen_at ? new Date(r.last_seen_at).toLocaleString("pt-BR") : "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => delM.mutate(r.id)} disabled={delM.isPending}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={(page + 1) * 25 >= (q.data?.total ?? 0)}
          onClick={() => setPage((p) => p + 1)}
        >
          Próxima
        </Button>
      </div>
    </div>
  );
}
