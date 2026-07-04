import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { approveCampaign, rejectCampaign } from "@/lib/admin-whatsapp.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/campanhas-aprovacao")({
  head: () => ({ meta: [{ title: "Aprovação de campanhas — Admin" }] }),
  component: Page,
});

type Row = { id: string; name: string; workspace_id: string; total_recipients: number | null; created_at: string; workspaces?: { name: string } };

function Page() {
  const [rows, setRows] = useState<Row[]>([]);
  const fnApprove = useServerFn(approveCampaign);
  const fnReject = useServerFn(rejectCampaign);

  async function reload() {
    const { data } = await supabase
      .from("wa_campaigns")
      .select("id,name,workspace_id,total_recipients,created_at,workspaces(name)")
      .eq("approval_status", "pending")
      .order("created_at", { ascending: false });
    setRows((data as unknown as Row[]) || []);
  }
  useEffect(() => { reload(); }, []);

  return (
    <Card>
      <CardHeader><CardTitle>Campanhas aguardando aprovação</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
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
                    onClick={async () => {
                      const reason = window.prompt("Motivo da rejeição:");
                      if (!reason) return;
                      await fnReject({ data: { campaign_id: r.id, reason } });
                      toast.success("Rejeitada");
                      reload();
                    }}
                  >
                    Rejeitar
                  </Button>
                  <Button
                    size="sm"
                    onClick={async () => {
                      await fnApprove({ data: { campaign_id: r.id } });
                      toast.success("Aprovada");
                      reload();
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
