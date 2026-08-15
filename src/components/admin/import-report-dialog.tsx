import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { slugify, isValidSlug } from "@/lib/slugify";
import { Upload } from "lucide-react";
import { normalizeRecords, summarizeRecords } from "@/lib/report-import-normalize";
import {
  findImportedReportByBoost,
  importReportRecordsChunk,
  upsertImportedReport,
} from "@/lib/imported-reports.functions";

type Parsed = { summary: any; records: any[] };

const nf = (n: number) => n.toLocaleString("pt-BR");
const CHUNK = 1000;

export function ImportReportDialog({ onImported }: { onImported?: () => void }) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [dup, setDup] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(true);

  const findFn = useServerFn(findImportedReportByBoost);
  const upsertFn = useServerFn(upsertImportedReport);
  const chunkFn = useServerFn(importReportRecordsChunk);

  const reset = () => { setParsed(null); setDup(null); setBusy(false); setDone(0); setSlug(""); setName(""); setIsPublic(true); if (inputRef.current) inputRef.current.value = ""; };

  const onFile = async (file: File) => {
    try {
      const json = JSON.parse(await file.text());
      const summary = json.summary ?? {};
      const rawRecords: any[] = Array.isArray(json.records) ? json.records : Array.isArray(json) ? json : [];
      if (!rawRecords.length) throw new Error("Nenhum registro encontrado no arquivo.");
      const records = normalizeRecords(rawRecords);
      const stats = summarizeRecords(records);
      const norm = {
        ...summary,
        campaign: summary.campaign ?? file.name.replace(/\.json$/i, ""),
        boostId: summary.boostId ?? records.find((r) => r.boostId)?.boostId ?? null,
        total: summary.total ?? stats.total,
        completed: summary.completed ?? stats.completed,
        errors: summary.errors ?? stats.errors,
        completionRate: summary.completionRate ?? stats.completionRate,
        errorRate: summary.errorRate ?? stats.errorRate,
        firstStartedAt: summary.firstStartedAt ?? stats.firstStartedAt,
        firstSentAt: summary.firstSentAt ?? stats.firstSentAt,
        lastSentAt: summary.lastSentAt ?? stats.lastSentAt,
      };
      setParsed({ summary: norm, records });
      setName(norm.campaign ?? "");
      setSlug(slugify(norm.campaign ?? ""));
      if (norm.boostId) {
        const existing = await findFn({ data: { boostId: norm.boostId } });
        if (existing) setDup({ id: existing.id, name: existing.name });
      }
    } catch (e: any) {
      toast.error("Arquivo inválido", { description: e?.message ?? "Não foi possível ler o JSON." });
      reset();
    }
  };

  const run = async () => {
    if (!parsed) return;
    setBusy(true);
    setDone(0);
    try {
      const { id } = await upsertFn({
        data: {
          summary: parsed.summary,
          replace: !!dup,
          publicSlug: slug ? slug : null,
          isPublic: !!slug && isPublic,
        },
      });
      for (let i = 0; i < parsed.records.length; i += CHUNK) {
        await chunkFn({ data: { reportId: id, records: parsed.records.slice(i, i + CHUNK) } });
        setDone(Math.min(i + CHUNK, parsed.records.length));
      }
      toast.success("Relatório importado com sucesso.", {
        description: `${nf(parsed.records.length)} registros importados.`,
      });
      onImported?.();
      setOpen(false);
      reset();
      navigate({ to: "/admin/relatorios/importados/$id", params: { id } });
    } catch (e: any) {
      toast.error("Falha na importação", { description: e?.message ?? "Tente novamente." });
      setBusy(false);
    }
  };

  const total = parsed?.records.length ?? 0;

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload className="size-4" /> Importar relatório
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!busy) { setOpen(v); if (!v) reset(); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar relatório de disparo</DialogTitle>
            <DialogDescription>Selecione um arquivo .json exportado da plataforma de disparo.</DialogDescription>
          </DialogHeader>

          {!parsed ? (
            <input
              ref={inputRef}
              type="file"
              accept="application/json,.json"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
              className="block w-full cursor-pointer rounded-md border border-dashed p-6 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
            />
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border p-4">
                <div className="font-semibold">{parsed.summary.campaign}</div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <Field label="Total" value={nf(parsed.summary.total)} />
                  <Field label="Concluídos" value={nf(parsed.summary.completed)} />
                  <Field label="Com erro" value={nf(parsed.summary.errors)} />
                  <Field label="Conclusão" value={`${Number(parsed.summary.completionRate).toFixed(2).replace(".", ",")}%`} />
                </div>
              </div>

              {!busy && (
                <div className="space-y-3 rounded-lg border p-4">
                  <div>
                    <Label htmlFor="report-slug">Link público / Slug</Label>
                    <Input
                      id="report-slug"
                      className="mt-1"
                      value={slug}
                      placeholder="magistrar-1408"
                      onChange={(e) => setSlug(slugify(e.target.value))}
                    />
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      {slug
                        ? `${typeof window !== "undefined" ? window.location.origin : ""}/relatorios/${slug}`
                        : "Sem slug o relatório fica apenas no admin."}
                    </p>
                    {!!slug && !isValidSlug(slug) && (
                      <p className="mt-1 text-xs text-destructive">Use apenas letras minúsculas, números e hífens.</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="report-public" className="font-normal">Relatório público</Label>
                    <Switch id="report-public" checked={isPublic && !!slug} disabled={!slug} onCheckedChange={setIsPublic} />
                  </div>
                </div>
              )}

              {dup && !busy && (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  Já existe um relatório deste disparo (<strong>{dup.name}</strong>). Deseja atualizar os dados existentes?
                </p>
              )}

              {busy && (
                <div className="space-y-2">
                  <Progress value={total ? (done / total) * 100 : 0} />
                  <p className="text-sm text-muted-foreground">
                    {done >= total && total > 0
                      ? `${nf(total)} de ${nf(total)} registros importados`
                      : `Importando registros… ${nf(done)} de ${nf(total)}`}
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => { setOpen(false); reset(); }}>Cancelar</Button>
            <Button disabled={!parsed || busy || (!!slug && !isValidSlug(slug))} onClick={run}>
              {busy ? "Importando…" : dup ? "Atualizar relatório" : "Confirmar importação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  );
}
