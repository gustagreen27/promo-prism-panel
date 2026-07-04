import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Plus } from "lucide-react";

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
};

function Page() {
  const { workspaceId } = Route.useRouteContext() as { workspaceId: string };
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("wa_campaigns")
        .select("id,name,status,approval_status,total_recipients,created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(50);
      setRows((data as Row[]) || []);
      setLoading(false);
    })();
  }, [workspaceId]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Campanhas</CardTitle>
        <Button asChild size="sm">
          <Link to="/painel/campanhas/nova"><Plus className="mr-1 h-4 w-4" /> Nova campanha</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma campanha ainda. Crie sua primeira.</p>
        ) : (
          <div className="divide-y">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("pt-BR")} · {r.total_recipients ?? 0} destinatários
                  </div>
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{r.status}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
