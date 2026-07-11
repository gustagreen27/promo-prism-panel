import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { Info, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmbeddedSignupButton } from "@/components/admin/whatsapp/embedded-signup-button";
import { listClients } from "@/lib/clients.functions";
import { listProjects } from "@/lib/projects.functions";
import { listOnboardingLogs } from "@/lib/wa-embedded-signup.functions";
import { ErrorCard } from "@/components/admin/query-state";

export const Route = createFileRoute("/_authenticated/admin/whatsapp/embedded-signup")({
  head: () => ({ meta: [{ title: "Embedded Signup — WhatsApp" }] }),
  component: Page,
});

const NONE = "__none__";

function Page() {
  const qc = useQueryClient();
  const clientsFn = useServerFn(listClients);
  const projectsFn = useServerFn(listProjects);
  const logsFn = useServerFn(listOnboardingLogs);

  const clientsQuery = useQuery({ queryKey: ["clients"], queryFn: () => clientsFn() });
  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: () => projectsFn() });
  const logsQuery = useQuery({ queryKey: ["wa-onboarding-logs"], queryFn: () => logsFn({ data: {} }) });
  const clients = clientsQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const { data: logs, isLoading: logsLoading, error: logsError, refetch: refetchLogs } = logsQuery;
  const filtersError = clientsQuery.error || projectsQuery.error;

  const [clientId, setClientId] = useState<string>(NONE);
  const [projectId, setProjectId] = useState<string>(NONE);
  const [nomeInterno, setNomeInterno] = useState("");

  return (
    <>
      <PageHeader
        title="Embedded Signup"
        description="Cliente conecta a própria BM/WABA/número pelo fluxo oficial da Meta. Os dados são salvos automaticamente e o token fica no backend."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border bg-card p-6 space-y-5">
          {filtersError && (
            <ErrorCard error={filtersError} onRetry={() => { clientsQuery.refetch(); projectsQuery.refetch(); }} />
          )}
          <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm flex gap-2">
            <Info className="h-4 w-4 shrink-0 text-primary mt-0.5" />
            <div>
              <div className="font-medium">Como usar</div>
              <p className="text-muted-foreground mt-1">
                Selecione o cliente/projeto ao qual a conexão será vinculada e clique em <strong>Conectar WhatsApp</strong>.
                Um popup oficial da Meta abrirá. Após aprovação, a WABA e o número são criados/atualizados automaticamente.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Nome interno (opcional)</Label>
              <Input
                placeholder="Ex.: WABA – Cliente ACME"
                value={nomeInterno}
                onChange={(e) => setNomeInterno(e.target.value)}
              />
            </div>
            <div>
              <Label>Cliente</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Projeto</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {projects.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="pt-2 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-3 space-y-2">
              <div className="font-medium text-sm">Adicionar um número novo</div>
              <p className="text-xs text-muted-foreground">
                Número que ainda não esteja cadastrado no WhatsApp/WhatsApp Business.
              </p>
              <EmbeddedSignupButton
                mode="standard"
                label="Cadastrar novo número"
                clientId={clientId === NONE ? null : clientId}
                projectId={projectId === NONE ? null : projectId}
                nomeInterno={nomeInterno || undefined}
                onCompleted={() => {
                  qc.invalidateQueries({ queryKey: ["wa-wabas"] });
                  qc.invalidateQueries({ queryKey: ["wa-numeros"] });
                  qc.invalidateQueries({ queryKey: ["wa-onboarding-logs"] });
                }}
              />
            </div>
            <div className="rounded-lg border border-primary/40 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">Conectar WhatsApp Business existente</span>
                <Badge variant="secondary">Recomendado</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Mantém o número no aplicativo WhatsApp Business e conecta à API oficial (Coexistência).
              </p>
              <EmbeddedSignupButton
                mode="coexistence"
                clientId={clientId === NONE ? null : clientId}
                projectId={projectId === NONE ? null : projectId}
                nomeInterno={nomeInterno || undefined}
                onCompleted={() => {
                  qc.invalidateQueries({ queryKey: ["wa-wabas"] });
                  qc.invalidateQueries({ queryKey: ["wa-numeros"] });
                  qc.invalidateQueries({ queryKey: ["wa-onboarding-logs"] });
                }}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Token de acesso nunca sai do backend.</p>

        </div>

        <div className="rounded-xl border bg-card p-6 space-y-3 text-sm">
          <h3 className="font-medium">Fluxo (oficial Meta)</h3>
          <ol className="list-decimal list-inside text-muted-foreground space-y-1">
            <li>Login com Facebook / Facebook Login for Business</li>
            <li>Seleção/criação da Business Manager</li>
            <li>Seleção/criação da WABA</li>
            <li>Adição/verificação do número</li>
            <li>Meta devolve <code>code</code>, <code>waba_id</code>, <code>phone_number_id</code>, <code>business_id</code></li>
            <li>Backend troca <code>code</code> por <code>access_token</code> (v21.0)</li>
            <li>Assina webhooks e salva na base</li>
          </ol>
        </div>
      </div>

      <section className="mt-6 rounded-xl border bg-card">
        <div className="flex items-center justify-between p-4">
          <h3 className="font-medium">Logs de onboarding</h3>
          <span className="text-xs text-muted-foreground">Últimos 200 registros</span>
        </div>
        {logsLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
        ) : logsError ? (
          <div className="p-4"><ErrorCard error={logsError} onRetry={() => refetchLogs()} /></div>
        ) : !logs || logs.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">Nenhum onboarding executado ainda.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Passo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Erro / detalhes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l: any) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="font-mono text-xs">{l.step}</TableCell>
                  <TableCell>
                    <Badge variant={l.status === "ok" ? "default" : "destructive"} className="gap-1">
                      {l.status === "ok" ? <CheckCircle2 className="h-3 w-3" /> : l.status === "error" ? <XCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                      {l.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-lg truncate">
                    {l.error ?? (l.payload ? JSON.stringify(l.payload).slice(0, 200) : "—")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </>
  );
}
