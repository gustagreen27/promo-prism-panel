import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search, Users, Inbox, Tag, Layers, Upload, Trash2, Filter,
  Loader2, Plus, CheckSquare, Sparkles,
} from "lucide-react";
import { listWorkspaceLists, previewWorkspaceList } from "@/lib/wa-wizard-lists.functions";
import { ContactPicker } from "./ContactPicker";
import { cn } from "@/lib/utils";

type SavedList = { id: string; name: string; count: number };
export type ContactSelValue = {
  list_id: string;
  list_name: string;
  total: number;
  valid: number;
};

type Source = "saved" | "inbox" | "tags" | "groups" | "import";

const SOURCES: { id: Source; label: string; icon: any; soon?: boolean }[] = [
  { id: "saved", label: "Contatos Salvos", icon: Users },
  { id: "inbox", label: "Inbox", icon: Inbox, soon: true },
  { id: "tags", label: "Etiquetas", icon: Tag, soon: true },
  { id: "groups", label: "Contatos de grupos", icon: Layers, soon: true },
  { id: "import", label: "Importar planilha", icon: Upload },
];

export function ContactsStep({
  workspaceId,
  value,
  onChange,
}: {
  workspaceId: string;
  value: ContactSelValue | null;
  onChange: (v: ContactSelValue | null) => void;
}) {
  const fnLists = useServerFn(listWorkspaceLists);
  const fnPreview = useServerFn(previewWorkspaceList);

  const [source, setSource] = useState<Source>("saved");
  const [lists, setLists] = useState<SavedList[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fnLists({ data: { workspace_id: workspaceId } })
      .then((r) => { if (alive) setLists(r.lists); })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar listas"))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [workspaceId, fnLists]);

  const filtered = useMemo(
    () => lists.filter((l) => l.name.toLowerCase().includes(search.toLowerCase())),
    [lists, search]
  );

  async function pickList(list: SavedList) {
    if (value?.list_id === list.id) { onChange(null); return; }
    try {
      const p = await fnPreview({ data: { workspace_id: workspaceId, list_id: list.id } });
      onChange({ list_id: list.id, list_name: list.name, total: p.total, valid: p.valid });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar lista");
    }
  }

  const totalAvailable = lists.reduce((s, l) => s + (l.count ?? 0), 0);
  const selectedCount = value?.valid ?? 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr_320px]">
      {/* SIDEBAR — Fontes */}
      <aside className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Button variant="default" size="sm" className="justify-start">
            <Filter className="mr-1.5 h-4 w-4" /> Filtros
            <Badge className="ml-auto bg-white/20 text-white">{SOURCES.length}</Badge>
          </Button>
          <Button variant="outline" size="sm" className="justify-start">
            <Layers className="mr-1.5 h-4 w-4" /> Agrupamentos
            <Badge variant="secondary" className="ml-auto">0</Badge>
          </Button>
        </div>
        <div className="overflow-hidden rounded-lg border">
          {SOURCES.map((s) => {
            const Icon = s.icon;
            const active = source === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSource(s.id)}
                disabled={s.soon}
                className={cn(
                  "flex w-full items-center gap-2 border-b px-3 py-2.5 text-left text-sm transition-colors last:border-0",
                  active ? "bg-primary text-primary-foreground" : "hover:bg-muted/50",
                  s.soon && "cursor-not-allowed opacity-60"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{s.label}</span>
                {s.soon && <Badge variant="outline" className="border-current text-[10px]">em breve</Badge>}
                {s.id === "import" && !s.soon && (
                  <Badge variant="secondary" className="text-[10px]">
                    <Upload className="mr-1 h-3 w-3" /> Importar
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      </aside>

      {/* CENTER */}
      <section className="min-w-0 space-y-3">
        {source === "saved" && (
          <>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Pesquisar por nome da lista"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button variant="outline" disabled title="Selecionar todos (em breve)">
                <CheckSquare className="mr-1.5 h-4 w-4" /> Selecionar tudo
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              {totalAvailable.toLocaleString("pt-BR")} destinatários disponíveis · {selectedCount.toLocaleString("pt-BR")} selecionados
            </div>
            <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
              {loading ? (
                <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando listas...
                </div>
              ) : filtered.length === 0 ? (
                <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                  Nenhuma lista {search ? "encontrada" : "cadastrada"}. Crie uma pela aba <b>Importar planilha</b>.
                </div>
              ) : (
                filtered.map((l) => {
                  const selected = value?.list_id === l.id;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => pickList(l)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50",
                        selected && "border-primary bg-primary/5 ring-1 ring-primary/40"
                      )}
                    >
                      <div className={cn(
                        "flex h-5 w-5 items-center justify-center rounded border",
                        selected ? "border-primary bg-primary text-primary-foreground" : "border-input"
                      )}>
                        {selected && <CheckSquare className="h-3.5 w-3.5" />}
                      </div>
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-semibold text-emerald-600">
                        {l.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{l.name}</div>
                        <div className="text-xs text-muted-foreground">
                          <b>Tipo:</b> Lista · {l.count} contatos
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}

        {source === "import" && (
          <div className="rounded-lg border p-4">
            <ContactPicker
              workspaceId={workspaceId}
              value={value}
              onChange={(v) => onChange(v as ContactSelValue)}
            />
          </div>
        )}

        {(source === "inbox" || source === "tags" || source === "groups") && (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            <Sparkles className="mx-auto mb-2 h-6 w-6" />
            Este filtro estará disponível em breve.
          </div>
        )}
      </section>

      {/* RIGHT — Selecionados */}
      <aside className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Destinatários selecionados</div>
          <Button size="sm" variant="outline" disabled title="Em breve">
            <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar contato
          </Button>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{selectedCount.toLocaleString("pt-BR")} destinatário{selectedCount === 1 ? "" : "s"}</span>
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <Trash2 className="h-3 w-3" /> Limpar
            </button>
          )}
        </div>
        <div className="min-h-[200px] space-y-2 rounded-lg border p-2">
          {!value ? (
            <div className="py-10 text-center text-xs text-muted-foreground">
              Escolha uma lista à esquerda para adicionar destinatários.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 rounded-md border p-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-semibold text-emerald-600">
                  {value.list_name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{value.list_name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {value.valid} válidos {value.total !== value.valid && `· ${value.total} total`}
                  </div>
                </div>
              </div>
              <Button className="w-full" disabled title="Em breve">
                Criar Agrupamento
              </Button>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
