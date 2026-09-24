import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { normalizeBrPhone } from "@/lib/contacts.functions";
import { createList, importPhonesToList } from "@/lib/contact-lists.functions";

/** Extrai um número por linha (CSV: primeira coluna com dígitos). */
function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => {
      const cols = l.split(/[;,\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
      return cols.find((c) => /\d{6,}/.test(c.replace(/\D/g, ""))) ?? cols[0] ?? "";
    })
    .map((s) => s.trim())
    .filter(Boolean);
}

export function analyzePhones(lines: string[]) {
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  let duplicates = 0;
  for (const raw of lines) {
    const p = normalizeBrPhone(raw);
    if (!p) { invalid.push(raw); continue; }
    if (seen.has(p)) { duplicates++; continue; }
    seen.add(p);
    valid.push(p);
  }
  return { total: lines.length, valid, invalid, duplicates };
}

export function NewContactListDialog({ open, onOpenChange, onCreated }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (list: { id: string; name: string }) => void;
}) {
  const createFn = useServerFn(createList);
  const importFn = useServerFn(importPhonesToList);
  const [name, setName] = useState("");
  const [pasted, setPasted] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const stats = useMemo(() => analyzePhones(splitLines(pasted)), [pasted]);
  const canSave = name.trim().length > 0 && stats.valid.length > 0 && !saving;

  async function onFile(f: File) {
    if (!/\.(csv|txt)$/i.test(f.name)) return toast.error("Use um arquivo CSV ou TXT.");
    if (f.size > 10 * 1024 * 1024) return toast.error("Arquivo acima de 10MB.");
    const txt = await f.text();
    setPasted((prev) => (prev.trim() ? prev.trimEnd() + "\n" : "") + splitLines(txt).join("\n"));
    setFileName(f.name);
  }

  function reset() { setName(""); setPasted(""); setFileName(null); }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const list: any = await createFn({ data: { name: name.trim() } });
      const r: any = await importFn({ data: {
        list_id: list.id, source: "direct-send", filename: fileName ?? `direct-send:${name.trim()}`,
        rows: stats.valid.map((phone) => ({ phone })),
      } });
      toast.success(`Lista criada com ${r.normalized ?? stats.valid.length} contatos`);
      onCreated({ id: list.id, name: list.name });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao criar a lista");
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Criar nova lista</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label htmlFor="nl-name">Nome da lista</Label><Input id="nl-name" maxLength={160} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div>
            <Label htmlFor="nl-phones">Números (um por linha, com ou sem +55)</Label>
            <Textarea id="nl-phones" rows={7} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={"62999999999\n+55 11 98888-7777"} />
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed p-3 text-sm">
            <Upload className="h-4 w-4" />{fileName ? `Arquivo: ${fileName}` : "Enviar arquivo CSV/TXT"}
            <input type="file" className="hidden" accept=".csv,.txt,text/csv,text/plain"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
          </label>
          <div className="grid grid-cols-4 gap-2 text-center text-xs" data-testid="nl-stats">
            <div className="rounded-md border p-2"><div className="text-lg font-semibold">{stats.total}</div>Importados</div>
            <div className="rounded-md border p-2"><div className="text-lg font-semibold text-primary">{stats.valid.length}</div>Válidos</div>
            <div className="rounded-md border p-2"><div className="text-lg font-semibold text-destructive">{stats.invalid.length}</div>Inválidos</div>
            <div className="rounded-md border p-2"><div className="text-lg font-semibold">{stats.duplicates}</div>Duplicados</div>
          </div>
          {stats.invalid.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs">
              <div className="mb-1 font-medium text-destructive">Números inválidos — corrija na caixa acima:</div>
              <ul className="max-h-24 overflow-auto">{stats.invalid.slice(0, 100).map((n, i) => <li key={i}>{n}</li>)}</ul>
            </div>
          )}
          {stats.total > 0 && stats.valid.length === 0 && <p className="text-xs text-destructive">Nenhum número válido: a lista não pode ser salva.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!canSave} onClick={save}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar lista</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
