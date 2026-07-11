import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Users, Pencil, Search, X, Trash2, Check, FileSpreadsheet, Loader2 } from "lucide-react";
import { listWorkspaceLists, previewWorkspaceList, createWorkspaceListWithPhones } from "@/lib/wa-wizard-lists.functions";
import { cn } from "@/lib/utils";

type SavedList = { id: string; name: string; count: number };
type ParsedRow = { phone: string; name?: string | null };

export function ContactPicker({
  workspaceId,
  value,
  onChange,
}: {
  workspaceId: string;
  value: { list_id: string | null; list_name?: string; total?: number; valid?: number } | null;
  onChange: (v: { list_id: string; list_name: string; total: number; valid: number }) => void;
}) {
  const fnLists = useServerFn(listWorkspaceLists);
  const fnPreview = useServerFn(previewWorkspaceList);
  const fnCreate = useServerFn(createWorkspaceListWithPhones);

  const [tab, setTab] = useState<"saved" | "import" | "manual">("saved");
  const [savedLists, setSavedLists] = useState<SavedList[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fnLists({ data: { workspace_id: workspaceId } })
      .then((r) => { if (alive) setSavedLists(r.lists); })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar listas"))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [workspaceId, fnLists]);

  const filtered = useMemo(
    () => savedLists.filter((l) => l.name.toLowerCase().includes(search.toLowerCase())),
    [savedLists, search]
  );

  async function pickSaved(list: SavedList) {
    try {
      const p = await fnPreview({ data: { workspace_id: workspaceId, list_id: list.id } });
      onChange({ list_id: list.id, list_name: list.name, total: p.total, valid: p.valid });
      toast.success(`Lista "${list.name}" selecionada · ${p.valid} contatos válidos`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar lista");
    }
  }

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="saved"><Users className="mr-1.5 h-4 w-4" /> Lista salva</TabsTrigger>
        <TabsTrigger value="import"><Upload className="mr-1.5 h-4 w-4" /> Importar arquivo</TabsTrigger>
        <TabsTrigger value="manual"><Pencil className="mr-1.5 h-4 w-4" /> Manual</TabsTrigger>
      </TabsList>

      {/* SAVED */}
      <TabsContent value="saved" className="mt-4 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nome da lista"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="max-h-[380px] space-y-1.5 overflow-auto rounded-lg border p-1">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando listas...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma lista {search ? "encontrada" : "cadastrada"}. Crie uma pela aba <b>Importar</b> ou <b>Manual</b>.
            </div>
          ) : (
            filtered.map((l) => {
              const selected = value?.list_id === l.id;
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => pickSaved(l)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md border p-3 text-left text-sm transition-colors hover:bg-muted/50",
                    selected && "border-primary bg-primary/5"
                  )}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{l.name}</div>
                    <div className="text-xs text-muted-foreground">{l.count} contatos</div>
                  </div>
                  {selected && <Check className="h-4 w-4 text-primary" />}
                </button>
              );
            })
          )}
        </div>
      </TabsContent>

      {/* IMPORT */}
      <TabsContent value="import" className="mt-4">
        <ImportPanel
          workspaceId={workspaceId}
          onCreated={async (r) => {
            const p = await fnPreview({ data: { workspace_id: workspaceId, list_id: r.list_id } });
            onChange({ list_id: r.list_id, list_name: r.list_name, total: p.total, valid: p.valid });
            // recarrega lista
            fnLists({ data: { workspace_id: workspaceId } }).then((res) => setSavedLists(res.lists)).catch(() => {});
            setTab("saved");
          }}
          createFn={fnCreate}
        />
      </TabsContent>

      {/* MANUAL */}
      <TabsContent value="manual" className="mt-4">
        <ManualPanel
          workspaceId={workspaceId}
          onCreated={async (r) => {
            const p = await fnPreview({ data: { workspace_id: workspaceId, list_id: r.list_id } });
            onChange({ list_id: r.list_id, list_name: r.list_name, total: p.total, valid: p.valid });
            fnLists({ data: { workspace_id: workspaceId } }).then((res) => setSavedLists(res.lists)).catch(() => {});
            setTab("saved");
          }}
          createFn={fnCreate}
        />
      </TabsContent>

      {/* Seleção atual */}
      {value?.list_id && (
        <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Lista selecionada</div>
              <div className="font-medium">{value.list_name}</div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{value.valid ?? 0} válidos</Badge>
              {typeof value.total === "number" && value.total !== value.valid && (
                <Badge variant="outline">{value.total} total</Badge>
              )}
            </div>
          </div>
        </div>
      )}
    </Tabs>
  );
}

