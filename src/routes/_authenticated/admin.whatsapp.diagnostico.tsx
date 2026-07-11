import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw, Shield, Key, Phone } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { runWhatsAppDiagnostics } from "@/lib/wa-diagnosis.functions";

export const Route = createFileRoute("/_authenticated/admin/whatsapp/diagnostico")({
  head: () => ({ meta: [{ title: "Diagnóstico do WhatsApp" }] }),
  component: DiagPage,
});

function DiagPage() {
  const fn = useServerFn(runWhatsAppDiagnostics);
  const q = useQuery({
    queryKey: ["wa-diagnostics"],
    queryFn: () => fn({ data: {} }),
  });

  const data = q.data as any;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Diagnóstico do WhatsApp"
        description="Verifica o token global, as conexões e os IDs de negócio (phone_number_id / waba_id)."
        actions={
          <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} />
            Reexecutar
          </Button>
        }
      />

      {q.isLoading ? (
        <Card><CardContent className="p-8 text-sm text-muted-foreground">Executando checagens…</CardContent></Card>
      ) : q.error ? (
        <Card><CardContent className="p-6 text-sm text-red-600">Erro: {String((q.error as any)?.message ?? q.error)}</CardContent></Card>
      ) : !data ? null : (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Key className="h-5 w-5" /> Token global (WHATSAPP_ACCESS_TOKEN)
                  </CardTitle>
                  <CardDescription>Usado quando a conexão não tem token próprio configurado.</CardDescription>
                </div>
                <StatusBadge ok={data.global.configured && data.global.valid} label={data.global.configured ? (data.global.valid ? "Válido" : "Inválido") : "Não configurado"} />
              </div>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div><span className="text-muted-foreground">Configurado: </span>{data.global.configured ? "sim" : "não"}</div>
              {data.global.configured && (
                <>
                  <div><span className="text-muted-foreground">Últimos 6 caracteres: </span><code>…{data.global.last6}</code></div>
                  <div><span className="text-muted-foreground">Tamanho: </span>{data.global.length} chars</div>
                </>
              )}
              {data.global.error && (
                <div className="mt-2 rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-2 text-red-700 dark:text-red-300">
                  <AlertTriangle className="inline h-3.5 w-3.5 mr-1" />{data.global.error}
                </div>
              )}
              {!data.global.configured && (
                <div className="mt-2 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-2 text-amber-800 dark:text-amber-300">
                  Cadastre o secret <code>WHATSAPP_ACCESS_TOKEN</code> nas configurações do projeto para permitir fallback global de token.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" /> Conexões ({data.connections.length})
              </CardTitle>
              <CardDescription>Cada número precisa de <code>phone_number_id</code>, <code>waba_id</code> e um token que valide na Graph API.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.connections.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nenhuma conexão cadastrada.</div>
              ) : data.connections.map((c: any) => (
                <div key={c.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{c.nome ?? c.phone ?? c.id}</div>
                      <div className="text-xs text-muted-foreground truncate">{c.phone ?? "—"} · status: {c.status ?? "—"}</div>
                    </div>
                    <StatusBadge ok={c.ok} label={c.ok ? "OK" : `${c.problems.length} problema(s)`} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    <Field label="phone_number_id" value={c.phone_number_id} ok={!!c.phone_number_id} />
                    <Field label="waba_id" value={c.waba_id} ok={!!c.waba_id} />
                    <Field label="Token" value={c.token_source} ok={c.token_source !== "faltando"} />
                    <Field label="Token válido na Graph" value={c.token_valid == null ? "—" : c.token_valid ? "sim" : "não"} ok={c.token_valid === true} />
                  </div>

                  {c.token_error && (
                    <div className="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-2 text-xs text-red-700 dark:text-red-300">
                      <AlertTriangle className="inline h-3 w-3 mr-1" />{c.token_error}
                    </div>
                  )}
                  {c.problems.length > 0 && (
                    <ul className="text-xs text-red-600 dark:text-red-400 list-disc pl-5 space-y-0.5">
                      {c.problems.map((p: string, i: number) => <li key={i}>{p}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {!data.is_admin && (
            <div className="text-xs text-muted-foreground flex items-center gap-1"><Shield className="h-3 w-3" />Você está vendo apenas as conexões do seu workspace.</div>
          )}
        </>
      )}
    </div>
  );
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge variant="secondary" className={ok
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
      : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"}>
      {ok ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <XCircle className="mr-1 h-3 w-3" />}
      {label}
    </Badge>
  );
}

function Field({ label, value, ok }: { label: string; value: any; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded border bg-muted/30 px-2 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono truncate ${ok ? "" : "text-red-600 dark:text-red-400"}`}>{value ?? "—"}</span>
    </div>
  );
}
