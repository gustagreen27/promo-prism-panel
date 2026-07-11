import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { grantNumberToWorkspace, revokeNumberGrant } from "@/lib/admin-whatsapp.functions";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { ErrorCard } from "@/components/admin/query-state";

export const Route = createFileRoute("/_authenticated/admin/whatsapp/liberacoes")({
  head: () => ({ meta: [{ title: "Liberações de números — Admin" }] }),
  component: Page,
});

type Conn = { id: string; display_name: string | null; name: string | null; display_phone: string | null; visibility: string; paused_at: string | null };
type WS = { id: string; name: string };
type Grant = { id: string; connection_id: string; workspace_id: string; created_at: string };

function Page() {
  const [conns, setConns] = useState<Conn[]>([]);
  const [ws, setWs] = useState<WS[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [selConn, setSelConn] = useState("");
  const [selWs, setSelWs] = useState("");
  const fnGrant = useServerFn(grantNumberToWorkspace);
  const fnRevoke = useServerFn(revokeNumberGrant);

  async function reload() {
    setLoading(true);
    const [c, w, g] = await Promise.all([
      supabase.from("whatsapp_connections").select("id,display_name,name,display_phone,visibility,paused_at").order("display_name"),
      supabase.from("workspaces").select("id,name").order("name"),
      supabase.from("whatsapp_number_grants").select("id,connection_id,workspace_id,created_at"),
    ]);
    const firstError = c.error || w.error || g.error;
    if (firstError) {
      setLoadError(firstError);
      setLoading(false);
      return;
    }
    setLoadError(null);
    setConns(c.data as Conn[]);
    setWs(w.data as WS[]);
    setGrants(g.data as Grant[]);
    setLoading(false);
  }
  useEffect(() => { reload(); }, []);

  async function handleGrant() {
    if (!selConn || !selWs) return;
    try {
      await fnGrant({ data: { connection_id: selConn, workspace_id: selWs } });
      toast.success("Número liberado");
      setSelWs("");
      reload();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function handleRevoke(id: string) {
    await fnRevoke({ data: { grant_id: id } });
    toast.success("Liberação removida");
    reload();
  }

  if (loadError) {
    return <ErrorCard error={loadError} onRetry={() => reload()} />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Liberar número para um cliente</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs">Número</label>
            <select className="rounded border px-3 py-2 text-sm" value={selConn} onChange={(e) => setSelConn(e.target.value)}>
              <option value="">—</option>
              {conns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name || c.name} ({c.display_phone}) · {c.visibility}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs">Cliente (workspace)</label>
            <select className="rounded border px-3 py-2 text-sm" value={selWs} onChange={(e) => setSelWs(e.target.value)}>
              <option value="">—</option>
              {ws.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <Button onClick={handleGrant} disabled={!selConn || !selWs}>Liberar</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Liberações ativas</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : grants.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma liberação.</p>
          ) : (
            <div className="divide-y text-sm">
              {grants.map((g) => {
                const c = conns.find((x) => x.id === g.connection_id);
                const w = ws.find((x) => x.id === g.workspace_id);
                return (
                  <div key={g.id} className="flex items-center justify-between py-2">
                    <div>
                      <b>{c?.display_name || c?.name}</b> → {w?.name}
                      <div className="text-xs text-muted-foreground">
                        Desde {new Date(g.created_at).toLocaleDateString("pt-BR")}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => handleRevoke(g.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
