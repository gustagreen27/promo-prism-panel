import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildImportSummary, type ImportSummary, type NormalizedRow } from "@/lib/phone-normalize";
import { CheckCircle2, AlertTriangle, Copy, UserX, Wand2, Loader2 } from "lucide-react";

export type ParsedSheet = { headers: string[]; rows: string[][]; fileName: string };

const IGNORE = "__ignore__";

export async function parseContactFile(file: File): Promise<ParsedSheet> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "xlsx" || ext === "xls") {
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const matrix: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, raw: false, defval: "" });
    const [head = [], ...rest] = matrix;
    return {
      fileName: file.name,
      headers: head.map((h: any, i: number) => String(h ?? "").trim() || `Coluna ${i + 1}`),
      rows: rest.map((r) => (head as any[]).map((_, i) => String(r?.[i] ?? "").trim())),
    };
  }

  const Papa = (await import("papaparse")).default;
  const text = await file.text();
  const res = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });
  const matrix = (res.data as string[][]).filter((r) => r.some((c) => String(c ?? "").trim()));
  const [head = [], ...rest] = matrix;
  return {
    fileName: file.name,
    headers: head.map((h, i) => String(h ?? "").trim() || `Coluna ${i + 1}`),
    rows: rest.map((r) => head.map((_, i) => String(r?.[i] ?? "").trim())),
  };
}

function guessColumn(headers: string[], kind: "phone" | "name", sample: string[][]): string {
  const phoneRe = /(tel|fone|phone|whats|celular|numero|número|msisdn|contato)/i;
  const nameRe = /(nome|name|cliente|lead|contato)/i;
  const re = kind === "phone" ? phoneRe : nameRe;
  const byHeader = headers.findIndex((h) => re.test(h));
  if (byHeader >= 0) return String(byHeader);
  if (kind === "phone") {
    // coluna com mais dígitos
    let best = -1, bestScore = 0;
    headers.forEach((_, i) => {
      const score = sample.slice(0, 20).filter((r) => (r[i] || "").replace(/\D/g, "").length >= 10).length;
      if (score > bestScore) { bestScore = score; best = i; }
    });
    if (best >= 0) return String(best);
  }
  return IGNORE;
}

export function ContactImportDialog({
  sheet,
  open,
  onOpenChange,
  onConfirm,
}: {
  sheet: ParsedSheet | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (rows: NormalizedRow[], summary: ImportSummary) => void;
}) {
  const [phoneCol, setPhoneCol] = useState<string>(IGNORE);
  const [nameCol, setNameCol] = useState<string>(IGNORE);
  const [hasHeader, setHasHeader] = useState(true);

  useEffect(() => {
    if (!sheet) return;
    const looksLikeHeader = sheet.headers.some((h) => /[a-zA-Z]/.test(h) && h.replace(/\D/g, "").length < 8);
    setHasHeader(looksLikeHeader);
    setPhoneCol(guessColumn(sheet.headers, "phone", sheet.rows));
    setNameCol(guessColumn(sheet.headers, "name", sheet.rows));
  }, [sheet]);

  const dataRows = useMemo(() => {
    if (!sheet) return [];
    return hasHeader ? sheet.rows : [sheet.headers, ...sheet.rows];
  }, [sheet, hasHeader]);

  const summary = useMemo<ImportSummary | null>(() => {
    if (!sheet || phoneCol === IGNORE) return null;
    const pi = Number(phoneCol);
    const ni = nameCol === IGNORE ? -1 : Number(nameCol);
    return buildImportSummary(dataRows.map((r) => ({ phone: r[pi] ?? "", name: ni >= 0 ? r[ni] : undefined })));
  }, [sheet, dataRows, phoneCol, nameCol]);

  if (!sheet) return null;

  const colOptions = sheet.headers.map((h, i) => ({
    value: String(i),
    label: hasHeader ? h : `Coluna ${i + 1}`,
    sample: dataRows[0]?.[i] ?? "",
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mapear colunas · {sheet.fileName}</DialogTitle>
          <DialogDescription>
            Indique qual coluna contém o nome e qual contém o número. Os números serão padronizados para 55DDDNÚMERO.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
            A primeira linha é cabeçalho
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Coluna do número (WhatsApp)</Label>
              <Select value={phoneCol} onValueChange={setPhoneCol}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={IGNORE}>— Não usar —</SelectItem>
                  {colOptions.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}{c.sample ? ` · ex: ${c.sample.slice(0, 18)}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Coluna do nome</Label>
              <Select value={nameCol} onValueChange={setNameCol}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={IGNORE}>— Ignorar —</SelectItem>
                  {colOptions.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}{c.sample ? ` · ex: ${c.sample.slice(0, 18)}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-xl border">
            <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">Prévia das primeiras linhas</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>{colOptions.map((c) => {
                    const role = c.value === phoneCol ? "Número" : c.value === nameCol ? "Nome" : "Ignorada";
                    return (
                      <th key={c.value} className="px-3 py-2 text-left font-medium">
                        <span className="block">{c.label}</span>
                        <span className={`text-[10px] ${role === "Ignorada" ? "text-muted-foreground" : "text-primary"}`}>{role}</span>
                      </th>
                    );
                  })}</tr>
                </thead>
                <tbody>
                  {dataRows.slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-t">
                      {colOptions.map((c) => <td key={c.value} className="px-3 py-1.5">{r[Number(c.value)]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {summary && (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <Stat icon={CheckCircle2} tone="ok" label="Válidos" value={summary.valid} />
                <Stat icon={Wand2} tone="warn" label="Corrigidos" value={summary.fixed} />
                <Stat icon={AlertTriangle} tone="bad" label="Inválidos" value={summary.invalid} />
                <Stat icon={Copy} tone="warn" label="Duplicados" value={summary.duplicates} />
                <Stat icon={UserX} tone="warn" label="Sem nome" value={summary.missingName} />
                <Stat icon={UserX} tone="bad" label="Sem número" value={summary.missingPhone} />
              </div>
              <p className="text-xs text-muted-foreground">
                {summary.total.toLocaleString("pt-BR")} registros lidos · {summary.valid.toLocaleString("pt-BR")} contatos prontos no padrão 5562991301856.
              </p>
              {summary.rows.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Exemplos normalizados: {summary.rows.slice(0, 3).map((r) => r.phone).join(", ")}
                </p>
              )}
              {summary.invalidSamples.length > 0 && (
                <p className="text-xs text-destructive">
                  Descartados: {summary.invalidSamples.map((s) => `${s.raw} (${s.reason})`).join(" · ")}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            type="button"
            disabled={!summary || summary.valid === 0}
            onClick={() => summary && onConfirm(summary.rows, summary)}
          >
            {!summary ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Concluir importação{summary ? ` (${summary.valid.toLocaleString("pt-BR")})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number; tone: "ok" | "warn" | "bad" }) {
  const cls = tone === "ok" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "text-destructive";
  return (
    <div className="rounded-xl border p-3">
      <div className={`flex items-center gap-1.5 text-xs ${cls}`}><Icon className="h-3.5 w-3.5" />{label}</div>
      <div className="mt-1 text-lg font-semibold">{value.toLocaleString("pt-BR")}</div>
    </div>
  );
}
