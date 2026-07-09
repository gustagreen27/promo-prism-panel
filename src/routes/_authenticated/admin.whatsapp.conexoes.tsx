import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  listWorkspaceConnections,
  setWorkspaceBusinessId,
  setWorkspaceDefaultConnection,
} from "@/lib/wa-connections.functions";

export const Route = createFileRoute("/_authenticated/admin/whatsapp/conexoes")({
  head: () => ({ meta: [{ title: "Conexões — WhatsApp" }] }),
  component: Page,
});

function Page() {
  const listFn = useServerFn(listWorkspaceConnections);
  const setBiz = useServerFn(setWorkspaceBusinessId);
  const setDefault = useServerFn(setWorkspaceDefaultConnection);
  const qc = useQueryClient();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["wa-workspace-conns"],
    queryFn: () => listFn(),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["wa-workspace-conns"] });

  const bizMut = useMutation({
    mutationFn: (p: { workspace_id: string; meta_business_id: string | null; meta_business_name: string | null }) =>
      setBiz({ data: p }),
    onSuccess: () => { toast.success("Business ID salvo"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const defMut = useMutation({
    mutationFn: (p: { workspace_id: string; connection_id: string | null }) =>
      setDefault({ data: p }),
    onSuccess: () => { toast.success("Número padrão atualizado"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  return (
    <>
      <PageHeader
        title="Conexões"
        description="Vincule cada workspace ao seu Business Manager (BM) e ao número padrão de envio."
      />
      {isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
      ) : rows.length === 0 ? (
        <EmptyState title="Nenhum workspace" />
      ) : (
        <div className="space-y-4">
          {rows.map((w: any) => (
            <WorkspaceCard
              key={w.id}
              w={w}
              onSaveBiz={(p) => bizMut.mutate({ workspace_id: w.id, ...p })}
              onSaveDefault={(cid) => defMut.mutate({ workspace_id: w.id, connection_id: cid })}
              saving={bizMut.isPending || defMut.isPending}
            />
          ))}
        </div>
      )}
    </>
  );
}

function WorkspaceCard({ w, onSaveBiz, onSaveDefault, saving }: any) {
  const [bizId, setBizId] = useState<string>(w.meta_business_id ?? "");
  const [bizName, setBizName] = useState<string>(w.meta_business_name ?? "");
  const [defConn, setDefConn] = useState<string>(w.default_connection_id ?? "");

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold">{w.name}</h3>
          <p className="text-xs text-muted-foreground">/{w.slug} · {w.plan} · <Badge variant="outline">{w.status}</Badge></p>
        </div>
        <div className="text-xs text-muted-foreground">
          {w.wabas.length} WABA · {w.connections.length} números
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Business Manager ID</Label>
          <Input value={bizId} onChange={(e) => setBizId(e.target.value)} placeholder="1234567890" />
        </div>
        <div>
          <Label className="text-xs">Nome do BM (opcional)</Label>
          <Input value={bizName} onChange={(e) => setBizName(e.target.value)} placeholder="Minha Empresa" />
        </div>
        <div className="flex items-end">
          <Button
            variant="outline"
            disabled={saving}
            onClick={() =>
              onSaveBiz({ meta_business_id: bizId.trim() || null, meta_business_name: bizName.trim() || null })
            }
          >
            <Save className="mr-2 h-4 w-4" />Salvar BM
          </Button>
        </div>

        <div className="md:col-span-2">
          <Label className="text-xs">Número padrão de envio</Label>
          <Select value={defConn} onValueChange={setDefConn}>
            <SelectTrigger><SelectValue placeholder="— nenhum —" /></SelectTrigger>
            <SelectContent>
              {w.connections.length === 0 ? (
                <SelectItem value="__none" disabled>Sem números vinculados</SelectItem>
              ) : w.connections.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} · {c.display_phone ?? "—"} · {c.status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button
            disabled={saving}
            onClick={() => onSaveDefault(defConn || null)}
          >
            <Save className="mr-2 h-4 w-4" />Salvar padrão
          </Button>
        </div>
      </div>
    </div>
  );
}