// -------------------- Import panel --------------------
function ImportPanel({
  workspaceId,
  createFn,
  onCreated,
}: {
  workspaceId: string;
  createFn: ReturnType<typeof useServerFn<typeof createWorkspaceListWithPhones>>;
  onCreated: (r: { list_id: string; list_name: string }) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapPhone, setMapPhone] = useState<string>("");
  const [mapName, setMapName] = useState<string>("");
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [listName, setListName] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function guessColumn(cols: string[], hints: string[]): string {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const h of hints) {
      const found = cols.find((c) => norm(c).includes(h));
      if (found) return found;
    }
    return "";
  }

  async function handleFile(f: File) {
    setFile(f);
    setListName(f.name.replace(/\.(csv|xlsx?|tsv)$/i, "").slice(0, 120));
    const ext = f.name.split(".").pop()?.toLowerCase();
    try {
      if (ext === "xlsx" || ext === "xls") {
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const parsed = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "", raw: false });
        onParsed(parsed.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? "")]))));
      } else {
        const text = await f.text();
        const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
        onParsed((parsed.data ?? []).filter(Boolean));
      }
    } catch (e) {
      toast.error("Não foi possível ler o arquivo. Verifique o formato.");
    }
  }

  function onParsed(data: Record<string, string>[]) {
    if (!data.length) {
      toast.error("Arquivo vazio");
      return;
    }
    const cols = Object.keys(data[0]);
    setRawRows(data);
    setColumns(cols);
    setMapPhone(guessColumn(cols, ["telefone", "celular", "whatsapp", "phone", "numero", "fone"]));
    setMapName(guessColumn(cols, ["nome", "name", "cliente", "contato"]));
  }

  const previewRows = useMemo(() => {
    if (!mapPhone) return [];
    return rawRows.slice(0, 500).map((r) => ({
      phone: (r[mapPhone] ?? "").trim(),
      name: mapName ? (r[mapName] ?? "").trim() : null,
    })).filter((r) => r.phone);
  }, [rawRows, mapPhone, mapName]);

  useEffect(() => { setRows(previewRows); }, [previewRows]);

  async function save() {
    if (!listName.trim()) return toast.error("Dê um nome para a lista");
    if (!rows.length) return toast.error("Nenhum contato válido para importar");
    setSaving(true);
    try {
      const rowsToSend = rawRows
        .map((r) => ({ phone: (r[mapPhone] ?? "").trim(), name: mapName ? (r[mapName] ?? "").trim() || null : null }))
        .filter((r) => r.phone);
      const res = await createFn({
        data: { workspace_id: workspaceId, name: listName.trim(), rows: rowsToSend, source: "wizard-import" },
      });
      toast.success(`Lista criada · ${res.added} contatos importados${res.invalid ? ` · ${res.invalid} inválidos` : ""}`);
      onCreated({ list_id: res.list_id, list_name: res.list_name });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar lista");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {!file ? (
        <div
          className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
        >
          <FileSpreadsheet className="mb-2 h-10 w-10 text-muted-foreground" />
          <div className="mb-1 text-sm font-medium">Arraste um arquivo CSV ou XLSX aqui</div>
          <div className="mb-3 text-xs text-muted-foreground">ou selecione manualmente</div>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.xlsx,.xls,.tsv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
            Selecionar arquivo
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-md border bg-muted/40 p-2 text-sm">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{file.name}</span>
              <span className="text-xs text-muted-foreground">· {rawRows.length} linhas</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setFile(null); setRawRows([]); setColumns([]); setRows([]); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Coluna do telefone *</Label>
              <select className="w-full rounded border px-2 py-1.5 text-sm" value={mapPhone} onChange={(e) => setMapPhone(e.target.value)}>
                <option value="">— Selecione —</option>
                {columns.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Coluna do nome (opcional)</Label>
              <select className="w-full rounded border px-2 py-1.5 text-sm" value={mapName} onChange={(e) => setMapName(e.target.value)}>
                <option value="">— Nenhuma —</option>
                {columns.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {rows.length > 0 && (
            <div className="rounded-md border">
              <div className="border-b bg-muted/30 px-3 py-1.5 text-xs font-medium">
                {rawRows.length > 500
                  ? `Prévia · exibindo 500 de ${rawRows.length.toLocaleString("pt-BR")} linhas (todas serão importadas ao salvar)`
                  : `Prévia · ${rows.length} contato(s) válido(s)${rawRows.length !== rows.length ? ` · ${rawRows.length - rows.length} sem telefone ignorado(s)` : ""}`}
              </div>
              <div className="max-h-48 overflow-auto text-xs">
                <table className="w-full">
                  <thead className="sticky top-0 bg-background">
                    <tr className="border-b text-left">
                      <th className="p-2 font-medium">Telefone</th>
                      <th className="p-2 font-medium">Nome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 30).map((r, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="p-2 font-mono">{r.phone}</td>
                        <td className="p-2 text-muted-foreground">{r.name || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs">Nome da lista</Label>
            <Input value={listName} onChange={(e) => setListName(e.target.value)} maxLength={120} />
          </div>

          <Button onClick={save} disabled={saving || !rows.length || !listName.trim()} className="w-full">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            Criar lista e usar nesta campanha
          </Button>
        </>
      )}
    </div>
  );
}

// -------------------- Manual panel --------------------
function ManualPanel({
  workspaceId,
  createFn,
  onCreated,
}: {
  workspaceId: string;
  createFn: ReturnType<typeof useServerFn<typeof createWorkspaceListWithPhones>>;
  onCreated: (r: { list_id: string; list_name: string }) => void;
}) {
  const [text, setText] = useState("");
  const [listName, setListName] = useState("Lista manual");
  const [saving, setSaving] = useState(false);

  const parsed = useMemo(() => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return lines.map((line) => {
      // Aceita "telefone;nome", "telefone,nome" ou só telefone
      const parts = line.split(/[;,\t]/).map((p) => p.trim());
      return { phone: parts[0] ?? "", name: parts[1] ?? null };
    }).filter((r) => r.phone);
  }, [text]);

  async function save() {
    if (!listName.trim()) return toast.error("Dê um nome para a lista");
    if (!parsed.length) return toast.error("Cole ao menos um telefone");
    setSaving(true);
    try {
      const res = await createFn({
        data: { workspace_id: workspaceId, name: listName.trim(), rows: parsed, source: "wizard-manual" },
      });
      toast.success(`Lista criada · ${res.added} contatos`);
      onCreated({ list_id: res.list_id, list_name: res.list_name });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar lista");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Cole os telefones (um por linha)</Label>
        <Textarea
          rows={8}
          placeholder={"11987654321\n11912345678;João\n(21) 99999-8888;Maria"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="font-mono text-xs"
        />
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>{parsed.length} contatos detectados</span>
          {text && (
            <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setText("")}>
              <Trash2 className="h-3 w-3" /> limpar
            </button>
          )}
        </div>
      </div>
      <div>
        <Label className="text-xs">Nome da lista</Label>
        <Input value={listName} onChange={(e) => setListName(e.target.value)} maxLength={120} />
      </div>
      <Button onClick={save} disabled={saving || !parsed.length || !listName.trim()} className="w-full">
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
        Criar lista e usar nesta campanha
      </Button>
    </div>
  );
}
