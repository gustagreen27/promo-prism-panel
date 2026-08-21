import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ErrorCard } from "@/components/admin/query-state";
import {
  listApprovalQueue, decideCampaignApproval, getCampaignApprovalAudit,
} from "@/lib/campaign-approval.functions";
import { History, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/campanhas-aprovacao")({
  head: () => ({ meta: [{ title: "Aprovação de disparos — Admin" }] }),
  component: Page,
});

type Item = {
  id: string;
  name: string;
  workspace_name: string | null;
  list_name: string | null;
  template_name: string | null;
  total_recipients: number | null;
  created_at: string;
  scheduled_at: string | null;
  approval_status: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  status: string;
};

const fmt = (v: string | null | undefined) => (v ? new Date(v).toLocaleString("pt-BR") : "—");

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: "Aguardando aprovação", className: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  approved: { label: "Aprovada", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  rejected: { label: "Rejeitada", className: "bg-destructive/15 text-destructive border-destructive/30" },
};

function AuditDialog({ campaignId, onClose }: { campaignId: string | null; onClose: () => void }) {
  const auditFn = useServerFn(getCampaignApprovalAudit);
  const { data, isLoading } = useQuery({
    queryKey: ["campaign-audit", campaignId],
    enabled: !!campaignId,
    queryFn: () => auditFn({ data: { campaign_id: campaignId as string } }),
  });
  const entries = ((data as any)?.entries ?? []) as Array<any>;
  return (
    <Dialog open={!!campaignId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Histórico de auditoria</DialogTitle></DialogHeader>
        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem registros para esta demanda.</p>
        ) : (
          <div className="max-h-[60vh] space-y-3 overflow-y-auto text-sm">
            {entries.map((e) => (
              <div key={e.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{e.action}</span>
                  <span className="text-xs text-muted-foreground">{fmt(e.created_at)}</span>
                </div>
                <div className="text-xs text-muted-foreground">Por: {e.actor_name}</div>
                {e.message && <div className="mt-1 text-xs">Justificativa: {e.message}</div>}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Page() {
  const qc = useQueryClient();
  const listFn = useServerFn(listApprovalQueue);
  const decideFn = useServerFn(decideCampaignApproval);

  const [tab, setTab] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [confirm, setConfirm] = useState<{ item: Item; decision: "approved" | "rejected" } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [auditId, setAuditId] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["approval-queue", tab],
    queryFn: () => listFn({ data: { status: tab } }),
    refetchInterval: 30_000,
  });
  const items = ((data as any)?.items ?? []) as Item[];

  async function submitDecision() {
    if (!confirm) return;
    if (confirm.decision === "rejected" && reason.trim().length < 3) {
      toast.error("Informe a justificativa da rejeição");
      return;
    }
    setBusy(true);
    try {
      await decideFn({
        data: { campaign_id: confirm.item.id, decision: confirm.decision, reason: reason.trim() || null },
      });
      toast.success(confirm.decision === "approved" ? "Demanda aprovada e liberada para a fila" : "Demanda rejeitada");
      setConfirm(null);
      setReason("");
      qc.invalidateQueries({ queryKey: ["approval-queue"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao registrar decisão");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Fila de aprovação de disparos</CardTitle>
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="pending">Pendentes</TabsTrigger>
              <TabsTrigger value="approved">Aprovadas</TabsTrigger>
              <TabsTrigger value="rejected">Rejeitadas</TabsTrigger>
              <TabsTrigger value="all">Todas</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : error ? (
            <ErrorCard error={error} onRetry={() => refetch()} />
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada por aqui.</p>
          ) : (
            <div className="divide-y">
              {items.map((r) => {
                const badge = STATUS_BADGE[r.approval_status ?? ""] ?? { label: r.approval_status ?? "—", className: "" };
                return (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-medium">
                        {r.name}
                        <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.workspace_name ?? "—"} · {(r.total_recipients ?? 0).toLocaleString("pt-BR")} destinatários
                        {r.list_name ? ` · Lista: ${r.list_name}` : ""}
                        {r.template_name ? ` · Template: ${r.template_name}` : ""}
                        {" · "}Criada em {fmt(r.created_at)}
                        {r.scheduled_at ? ` · Agendada: ${fmt(r.scheduled_at)}` : ""}
                      </div>
                      {r.approval_status === "rejected" && r.rejection_reason && (
                        <div className="mt-1 text-xs text-destructive">Motivo: {r.rejection_reason}</div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setAuditId(r.id)}>
                        <History className="mr-1 h-4 w-4" /> Auditoria
                      </Button>
                      {r.approval_status !== "rejected" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setReason(""); setConfirm({ item: r, decision: "rejected" }); }}
                        >
                          Rejeitar
                        </Button>
                      )}
                      {r.approval_status !== "approved" && (
                        <Button size="sm" onClick={() => { setReason(""); setConfirm({ item: r, decision: "approved" }); }}>
                          Aprovar
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.decision === "approved" ? "Confirmar aprovação do disparo" : "Confirmar rejeição"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.decision === "approved"
                ? `"${confirm?.item.name}" será liberada para envio real a ${(confirm?.item.total_recipients ?? 0).toLocaleString("pt-BR")} destinatários. Esta ação fica registrada na auditoria.`
                : `"${confirm?.item.name}" será bloqueada e o cliente receberá a justificativa informada.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={confirm?.decision === "approved" ? "Observação (opcional)" : "Justificativa da rejeição (obrigatória)"}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => { e.preventDefault(); void submitDecision(); }}
            >
              {busy ? "Salvando…" : confirm?.decision === "approved" ? "Aprovar disparo" : "Rejeitar demanda"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AuditDialog campaignId={auditId} onClose={() => setAuditId(null)} />
    </div>
  );
}
