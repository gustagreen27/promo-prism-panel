import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorCard } from "@/components/admin/query-state";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { approveCampaign, rejectCampaign } from "@/lib/admin-whatsapp.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/campanhas-aprovacao")({
  head: () => ({ meta: [{ title: "Aprovação de campanhas — Admin" }] }),
  component: Page,
});

type Row = { id: string; name: string; workspace_id: string; total_recipients: number | null; created_at: string; workspaces?: { name: string } };

async function fetchPending(): Promise<Row[]> {
  const { data, error } = await supabase
    .from("wa_campaigns")
    .select("id,name,workspace_id,total_recipients,created_at,workspaces(name)")
    .eq("approval_status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as Row[]) ?? [];
}

function Page() {
  const qc = useQueryClient();
  const fnApprove = useServerFn(approveCampaign);
  const fnReject = useServerFn(rejectCampaign);

  const { data: rows, isLoading, error, refetch } = useQuery({
    queryKey: ["wa-campaigns-pending-approval"],
    queryFn: fetchPending,
  });

  const [busyId, setBusyId] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader><CardTitle>Campanhas aguardando aprovação</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : error ? (
          <ErrorCard error={error} onRetry={() => refetch()} />
        ) : !rows || rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada pendente.</p>
        ) : (
          <div className="divide-y">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.workspaces?.name} · {r.total_recipients ?? 0} destinatários · {new Date(r.created_at).toLocaleString("pt-BR")}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === r.id}
                    onClick={async () => {
                      const reason = window.prompt("Motivo da rejeição:");
                      if (!reason) return;
                      setBusyId(r.id);
                      try {
                        await fnReject({ data: { campaign_id: r.id, reason } });
                        toast.success("Rejeitada");
                        qc.invalidateQueries({ queryKey: ["wa-campaigns-pending-approval"] });
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Falha ao rejeitar");
                      } finally {
                        setBusyId(null);
                      }
                    }}
                  >
                    Rejeitar
                  </Button>
                  <Button
                    size="sm"
                    disabled={busyId === r.id}
                    onClick={async () => {
                      setBusyId(r.id);
                      try {
                        await fnApprove({ data: { campaign_id: r.id } });
                        toast.success("Aprovada");
                        qc.invalidateQueries({ queryKey: ["wa-campaigns-pending-approval"] });
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Falha ao aprovar");
                      } finally {
                        setBusyId(null);
                      }
                    }}
                  >
                    Aprovar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
