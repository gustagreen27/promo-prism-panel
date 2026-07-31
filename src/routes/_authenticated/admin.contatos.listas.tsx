import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, ListPlus, Search, Upload, ClipboardPaste, Users, RefreshCw, Download } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { CLIENTES_TABS, HubTabs } from "@/components/admin/hub-tabs";
import { EmptyState } from "@/components/admin/empty-state";
import { ErrorCard } from "@/components/admin/query-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listLists, createList, deleteList, addContactsToList, listItems, importPhonesToList, resyncList } from "@/lib/contact-lists.functions";
import { listContacts } from "@/lib/contacts.functions";
import { listClients } from "@/lib/clients.functions";

export const Route = createFileRoute("/_authenticated/admin/contatos/listas")({
  head: () => ({ meta: [{ title: "Listas de Contatos" }] }),
  component: Page,
});

function Page() {
  const listFn = useServerFn(listLists);
  const create = useServerFn(createList);
  const remove = useServerFn(deleteList);
  const add = useServerFn(addContactsToList);
  const importFn = useServerFn(importPhonesToList);
  const itemsFn = useServerFn(listItems);
  const contactsFn = useServerFn(listContacts);
  const clientsFn = useServerFn(listClients);
  const resync = useServerFn(resyncList);
  const qc = useQueryClient();
  const listsQuery = useQuery({ queryKey: ["lists"], queryFn: () => listFn() });
  const { data: lists = [] } = listsQuery;
  const contactsQuery = useQuery({ queryKey: ["contacts", ""], queryFn: () => contactsFn({ data: { limit: 200 } }) });
  const { data: contacts = [] } = contactsQuery;
  const clientsQuery = useQuery({ queryKey: ["clients"], queryFn: () => clientsFn() });
  const { data: clients = [] } = clientsQuery;
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState<string | null>(null);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<any | null>(null);
  const membersQuery = useQuery({ enabled: !!selectedListId, queryKey: ["list-items", selectedListId], queryFn: () => itemsFn({ data: { list_id: selectedListId! } }) });
  const { data: members = [] } = membersQuery;

  const refresh = () => { qc.invalidateQueries({ queryKey: ["lists"] }); qc.invalidateQueries({ queryKey: ["list-items"] }); };
  const save = useMutation({ mutationFn: (p: any) => create({ data: p }), onSuccess: () => { toast.success("Lista criada"); setOpen(false); refresh(); } });
  const del = useMutation({ mutationFn: (id: string) => remove({ data: { id } }), onSuccess: () => { toast.success("Removida"); refresh(); setSelectedListId(null); } });
  const addMut = useMutation({
    mutationFn: (p: any) => add({ data: p }),
    onSuccess: (r: any) => { toast.success(`${r.added} contatos adicionados`); setAddOpen(null); refresh(); },
  });
  const importMut = useMutation({
    mutationFn: (p: any) => importFn({ data: p }),
    onSuccess: (r: any) => {
      setAddOpen(null);
      setImportResult(r);
      refresh();
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["import-jobs"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao importar"),
  });
  const resyncMut = useMutation({
    mutationFn: (id: string) => resync({ data: { list_id: id } }),
    onSuccess: (r: any) => {
      toast.success(`Lista sincronizada · ${r.linked_now} contatos${r.removed_orphans ? ` · ${r.removed_orphans} links órfãos removidos` : ""}`);
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao sincronizar"),
  });

  return (
    <>
      <PageHeader
        title="Listas de contatos"
        description="Agrupamentos usados nos disparos. Cada campanha escolhe uma lista aqui."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Nova lista</Button></DialogTrigger>
            <ListDialog clients={clients} onSubmit={(p: any) => save.mutate(p)} saving={save.isPending} />
          </Dialog>
        }
      />
      <HubTabs tabs={CLIENTES_TABS} />
      <div className="mb-4 rounded-lg border bg-muted/40 p-3 text-sm">
        📣 Fluxo do disparo: <b>Criar lista</b> → <b>Importar leads</b> (colar, CSV ou selecionar contatos) → em <b>/admin/disparos</b> escolher esta lista na etapa <i>Contatos</i>.
      </div>
      {(contactsQuery.error || clientsQuery.error) && (
        <ErrorCard error={contactsQuery.error ?? clientsQuery.error} onRetry={() => { contactsQuery.refetch(); clientsQuery.refetch(); }} />
      )}
      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        <div className="rounded-xl border bg-card">
          {listsQuery.error ? <ErrorCard error={listsQuery.error} onRetry={() => listsQuery.refetch()} />
          : lists.length === 0 ? <EmptyState title="Nenhuma lista" />
          : <div className="divide-y">
            {lists.map((l: any) => (
              <div key={l.id} className={`flex items-center justify-between p-3 ${selectedListId === l.id ? "bg-muted" : ""}`}>
                <button onClick={() => setSelectedListId(l.id)} className="flex-1 text-left">
                  <div className="font-medium text-sm">{l.name}</div>
                  <div className="text-xs text-muted-foreground">{l.client?.name ?? "—"}</div>
                </button>
                <Button size="icon" variant="ghost" onClick={() => setAddOpen(l.id)} title="Importar contatos"><ListPlus className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" title="Sincronizar" disabled={resyncMut.isPending} onClick={() => resyncMut.mutate(l.id)}><RefreshCw className={`h-4 w-4 ${resyncMut.isPending ? "animate-spin" : ""}`} /></Button>
                <Button size="icon" variant="ghost" onClick={() => confirm("Remover?") && del.mutate(l.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>}
        </div>
        <div className="rounded-xl border bg-card">
          {!selectedListId ? <div className="p-6 text-sm text-muted-foreground">Selecione uma lista.</div>
          : (
            <>
              <div className="flex items-center justify-between border-b p-3">
                <div className="text-sm font-semibold">{members.length} contato(s) na lista</div>
                <Button size="sm" onClick={() => setAddOpen(selectedListId)}>
                  <ListPlus className="mr-2 h-4 w-4" />Importar leads
                </Button>
              </div>
              {membersQuery.error ? <ErrorCard error={membersQuery.error} onRetry={() => membersQuery.refetch()} />
              : members.length === 0 ? <EmptyState title="Lista vazia" description="Importe leads existentes, cole telefones ou envie um CSV." />
              : <Table>
                <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Telefone</TableHead><TableHead>Opt-in</TableHead></TableRow></TableHeader>
                <TableBody>
                  {members.map((c: any) => (
                    <TableRow key={c.id}><TableCell>{c.name ?? "—"}</TableCell><TableCell className="font-mono text-xs">{c.phone}</TableCell><TableCell>{c.opt_in ? "✓" : "—"}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>}
            </>
          )}
        </div>
      </div>

      <Dialog open={!!addOpen} onOpenChange={(v) => !v && setAddOpen(null)}>
        <ImportDialog
          contacts={contacts}
          saving={addMut.isPending || importMut.isPending}
          onAddExisting={(ids) => addMut.mutate({ list_id: addOpen, contact_ids: ids })}
          onImport={(rows, source, filename) => importMut.mutate({ list_id: addOpen, rows, source, filename })}
        />
      </Dialog>

      <Dialog open={!!importResult} onOpenChange={(v) => !v && setImportResult(null)}>
        <ImportResultDialog result={importResult} onClose={() => setImportResult(null)} />
      </Dialog>
    </>
  );
}

function ImportResultDialog({ result, onClose }: { result: any; onClose: () => void }) {
  if (!result) return null;
  const downloadInvalid = () => {
    const rows = result.invalidRows ?? [];
    const csv = ["input,name,reason", ...rows.map((r: any) => `"${(r.input ?? "").replace(/"/g, '""')}","${(r.name ?? "").toString().replace(/"/g, '""')}","${r.reason}"`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `invalidos-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Resultado do import</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Stat label="Linhas recebidas" value={result.total_input} />
        <Stat label="Válidas após normalização" value={result.normalized} />
        <Stat label="Duplicadas no arquivo" value={result.duplicates} />
        <Stat label="Inválidas" value={result.invalid} tone={result.invalid ? "warn" : undefined} />
        <Stat label="Contatos existentes" value={result.existing_contacts} />
        <Stat label="Contatos criados" value={result.created_contacts} tone="good" />
        <Stat label="Novos links na lista" value={result.linked} tone="good" />
        <Stat label="Já linkados antes" value={result.already_linked} />
      </div>
      {result.invalidRows?.length > 0 && (
        <div className="mt-3 max-h-40 overflow-auto rounded border bg-muted/40 p-2 text-xs">
          {result.invalidRows.slice(0, 50).map((r: any, i: number) => (
            <div key={i} className="flex justify-between gap-2 py-0.5">
              <span className="font-mono truncate">{r.input || "(vazio)"}</span>
              <span className="text-muted-foreground">{r.reason}</span>
            </div>
          ))}
          {result.invalidRows.length > 50 && <div className="text-muted-foreground pt-1">…e mais {result.invalidRows.length - 50}. Baixe o CSV para ver todos.</div>}
        </div>
      )}
      <DialogFooter>
        {result.invalidRows?.length > 0 && (
          <Button variant="outline" onClick={downloadInvalid}><Download className="mr-2 h-4 w-4" />CSV dos inválidos</Button>
        )}
        <Button onClick={onClose}>Fechar</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "good" | "warn" }) {
  const color = tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "";
  return (
    <div className="rounded border bg-card p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${color}`}>{value ?? 0}</div>
    </div>
  );
}

function ListDialog({ clients, onSubmit, saving }: any) {
  const [form, setForm] = useState<any>({ name: "", description: "", client_id: "" });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Nova lista</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Nome *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><Label>Descrição</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div><Label>Cliente</Label>
          <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter><Button disabled={saving || !form.name} onClick={() => onSubmit(form)}>Salvar</Button></DialogFooter>
    </DialogContent>
  );
}

type ImportRow = { phone: string; name?: string | null; email?: string | null };

function ImportDialog({
  contacts,
  saving,
  onAddExisting,
  onImport,
}: {
  contacts: any[];
  saving: boolean;
  onAddExisting: (ids: string[]) => void;
  onImport: (rows: ImportRow[], source: string, filename?: string | null) => void;
}) {
  const [tab, setTab] = useState("existing");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [paste, setPaste] = useState("");
  const [csvRows, setCsvRows] = useState<ImportRow[] | null>(null);
  const [csvName, setCsvName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const usable = useMemo(
    () => contacts.filter((c: any) => c.opt_in && !c.opt_out),
    [contacts],
  );
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return usable;
    return usable.filter((c: any) =>
      (c.name ?? "").toLowerCase().includes(term) || (c.phone ?? "").includes(term),
    );
  }, [usable, q]);

  const toggle = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelected(s);
  };
  const toggleAll = () => {
    if (filtered.every((c: any) => selected.has(c.id))) {
      const s = new Set(selected);
      filtered.forEach((c: any) => s.delete(c.id));
      setSelected(s);
    } else {
      const s = new Set(selected);
      filtered.forEach((c: any) => s.add(c.id));
      setSelected(s);
    }
  };

  const pasteRows: ImportRow[] = useMemo(() => {
    if (!paste.trim()) return [];
    return paste
      .split(/[\n;,]/)
      .map((v) => v.trim())
      .filter(Boolean)
      .map((phone) => ({ phone }));
  }, [paste]);

  const handleFile = async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
    if (!lines.length) { setCsvRows([]); return; }
    const headerLine = lines[0];
    const hasHeader = /phone|telefone|celular|nome|name|email/i.test(headerLine);
    const sep = headerLine.includes(";") ? ";" : ",";
    const headers = hasHeader
      ? headerLine.split(sep).map((h) => h.trim().toLowerCase())
      : ["phone", "name", "email"];
    const dataLines = hasHeader ? lines.slice(1) : lines;
    const rows: ImportRow[] = dataLines.map((line) => {
      const cols = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
      const obj: any = {};
      headers.forEach((h, i) => { obj[h] = cols[i] ?? ""; });
      return {
        phone: obj.phone || obj.telefone || obj.celular || cols[0] || "",
        name: obj.name || obj.nome || null,
        email: obj.email || null,
      };
    }).filter((r) => r.phone);
    setCsvRows(rows);
    setCsvName(file.name);
  };

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Importar leads para a lista</DialogTitle>
      </DialogHeader>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="existing"><Users className="mr-2 h-4 w-4" />Contatos</TabsTrigger>
          <TabsTrigger value="paste"><ClipboardPaste className="mr-2 h-4 w-4" />Colar telefones</TabsTrigger>
          <TabsTrigger value="csv"><Upload className="mr-2 h-4 w-4" />CSV</TabsTrigger>
        </TabsList>

        <TabsContent value="existing" className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder="Buscar por nome ou telefone" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Button variant="outline" size="sm" onClick={toggleAll}>
              {filtered.length > 0 && filtered.every((c: any) => selected.has(c.id)) ? "Desmarcar" : "Selecionar todos"}
            </Button>
          </div>
          <div className="max-h-[360px] overflow-y-auto rounded border">
            {filtered.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">Nenhum contato encontrado.</div>
            ) : filtered.map((c: any) => (
              <label key={c.id} className="flex items-center gap-2 border-b p-2 text-sm hover:bg-muted cursor-pointer">
                <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                <span className="flex-1">{c.name ?? "—"}</span>
                <span className="font-mono text-xs text-muted-foreground">{c.phone}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button disabled={saving || selected.size === 0} onClick={() => onAddExisting([...selected])}>
              Adicionar {selected.size}
            </Button>
          </DialogFooter>
        </TabsContent>

        <TabsContent value="paste" className="space-y-3">
          <div>
            <Label>Cole os telefones (um por linha, ou separados por vírgula)</Label>
            <Textarea
              rows={10}
              className="mt-1 font-mono text-xs"
              placeholder={"5562984817929\n5511999998888\n..."}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {pasteRows.length} número(s) detectado(s). Novos leads serão criados com opt-in ativo.
            </p>
          </div>
          <DialogFooter>
            <Button disabled={saving || pasteRows.length === 0} onClick={() => onImport(pasteRows, "paste")}>
              Importar {pasteRows.length}
            </Button>
          </DialogFooter>
        </TabsContent>

        <TabsContent value="csv" className="space-y-3">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            className="rounded-lg border-2 border-dashed p-6 text-center"
          >
            <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="mb-2 text-sm">Arraste um arquivo CSV ou</p>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              Selecionar arquivo
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <p className="mt-3 text-xs text-muted-foreground">
              Colunas suportadas: <code>phone/telefone/celular</code>, <code>name/nome</code>, <code>email</code>.
            </p>
          </div>
          {csvRows && (
            <div className="rounded-md border bg-muted/40 p-3 text-xs">
              <div className="font-semibold">{csvName}</div>
              <div className="text-muted-foreground">{csvRows.length} linha(s) prontas para importar.</div>
            </div>
          )}
          <DialogFooter>
            <Button
              disabled={saving || !csvRows?.length}
              onClick={() => csvRows && onImport(csvRows, "csv", csvName)}
            >
              Importar {csvRows?.length ?? 0}
            </Button>
          </DialogFooter>
        </TabsContent>
      </Tabs>
    </DialogContent>
  );
}
