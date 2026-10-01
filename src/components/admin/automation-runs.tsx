import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listAutomationRuns, getAutomationRun, cancelAutomationRun } from "@/lib/automations.functions";
import { BLOCK_MAP } from "@/lib/automation-graph";

export const RUN_STATUS: Record<string, string> = {
  pending: "Pendente", running: "Executando", waiting: "Aguardando", completed: "Concluída", failed: "Falhou", cancelled: "Cancelada",
};
const STEP_STATUS: Record<string, string> = {
  running: "Executando", completed: "Concluída", failed: "Falhou", waiting: "Aguardando", skipped: "Ignorada", uncertain: "Incerta", simulated: "Simulada",
};
const DELIVERY: Record<string, string> = {
  accepted: "Meta aceitou o envio", sent: "Enviada", delivered: "Entregue", read: "Lida", failed: "Falhou na entrega",
};

function dur(a?: string | null, b?: string | null) {
  if (!a || !b) return "—";
  const ms = Date.parse(b) - Date.parse(a);
  return ms < 1000 ? `${ms} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 60000)} min`;
}

export function RunsPanel({ automationId }: { automationId: string }) {
  const list = useServerFn(listAutomationRuns);
  const q = useQuery({ queryKey: ["automation-runs", automationId], queryFn: () => list({ data: { automationId } }), refetchInterval: 10000 });
  const [open, setOpen] = useState<string | null>(null);
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!q.data?.length) return <p className="text-sm text-muted-foreground">Nenhuma execução ainda.</p>;
  return (
    <div className="space-y-2">
      {q.data.map((r: any) => (
        <div key={r.id} className="rounded-lg border">
          <button className="flex w-full flex-wrap items-center gap-2 p-3 text-left text-sm" onClick={() => setOpen(open === r.id ? null : r.id)}>
            <Badge variant={r.status === "failed" ? "destructive" : "secondary"}>{RUN_STATUS[r.status] ?? r.status}</Badge>
            {r.simulate && <Badge variant="outline">Simulação</Badge>}
            {r.is_test && !r.simulate && <Badge variant="outline">Teste real</Badge>}
            <span className="font-medium">{r.contacts?.name ?? r.contact_phone}</span>
            <span className="text-muted-foreground">· {r.trigger_type} · v{r.automation_versions?.version > 0 ? r.automation_versions.version : "rascunho"}</span>
            <span className="ml-auto text-xs text-muted-foreground">{new Date(r.started_at).toLocaleString("pt-BR")} · {dur(r.started_at, r.finished_at)}</span>
          </button>
          {open === r.id && <RunDetail runId={r.id} />}
        </div>
      ))}
    </div>
  );
}

export function RunDetail({ runId }: { runId: string }) {
  const qc = useQueryClient();
  const get = useServerFn(getAutomationRun);
  const cancel = useServerFn(cancelAutomationRun);
  const q = useQuery({ queryKey: ["automation-run", runId], queryFn: () => get({ data: { runId } }), refetchInterval: 5000 });
  const m = useMutation({
    mutationFn: () => cancel({ data: { runId } }),
    onSuccess: () => { toast.success("Execução cancelada"); qc.invalidateQueries({ queryKey: ["automation-run", runId] }); qc.invalidateQueries({ queryKey: ["automation-runs"] }); },
  });
  if (!q.data?.run) return <p className="p-3 text-sm text-muted-foreground">Carregando…</p>;
  const { run, steps, jobs } = q.data as any;
  const graph = run.automation_versions?.graph;
  const nodeLabel = (id: string) => {
    const n = graph?.nodes?.find((x: any) => x.id === id);
    return n ? (n.data?.label || BLOCK_MAP[n.type]?.label || n.type) : id;
  };
  return (
    <div className="space-y-3 border-t p-3 text-sm">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Início: {new Date(run.started_at).toLocaleString("pt-BR")}</span>
        <span>Término: {run.finished_at ? new Date(run.finished_at).toLocaleString("pt-BR") : "—"}</span>
        <span>Etapa atual: {run.current_node_id ? nodeLabel(run.current_node_id) : "—"}</span>
        <span>Caminho: {(run.path ?? []).map(nodeLabel).join(" → ") || "—"}</span>
      </div>
      {run.error && <p className="rounded bg-destructive/10 p-2 text-destructive">{run.error}</p>}
      <ol className="space-y-1.5">
        {steps.map((s: any) => (
          <li key={s.id} className="rounded border p-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{s.label ?? nodeLabel(s.node_id)}</span>
              <Badge variant={s.status === "failed" || s.status === "uncertain" ? "destructive" : "secondary"}>{STEP_STATUS[s.status] ?? s.status}</Badge>
              {s.output_handle && s.output_handle !== "out" && <Badge variant="outline">saída: {s.output_handle}</Badge>}
              {s.delivery_status && <Badge variant="outline">{DELIVERY[s.delivery_status] ?? s.delivery_status}</Badge>}
              <span className="ml-auto text-xs text-muted-foreground">tentativa {s.attempt} · {dur(s.started_at, s.finished_at)}</span>
            </div>
            {s.error && <p className="mt-1 text-xs text-destructive">{s.error}</p>}
            {s.status === "simulated" && s.output && <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted p-1.5 text-xs">{JSON.stringify(s.output, null, 2)}</pre>}
          </li>
        ))}
      </ol>
      {jobs.some((j: any) => j.last_error) && (
        <div className="text-xs text-muted-foreground">
          Tentativas com erro: {jobs.filter((j: any) => j.last_error).map((j: any) => `${nodeLabel(j.node_id)} (${j.attempt}x): ${j.last_error}`).join(" · ")}
        </div>
      )}
      {["pending", "running", "waiting"].includes(run.status) && (
        <Button size="sm" variant="outline" onClick={() => m.mutate()}>Cancelar execução</Button>
      )}
    </div>
  );
}
