import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { duplicateCampaign } from "@/lib/wa-schedule.functions";
import { Plus, Copy, History } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/painel/campanhas")({
  head: () => ({ meta: [{ title: "Campanhas — Disparos FR" }] }),
  component: Page,
});

type Row = {
  id: string;
  name: string;
  status: string;
  approval_status: string;
  total_recipients: number | null;
  created_at: string;
  scheduled_at: string | null;
};

function Page() {
  const { workspaceId } = Route.useRouteContext() as { workspaceId: string };
  const qc = useQueryClient();
  const dupFn = useServerFn(duplicateCampaign);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["campaigns", workspaceId],
    queryFn: async () => {
      const { data } = await supabase
        .from("wa_campaigns")
        .select("id,name,status,approval_status,total_recipients,created_at,scheduled_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(100);
      return (data as Row[]) || [];
    },
  });

  const dup = useMutation({
    mutationFn: (id: string) => dupFn({ data: { campaign_id: id } }),
    onSuccess: () => { toast.success("Duplicada"); qc.invalidateQueries({ queryKey: ["campaigns"] }); },
    onError: (e: any) => toast.error(e?.message),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Campanhas</CardTitle>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm"><Link to="/painel/campanhas/historico"><History className="mr-1 h-4 w-4" />Histórico</Link></Button>
          <Button asChild size="sm"><Link to="/painel/campanhas/nova"><Plus className="mr-1 h-4 w-4" />Nova campanha</Link></Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Carregando…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Nenhuma campanha ainda. Crie sua primeira.</p>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Agendada para</TableHead>
              <TableHead>Contatos</TableHead>
              <TableHead>Criada em</TableHead>
              <TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                  <TableCell>{r.scheduled_at ? new Date(r.scheduled_at).toLocaleString("pt-BR") : "—"}</TableCell>
                  <TableCell>{r.total_recipients ?? 0}</TableCell>
                  <TableCell>{new Date(r.created_at).toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => dup.mutate(r.id)} disabled={dup.isPending}>
                      <Copy className="mr-1 h-4 w-4" />Duplicar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
