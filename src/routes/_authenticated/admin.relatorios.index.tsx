import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, FileText, BarChart3, Copy, ExternalLink, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { publicReportUrl } from "@/lib/slugify";
import { computeTotals, fmtBRL, fmtNum, formatBRDate, type Campaign } from "@/lib/report-utils";
import { PageHeader } from "@/components/admin/page-header";
import { RELATORIOS_TABS } from "@/components/admin/hub-tabs";
import { ImportReportDialog } from "@/components/admin/import-report-dialog";
import { listImportedReports, deleteImportedReport, renameImportedReport } from "@/lib/imported-reports.functions";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil } from "lucide-react";


type ReportRow = {
  id: string;
  client_name: string;
  report_date: string;
  reference: string | null;
  project: string | null;
  campaigns: Campaign[];
  created_at: string;
};

export const Route = createFileRoute("/_authenticated/admin/relatorios/")({
  head: () => ({ meta: [{ title: "Relatórios — Painel" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("id, client_name, report_date, reference, project, final_value, campaigns, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as ReportRow[];
    },
  });

  const importedFn = useServerFn(listImportedReports);
  const imported = useQuery({ queryKey: ["imported-reports"], queryFn: () => importedFn() });
  const deleteImportedFn = useServerFn(deleteImportedReport);
  const renameImportedFn = useServerFn(renameImportedReport);

  const renameImported = async (id: string, name: string) => {
    await renameImportedFn({ data: { id, name } });
    await imported.refetch();
    toast.success("Nome atualizado.");
  };

  const removeImported = async (id: string) => {
    await deleteImportedFn({ data: { id } });
    await imported.refetch();
  };

  const removeReport = async (id: string) => {
    const { error } = await supabase.from("reports").delete().eq("id", id);
    if (error) throw new Error(error.message);
    await refetch();
  };

  return (
    <>
      <PageHeader
        title="Relatórios de fechamento"
        description="Histórico completo de disparos por cliente."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/admin/relatorios/analytics"><BarChart3 className="size-4" /> Analytics</Link>
            </Button>
            <ImportReportDialog onImported={() => imported.refetch()} />
            <Button asChild>
              <Link to="/admin/relatorios/new"><Plus className="size-4" /> Novo relatório</Link>
            </Button>
          </>
        }
      />

      {!!imported.data?.length && (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Relatórios de disparo importados</h2>
          <div className="grid gap-3">
            {imported.data.map((r: any) => (
              <Link key={r.id} to="/admin/relatorios/importados/$id" params={{ id: r.id }} className="block">
                <Card className="p-4 transition-colors hover:border-primary/40">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="text-lg font-semibold">{r.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Importado em {new Date(r.created_at).toLocaleDateString("pt-BR")}
                        {r.boost_id ? ` · Boost ${String(r.boost_id).slice(0, 8)}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      <Stat label="Total" value={fmtNum(r.total ?? 0)} />
                      <Stat label="Concluídos" value={fmtNum(r.completed ?? 0)} />
                      <Stat label="Com erro" value={fmtNum(r.errors ?? 0)} />
                      <div className="flex gap-1">
                        {r.is_public && r.public_slug && (
                          <>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Copiar link público"
                            onClick={(e) => {
                              e.preventDefault();
                              navigator.clipboard.writeText(publicReportUrl(r.public_slug));
                              toast.success("Link copiado.");
                            }}
                          >
                            <Copy className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Abrir relatório público"
                            onClick={(e) => {
                              e.preventDefault();
                              window.open(publicReportUrl(r.public_slug), "_blank", "noopener");
                            }}
                          >
                            <ExternalLink className="size-4" />
                          </Button>
                          </>
                        )}
                        <RenameReportButton
                          currentName={r.name}
                          onConfirm={(name: string) => renameImported(r.id, name)}
                        />
                        <DeleteReportButton
                          title="Excluir relatório importado"
                          description={`O relatório "${r.name}" e todos os seus registros serão removidos permanentemente. Esta ação não pode ser desfeita.`}
                          onConfirm={() => removeImported(r.id)}
                        />
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}



      {error ? (
        <Card className="p-6 border-destructive/30 bg-destructive/5 text-sm">
          <p className="font-semibold text-destructive">Não foi possível carregar os relatórios.</p>
          <p className="text-xs text-muted-foreground mt-1">{error instanceof Error ? error.message : "Erro desconhecido"}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => refetch()}>Tentar novamente</Button>
        </Card>
      ) : isLoading ? (
        <div className="text-muted-foreground">Carregando…</div>
      ) : !data?.length ? (
        <Card className="p-12 text-center">
          <FileText className="size-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">Nenhum relatório ainda</p>
          <p className="text-sm text-muted-foreground mb-4">Crie seu primeiro relatório de disparos.</p>
          <Button asChild><Link to="/admin/relatorios/new">Criar relatório</Link></Button>
        </Card>
      ) : (
        <div className="grid gap-3">
          {data.map((r) => {
            const t = computeTotals(r.campaigns ?? []);
            return (
              <Link
                key={r.id}
                to="/admin/relatorios/$id"
                params={{ id: r.id }}
                className="block"
              >
                <Card className="p-4 hover:border-primary/40 transition-colors">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-lg">{r.client_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatBRDate(r.report_date)}
                        {r.reference ? ` · Ref: ${r.reference}` : ""}
                        {r.project ? ` · ${r.project}` : ""}
                      </div>
                    </div>
                    <div className="flex gap-6 text-sm">
                      <Stat label="Entregues" value={fmtNum(t.delivered)} />
                      <Stat label="Falhou" value={fmtNum(t.failed)} />
                      <Stat label="Líquido" value={fmtBRL(t.net)} highlight />
                      <DeleteReportButton
                        title="Excluir relatório"
                        description={`O relatório de ${r.client_name} será removido permanentemente. Esta ação não pode ser desfeita.`}
                        onConfirm={() => removeReport(r.id)}
                      />
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

function DeleteReportButton({
  title, description, onConfirm,
}: { title: string; description: string; onConfirm: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        title="Excluir relatório"
        className="text-destructive hover:text-destructive"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
      >
        <Trash2 className="size-4" />
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent onClick={(e) => e.preventDefault()}>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await onConfirm();
                  toast.success("Relatório excluído.");
                  setOpen(false);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Falha ao excluir.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={highlight ? "font-bold text-report-blue" : "font-medium"}>{value}</div>
    </div>
  );
}

function RenameReportButton({
  currentName,
  onConfirm,
}: {
  currentName: string;
  onConfirm: (name: string) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        title="Renomear relatório"
        onClick={(e) => {
          e.preventDefault();
          setName(currentName);
          setOpen(true);
        }}
      >
        <Pencil className="size-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onClick={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Renomear relatório</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="report-name">Nome do relatório</Label>
            <Input id="report-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              disabled={saving || !name.trim()}
              onClick={async () => {
                setSaving(true);
                try {
                  await onConfirm(name.trim());
                  setOpen(false);
                } catch (err: any) {
                  toast.error(err?.message ?? "Falha ao renomear.");
                } finally {
                  setSaving(false);
                }
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
