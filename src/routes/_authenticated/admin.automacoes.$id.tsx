import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap,
  addEdge, applyEdgeChanges, applyNodeChanges, useReactFlow, MarkerType,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";
import {
  ArrowLeft, Save, CheckCircle2, Rocket, Pause, Play, FlaskConical, Undo2, Redo2, Copy, Trash2, LayoutGrid, Braces, AlertTriangle, History, Settings2, ChevronDown, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getAutomation, saveAutomationDraft, publishAutomation, setAutomationStatus, getAutomationOptions, getWorkspaceAssets, runAutomation, getWebhookInfo,
} from "@/lib/automations.functions";
import {
  BLOCKS, BLOCK_MAP, CATEGORY_LABEL, VARIABLES, summarize, validateGraph, isTrigger, responsePaths,
  type AutoGraph, type ValidationIssue,
} from "@/lib/automation-graph";
import { AutomationFlowNode, blockAppearance, type FlowNodeData } from "@/components/admin/automation-flow-node";
import { RunDetail, RunsPanel } from "@/components/admin/automation-runs";

export const Route = createFileRoute("/_authenticated/admin/automacoes/$id")({
  head: () => ({ meta: [{ title: "Editor de automação — Next Disparos" }, { name: "description", content: "Configure mensagens e caminhos de resposta nas automações do Next Disparos." }, { property: "og:title", content: "Editor de automação — Next Disparos" }, { property: "og:description", content: "Mensagens, ações e caminhos de resposta em um quadro visual." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  ),
});

type NodeData = FlowNodeData;
const nodeTypes = { block: AutomationFlowNode };

let idSeq = 0;
const newId = (p: string) => `${p}_${Date.now().toString(36)}${(idSeq++).toString(36)}`;

function toFlow(g: AutoGraph): { nodes: Node<NodeData>[]; edges: Edge[] } {
  return {
    nodes: g.nodes.map((n) => ({ id: n.id, type: "block", position: n.position, data: { type: n.type, label: n.data.label, config: n.data.config ?? {} } })),
    edges: g.edges.map((e) => ({ ...e, sourceHandle: e.sourceHandle ?? "out", markerEnd: { type: MarkerType.ArrowClosed } })),
  };
}
function toGraph(nodes: Node<NodeData>[], edges: Edge[]): AutoGraph {
  return {
    schema: 1,
    nodes: nodes.map((n) => ({ id: n.id, type: n.data.type, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) }, data: { label: n.data.label || undefined, config: n.data.config } })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? "out" })),
  };
}

function Editor() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const rf = useReactFlow();
  const get = useServerFn(getAutomation);
  const save = useServerFn(saveAutomationDraft);
  const publish = useServerFn(publishAutomation);
  const setStatus = useServerFn(setAutomationStatus);
  const opts = useServerFn(getAutomationOptions);
  const assetsFn = useServerFn(getWorkspaceAssets);

  const q = useQuery({ queryKey: ["automation", id], queryFn: () => get({ data: { id } }) });
  const o = useQuery({ queryKey: ["automation-options"], queryFn: () => opts() });

  const [nodes, setNodes] = useState<Node<NodeData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [testOpen, setTestOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const loaded = useRef(false);
  const past = useRef<{ nodes: Node<NodeData>[]; edges: Edge[] }[]>([]);
  const future = useRef<{ nodes: Node<NodeData>[]; edges: Edge[] }[]>([]);

  useEffect(() => {
    if (!q.data || loaded.current) return;
    loaded.current = true;
    const f = toFlow(q.data.draft_graph as AutoGraph);
    setNodes(f.nodes); setEdges(f.edges);
    setName(q.data.name); setDescription(q.data.description ?? ""); setConnectionId(q.data.connection_id);
  }, [q.data]);

  const workspaceId = q.data?.workspace_id ?? null;
  const assets = useQuery({ queryKey: ["automation-assets", workspaceId, connectionId], queryFn: () => assetsFn({ data: { workspaceId, connectionId } }), enabled: !!q.data });
  const names = useMemo(() => ({
    tags: Object.fromEntries((assets.data?.tags ?? []).map((t: any) => [t.id, t.name])),
    lists: Object.fromEntries((assets.data?.lists ?? []).map((t: any) => [t.id, t.name])),
  }), [assets.data]);

  // Aviso ao sair com alterações não salvas.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const snapshot = useCallback(() => {
    past.current.push({ nodes, edges });
    if (past.current.length > 100) past.current.shift();
    future.current = [];
    setDirty(true);
  }, [nodes, edges]);

  const undo = () => { const p = past.current.pop(); if (!p) return; future.current.push({ nodes, edges }); setNodes(p.nodes); setEdges(p.edges); setDirty(true); };
  const redo = () => { const f = future.current.pop(); if (!f) return; past.current.push({ nodes, edges }); setNodes(f.nodes); setEdges(f.edges); setDirty(true); };

  const onNodesChange = useCallback((ch: NodeChange<Node<NodeData>>[]) => {
    if (ch.some((c) => c.type === "remove" || (c.type === "position" && c.dragging === false))) { past.current.push({ nodes, edges }); future.current = []; setDirty(true); }
    setNodes((ns) => applyNodeChanges(ch, ns));
  }, [nodes, edges]);
  const onEdgesChange = useCallback((ch: EdgeChange[]) => {
    if (ch.some((c) => c.type === "remove")) snapshot();
    setEdges((es) => applyEdgeChanges(ch, es));
  }, [snapshot]);
  const onConnect = useCallback((c: Connection) => {
    if (c.source === c.target) return;
    const handle = c.sourceHandle ?? "out";
    snapshot();
    // Uma saída = uma conexão (sem execução paralela): substitui a anterior.
    setEdges((es) => addEdge({ ...c, sourceHandle: handle, id: newId("e"), markerEnd: { type: MarkerType.ArrowClosed } }, es.filter((e) => !(e.source === c.source && (e.sourceHandle ?? "out") === handle))));
  }, [snapshot]);

  const addBlock = (type: string, position?: { x: number; y: number }) => {
    const def = BLOCK_MAP[type];
    if (!def) return;
    if (isTrigger(type) && nodes.some((n) => isTrigger(n.data.type))) { toast.error("Use apenas um gatilho por automação"); return; }
    snapshot();
    const nid = newId(type.split("_")[0]);
    const origin = position ?? rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    setNodes((ns) => [...ns, { id: nid, type: "block", position: origin, data: { type, config: structuredClone(def.defaults) } }]);
    setSelected(nid);
  };
  const onDrop = (ev: DragEvent) => {
    ev.preventDefault();
    addBlock(ev.dataTransfer.getData("application/automation-block"), rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY }));
  };

  const updateNode = (nid: string, patch: Partial<NodeData>) => {
    snapshot();
    setNodes((ns) => ns.map((n) => (n.id === nid ? { ...n, data: { ...n.data, ...patch } } : n)));
  };
  const duplicateNode = (nid: string) => {
    const n = nodes.find((x) => x.id === nid);
    if (!n || isTrigger(n.data.type)) return;
    snapshot();
    const cid = newId(n.data.type.split("_")[0]);
    setNodes((ns) => [...ns, { ...n, id: cid, selected: false, position: { x: n.position.x + 40, y: n.position.y + 60 }, data: structuredClone(n.data) }]);
    setSelected(cid);
  };
  const deleteNode = (nid: string) => {
    snapshot();
    setNodes((ns) => ns.filter((n) => n.id !== nid));
    setEdges((es) => es.filter((e) => e.source !== nid && e.target !== nid));
    setSelected(null);
  };
  const autoLayout = () => {
    snapshot();
    const g = toGraph(nodes, edges);
    const trig = g.nodes.find((n) => isTrigger(n.type));
    const depth = new Map<string, number>();
    const queue = trig ? [trig.id] : [];
    if (trig) depth.set(trig.id, 0);
    while (queue.length) {
      const cur = queue.shift();
      if (!cur) continue;
      for (const e of g.edges.filter((x) => x.source === cur)) {
        const d = (depth.get(cur) ?? 0) + 1;
        if ((depth.get(e.target) ?? -1) < d && d < 100) { depth.set(e.target, d); queue.push(e.target); }
      }
    }
    const rows = new Map<number, string[]>();
    for (const n of g.nodes) { const d = depth.get(n.id) ?? 0; rows.set(d, [...(rows.get(d) ?? []), n.id]); }
    setNodes((ns) => ns.map((n) => {
      const d = depth.get(n.id) ?? 0;
      const row = rows.get(d);
      if (!row) return n;
      const i = row.indexOf(n.id);
      return { ...n, position: { x: d * 300, y: i * 230 } };
    }));
    setTimeout(() => rf.fitView({ padding: 0.2 }), 50);
  };

  const graph = useMemo(() => toGraph(nodes, edges), [nodes, edges]);
  const invalidIds = useMemo(() => new Set(issues.map((i) => i.nodeId).filter(Boolean) as string[]), [issues]);
  const paths = useMemo(() => responsePaths(graph), [graph]);
  const [pathKey, setPathKey] = useState<string | null>(null);
  const activePath = paths.find((p) => p.key === pathKey) ?? null;
  const displayEdges = useMemo(() => {
    if (!activePath) return edges;
    const on = new Set(activePath.edgeIds);
    return edges.map((e) => on.has(e.id) ? { ...e, animated: true, style: { strokeWidth: 3, stroke: "var(--primary)" } } : { ...e, style: { opacity: 0.25 } });
  }, [edges, activePath]);
  const displayNodes = useMemo(() => nodes.map((n, index) => ({
    ...n, data: { ...n.data, ordinal: String(index + 1).padStart(2, "0"), summary: summarize({ id: n.id, type: n.data.type, position: n.position, data: { config: n.data.config } }, names), invalid: invalidIds.has(n.id) },
    style: activePath && !activePath.nodeIds.includes(n.id) ? { opacity: 0.3 } : undefined,
  })), [nodes, names, invalidIds, activePath]);

  const saveMut = useMutation({
    mutationFn: () => save({ data: { id, name, description: description || null, connectionId, graph } }),
    onSuccess: (r) => { setDirty(false); setIssues(r.issues); qc.invalidateQueries({ queryKey: ["automations"] }); toast.success("Rascunho salvo"); },
    onError: (e: any) => toast.error(e.message),
  });
  const validate = () => {
    const list = validateGraph(graph);
    if (graph.nodes.some((n) => n.type.startsWith("send_")) && !connectionId) list.push({ message: "Escolha o número WhatsApp da automação" });
    setIssues(list);
    if (list.length) toast.error(`${list.length} problema(s) encontrado(s)`); else toast.success("Fluxo válido");
    return list;
  };
  const pubMut = useMutation({
    mutationFn: async () => {
      if (validate().length) throw new Error("Corrija os problemas antes de publicar");
      await save({ data: { id, name, description: description || null, connectionId, graph } });
      setDirty(false);
      return publish({ data: { id } });
    },
    onSuccess: (r) => {
      if (!r.ok) { setIssues(r.issues); toast.error("Não foi possível publicar"); return; }
      toast.success(`Versão ${r.version} publicada e ativa`);
      qc.invalidateQueries({ queryKey: ["automation", id] }); qc.invalidateQueries({ queryKey: ["automations"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const statusMut = useMutation({
    mutationFn: (status: "active" | "paused") => setStatus({ data: { id, status } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["automation", id] }); toast.success("Status atualizado"); },
    onError: (e: any) => toast.error(e.message),
  });

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); saveMut.mutate(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  if (q.isLoading) return <p className="p-6 text-sm text-muted-foreground">Carregando…</p>;
  if (q.error || !q.data) return <p className="p-6 text-sm text-destructive">{(q.error as any)?.message ?? "Não encontrada"}</p>;
  const a = q.data;
  const conns = (o.data?.connections ?? []).filter((c: any) => !a.workspace_id || c.workspace_id === a.workspace_id);
  const sel = nodes.find((n) => n.id === selected) ?? null;
  const versions = (a.automation_versions ?? []).filter((v: any) => v.version > 0);
  const lastVersion = versions.sort((x: any, y: any) => y.version - x.version)[0];

  return (
    <div className="automation-editor flex h-[calc(100dvh-4rem)] min-h-[540px] flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b bg-card px-3 py-2">
        <Button variant="ghost" size="icon" asChild><Link to="/admin/automacoes"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <Input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} className="h-8 w-56 font-semibold" />
        <Badge variant="secondary">{({ draft: "Rascunho", active: "Ativa", paused: "Pausada", archived: "Arquivada" } as any)[a.status]}</Badge>
        {lastVersion && <Badge variant="outline">Publicada v{lastVersion.version}</Badge>}
        {dirty && <span className="text-xs font-medium text-destructive">● Alterações não salvas</span>}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button size="icon" variant="ghost" title="Configurações e caminhos" aria-label="Configurações e caminhos" onClick={() => { setSelected(null); setSettingsOpen((v) => !v); }}><Settings2 className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" title="Desfazer (Ctrl+Z)" onClick={undo}><Undo2 className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" title="Refazer (Ctrl+Y)" onClick={redo}><Redo2 className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" title="Organizar automaticamente" onClick={autoLayout}><LayoutGrid className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" onClick={() => setHistoryOpen(true)}><History className="mr-1 h-4 w-4" />Execuções</Button>
          <Button size="sm" variant="outline" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}><Save className="mr-1 h-4 w-4" />Salvar rascunho</Button>
          <Button size="sm" variant="outline" onClick={validate}><CheckCircle2 className="mr-1 h-4 w-4" />Validar</Button>
          <Button size="sm" variant="outline" onClick={async () => { if (dirty) await saveMut.mutateAsync(); setTestOpen(true); }}><FlaskConical className="mr-1 h-4 w-4" />Testar</Button>
          {a.status === "active" ? (
            <Button size="sm" variant="outline" onClick={() => statusMut.mutate("paused")}><Pause className="mr-1 h-4 w-4" />Pausar</Button>
          ) : a.status === "paused" ? (
            <Button size="sm" variant="outline" onClick={() => statusMut.mutate("active")}><Play className="mr-1 h-4 w-4" />Ativar</Button>
          ) : null}
          <Button size="sm" onClick={() => pubMut.mutate()} disabled={pubMut.isPending}><Rocket className="mr-1 h-4 w-4" />Publicar</Button>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-4 overflow-x-auto border-b bg-card px-4 py-2">
        <span className="whitespace-nowrap text-xs font-semibold">Adicionar bloco</span>
        {[
          { label: "Mensagem", types: ["send_text", "send_buttons", "send_template"] },
          { label: "Mídia", types: ["send_media"] },
          { label: "Fluxo", types: ["wait_duration", "cond_reply", "act_handoff", "end"] },
        ].map((group) => <div key={group.label} className="shrink-0 border-r pr-4">
          <div className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">{group.label}</div>
          <div className="flex items-center gap-1">{group.types.map((type) => {
            const appearance = blockAppearance(type);
            const Icon = appearance.icon;
            return <Button key={type} variant="ghost" size="sm" draggable data-tone={appearance.tone} title={BLOCK_MAP[type].description}
              className="h-8 gap-2 px-2 font-normal" onClick={() => addBlock(type)}
              onDragStart={(e) => { e.dataTransfer.setData("application/automation-block", type); e.dataTransfer.effectAllowed = "copy"; }}>
              <span className="automation-tool-icon"><Icon size={14} /></span>{appearance.label}
            </Button>;
          })}</div>
        </div>)}
        <Popover><PopoverTrigger asChild><Button variant="ghost" size="sm">Todos os blocos<ChevronDown size={14} /></Button></PopoverTrigger>
          <PopoverContent className="max-h-[65vh] w-72 overflow-y-auto" align="end">
            {Object.entries(CATEGORY_LABEL).map(([category, label]) => <div key={category} className="mb-3">
              <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">{label}</div>
              {BLOCKS.filter((block) => block.category === category).map((block) => <Button key={block.type} variant="ghost" size="sm" className="w-full justify-start" onClick={() => addBlock(block.type)}>{block.label}</Button>)}
            </div>)}
          </PopoverContent>
        </Popover>
      </div>
      <div className="relative flex min-h-0 flex-1">
        {/* Canvas */}
        <div className="relative min-w-0 flex-1 bg-flow-canvas" onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }} onDrop={onDrop}>
          <ReactFlow
            nodes={displayNodes} edges={displayEdges} nodeTypes={nodeTypes}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
            onNodeClick={(_, n) => setSelected(n.id)} onPaneClick={() => { setSelected(null); setSettingsOpen(false); }}
            fitView deleteKeyCode={["Delete", "Backspace"]} defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed } }}
          >
            <Background variant={BackgroundVariant.Dots} gap={14} size={1} color="var(--flow-dot)" />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
          {issues.length > 0 && (
            <div className="absolute left-3 top-3 z-10 max-h-56 w-80 overflow-y-auto rounded-lg border border-destructive/40 bg-card p-2 text-xs shadow">
              <div className="mb-1 flex items-center gap-1 font-semibold text-destructive"><AlertTriangle className="h-3.5 w-3.5" />{issues.length} problema(s)</div>
              {issues.map((i, k) => (
                <button key={k} className="block w-full truncate rounded px-1 py-0.5 text-left hover:bg-accent" onClick={() => i.nodeId && setSelected(i.nodeId)}>
                  {i.nodeId ? `${nodes.find((n) => n.id === i.nodeId)?.data.label || BLOCK_MAP[nodes.find((n) => n.id === i.nodeId)?.data.type ?? ""]?.label || ""}: ` : ""}{i.message}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Configuração */}
        {(sel || settingsOpen) && <aside className="absolute inset-y-0 right-0 z-20 w-[min(320px,90%)] overflow-y-auto border-l bg-card p-3 shadow-elegant md:static md:w-80 md:shrink-0 md:shadow-none">
          <div className="mb-3 flex items-center justify-between"><span className="text-sm font-semibold">{sel ? "Configurar bloco" : "Configurações do fluxo"}</span><Button variant="ghost" size="icon" aria-label="Fechar configurações" onClick={() => { setSelected(null); setSettingsOpen(false); }}><X size={16} /></Button></div>
          {sel ? (
            <NodeConfig key={sel.id} node={sel} nodes={nodes} assets={assets.data} automationId={id}
              onChange={(patch) => updateNode(sel.id, patch)} onDuplicate={() => duplicateNode(sel.id)} onDelete={() => deleteNode(sel.id)} />
          ) : (
            <div className="space-y-3">
              <div><Label>Número WhatsApp</Label><Select value={connectionId ?? ""} onValueChange={(v) => { setConnectionId(v); setDirty(true); }}><SelectTrigger><SelectValue placeholder="Escolha o número" /></SelectTrigger><SelectContent>{conns.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name} {c.display_phone ?? ""}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Descrição</Label><Textarea rows={3} value={description} onChange={(e) => { setDescription(e.target.value); setDirty(true); }} /></div>
              
              <div className="space-y-1.5">
                <Label>Caminhos por resposta</Label>
                
                {paths.map((p) => (
                  <button key={p.key} type="button" onClick={() => setPathKey(pathKey === p.key ? null : p.key)}
                    className={`block w-full rounded-md border p-2 text-left text-xs hover:bg-accent ${pathKey === p.key ? "border-primary bg-accent" : ""}`}>
                    <div className="font-semibold">Quando: {p.when}</div>
                    <div className="text-muted-foreground">→ {p.actions.join(" → ") || "Encerrar"}</div>
                  </button>
                ))}
              </div>
              
            </div>
          )}
        </aside>}
      </div>

      <TestDialog open={testOpen} onOpenChange={setTestOpen} automationId={id} status={a.status} triggerType={a.trigger_type} />
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          <DialogHeader><DialogTitle>Execuções</DialogTitle></DialogHeader>
          <RunsPanel automationId={id} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ───────────── Campo com seletor de variáveis ─────────────
function VarField({ value, onChange, multiline, placeholder }: { value: string; onChange: (v: string) => void; multiline?: boolean; placeholder?: string }) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const insert = (tok: string) => {
    const el = ref.current;
    const t = `{{${tok}}}`;
    if (!el) return onChange((value ?? "") + t);
    const s = el.selectionStart ?? value.length, e = el.selectionEnd ?? value.length;
    onChange(value.slice(0, s) + t + value.slice(e));
  };
  return (
    <div className="relative">
      {multiline
        ? <Textarea ref={ref} rows={4} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="pr-9" />
        : <Input ref={ref} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="pr-9" />}
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" size="icon" variant="ghost" className="absolute right-1 top-1 h-7 w-7" title="Inserir variável"><Braces className="h-3.5 w-3.5" /></Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-1" align="end">
          {VARIABLES.map((v) => (
            <button key={v.token} className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-accent" onClick={() => insert(v.token)}>
              <span className="font-medium">{v.label}</span><br /><code className="text-muted-foreground">{`{{${v.token}}}`}</code>
            </button>
          ))}
          <p className="px-2 py-1 text-[10px] text-muted-foreground">Troque CAMPO, CHAVE e ETAPA pelo nome real (ex.: steps.http_1.status).</p>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function NodeConfig({ node, nodes, assets, automationId, onChange, onDuplicate, onDelete }: {
  node: Node<NodeData>; nodes: Node<NodeData>[]; assets: any; automationId: string;
  onChange: (p: Partial<NodeData>) => void; onDuplicate: () => void; onDelete: () => void;
}) {
  const def = BLOCK_MAP[node.data.type];
  const c = node.data.config ?? {};
  const set = (k: string, v: any) => onChange({ config: { ...c, [k]: v } });
  const webhook = useServerFn(getWebhookInfo);
  const wh = useQuery({ queryKey: ["automation-webhook", automationId], queryFn: () => webhook({ data: { id: automationId } }), enabled: node.data.type === "trigger_webhook" });
  const tags = assets?.tags ?? [], lists = assets?.lists ?? [], templates = assets?.templates ?? [];
  const TagSelect = ({ k }: { k: string }) => (
    <Select value={c[k] ?? ""} onValueChange={(v) => set(k, v)}>
      <SelectTrigger><SelectValue placeholder={tags.length ? "Escolha a etiqueta" : "Cliente sem etiquetas"} /></SelectTrigger>
      <SelectContent>{tags.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
    </Select>
  );
  const Missing = () => (
    <div><Label className="text-xs">Se uma variável estiver vazia</Label>
      <Select value={c.onMissing ?? "fail"} onValueChange={(v) => set("onMissing", v)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="fail">Falhar a etapa (não envia)</SelectItem><SelectItem value="empty">Usar texto vazio</SelectItem></SelectContent>
      </Select>
    </div>
  );
  const tpl = templates.find((t: any) => t.name === c.templateName && t.language === c.language);
  const tplVarCount = tpl ? (String(tpl.body ?? "").match(/\{\{\s*\d+\s*\}\}/g) ?? []).length : (c.params ?? []).length;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase text-muted-foreground">{CATEGORY_LABEL[def.category]}</div>
          <div className="font-semibold">{def.label}</div>
          <div className="text-xs text-muted-foreground">ID: <code>{node.id}</code></div>
        </div>
        <div className="flex gap-1">
          {!isTrigger(node.data.type) && <Button size="icon" variant="ghost" title="Duplicar" onClick={onDuplicate}><Copy className="h-4 w-4" /></Button>}
          <Button size="icon" variant="ghost" title="Excluir" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      <div><Label className="text-xs">Nome da etapa</Label><Input value={node.data.label ?? ""} placeholder={def.label} onChange={(e) => onChange({ label: e.target.value })} /></div>

      {node.data.type === "trigger_message_received" && (<>
        <div><Label className="text-xs">Palavra-chave (opcional)</Label><Input value={c.keyword ?? ""} onChange={(e) => set("keyword", e.target.value)} /></div>
        <div><Label className="text-xs">Comparação</Label>
          <Select value={c.match ?? "any"} onValueChange={(v) => set("match", v)}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="any">Contém</SelectItem><SelectItem value="equals">Igual a</SelectItem><SelectItem value="starts_with">Começa com</SelectItem></SelectContent></Select>
        </div>
        <p className="text-xs text-muted-foreground">Respostas para uma automação que está aguardando resposta não iniciam este gatilho.</p>
      </>)}
      {node.data.type === "trigger_tag_added" && <div><Label className="text-xs">Etiqueta</Label><TagSelect k="tagId" /></div>}
      {node.data.type === "trigger_scheduled" && (<>
        <div><Label className="text-xs">Data e horário</Label><Input type="datetime-local" value={c.at ? toLocalInput(c.at) : ""} onChange={(e) => set("at", e.target.value ? new Date(e.target.value).toISOString() : "")} /></div>
        <div><Label className="text-xs">Lista de contatos</Label>
          <Select value={c.listId ?? ""} onValueChange={(v) => set("listId", v)}><SelectTrigger><SelectValue placeholder="Escolha a lista" /></SelectTrigger>
            <SelectContent>{lists.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent></Select>
        </div>
      </>)}
      {node.data.type === "trigger_webhook" && (
        <div className="space-y-1 rounded border p-2 text-xs">
          <div className="font-medium">Endereço (POST)</div>
          <code className="block break-all">{typeof window !== "undefined" ? window.location.origin : ""}/api/public/automations/{automationId}/webhook</code>
          <div className="font-medium">Header x-automation-token</div>
          <code className="block break-all">{wh.data?.token ?? "…"}</code>
          <div className="text-muted-foreground">Corpo JSON: {"{"} "phone": "5562999999999", "name": "...", "event_id": "id-único", "data": {"{ }"} {"}"}</div>
        </div>
      )}
      {node.data.type === "trigger_manual" && <p className="text-xs text-muted-foreground">Inicie pelo botão "Testar" (rascunho) ou, depois de publicada, em modo real para um contato.</p>}

      {node.data.type === "send_template" && (<>
        <div><Label className="text-xs">Template aprovado</Label>
          <Select value={c.templateName ? `${c.templateName}|${c.language}` : ""} onValueChange={(v) => { const [n, l] = v.split("|"); onChange({ config: { ...c, templateName: n, language: l } }); }}>
            <SelectTrigger><SelectValue placeholder={templates.length ? "Escolha" : "Nenhum template aprovado neste número"} /></SelectTrigger>
            <SelectContent>{templates.map((t: any) => <SelectItem key={t.id} value={`${t.name}|${t.language}`}>{t.name} ({t.language})</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {tpl?.body && <p className="whitespace-pre-wrap rounded bg-muted p-2 text-xs">{tpl.body}</p>}
        {Array.from({ length: tplVarCount }).map((_, i) => (
          <div key={i}><Label className="text-xs">{`Parâmetro {{${i + 1}}}`}</Label>
            <VarField value={(c.params ?? [])[i] ?? ""} onChange={(v) => { const p = [...(c.params ?? [])]; p[i] = v; set("params", p); }} /></div>
        ))}
        {tpl && ["image", "video", "document"].includes(String(tpl.header_type ?? "").toLowerCase()) && (
          <div><Label className="text-xs">Link HTTPS do cabeçalho ({tpl.header_type})</Label><VarField value={c.headerUrl ?? ""} onChange={(v) => set("headerUrl", v)} /></div>
        )}
        <Missing />
      </>)}
      {node.data.type === "send_text" && (<><div><Label className="text-xs">Texto</Label><VarField multiline value={c.text ?? ""} onChange={(v) => set("text", v)} /></div><p className="text-xs text-muted-foreground">Só é enviado se a janela de 24h estiver aberta. Fora dela, a etapa falha (não troca sozinho para template).</p><Missing /></>)}
      {node.data.type === "send_media" && (<>
        <div><Label className="text-xs">Tipo</Label>
          <Select value={c.mediaType ?? "image"} onValueChange={(v) => set("mediaType", v)}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="image">Imagem</SelectItem><SelectItem value="video">Vídeo</SelectItem><SelectItem value="document">Documento</SelectItem></SelectContent></Select>
        </div>
        <div><Label className="text-xs">Link HTTPS público</Label><VarField value={c.url ?? ""} onChange={(v) => set("url", v)} /></div>
        <div><Label className="text-xs">Legenda</Label><VarField value={c.caption ?? ""} onChange={(v) => set("caption", v)} /></div>
        {c.mediaType === "document" && <div><Label className="text-xs">Nome do arquivo</Label><Input value={c.filename ?? ""} onChange={(e) => set("filename", e.target.value)} /></div>}
        <Missing />
      </>)}
      {node.data.type === "send_buttons" && (<>
        <div><Label className="text-xs">Texto</Label><VarField multiline value={c.text ?? ""} onChange={(v) => set("text", v)} /></div>
        {(c.buttons ?? []).map((b: any, i: number) => (
          <div key={i} className="flex gap-1">
            <Input className="w-24" placeholder="ID" value={b.id} onChange={(e) => { const bs = [...c.buttons]; bs[i] = { ...b, id: e.target.value.replace(/\s/g, "_") }; set("buttons", bs); }} />
            <Input placeholder="Texto (até 20)" maxLength={20} value={b.title} onChange={(e) => { const bs = [...c.buttons]; bs[i] = { ...b, title: e.target.value }; set("buttons", bs); }} />
            <Button size="icon" variant="ghost" onClick={() => set("buttons", c.buttons.filter((_: any, j: number) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        {(c.buttons ?? []).length < 3 && <Button size="sm" variant="outline" onClick={() => set("buttons", [...(c.buttons ?? []), { id: `op${(c.buttons ?? []).length + 1}`, title: "" }])}>Adicionar botão</Button>}
        <p className="text-xs text-muted-foreground">Use "Aguardar resposta" + "Resposta de botão" com o ID para ramificar.</p>
        <Missing />
      </>)}

      {node.data.type === "cond_reply" && (<>
        <div><Label className="text-xs">Comparação</Label>
          <Select value={c.op} onValueChange={(v) => set("op", v)}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="equals">Igual a</SelectItem><SelectItem value="contains">Contém</SelectItem><SelectItem value="starts_with">Começa com</SelectItem></SelectContent></Select>
        </div>
        <div><Label className="text-xs">Texto</Label><Input value={c.value ?? ""} onChange={(e) => set("value", e.target.value)} /></div>
        <p className="text-xs text-muted-foreground">Sem diferenciar maiúsculas/minúsculas. Compara a última mensagem recebida.</p>
      </>)}
      {node.data.type === "cond_contact_field" && (<>
        <div><Label className="text-xs">Campo</Label><Input value={c.field ?? ""} onChange={(e) => set("field", e.target.value)} placeholder="name, email, phone ou fields.CAMPO" /></div>
        <div><Label className="text-xs">Comparação</Label>
          <Select value={c.op} onValueChange={(v) => set("op", v)}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="equals">Igual a</SelectItem><SelectItem value="contains">Contém</SelectItem><SelectItem value="starts_with">Começa com</SelectItem><SelectItem value="empty">Está vazio</SelectItem><SelectItem value="not_empty">Está preenchido</SelectItem></SelectContent></Select>
        </div>
        {!["empty", "not_empty"].includes(c.op) && <div><Label className="text-xs">Valor</Label><Input value={c.value ?? ""} onChange={(e) => set("value", e.target.value)} /></div>}
      </>)}
      {node.data.type === "cond_has_tag" && <div><Label className="text-xs">Etiqueta</Label><TagSelect k="tagId" /></div>}
      {node.data.type === "cond_button" && <div><Label className="text-xs">ID do botão</Label><Input value={c.buttonId ?? ""} onChange={(e) => set("buttonId", e.target.value)} /></div>}
      {node.data.type === "cond_message_status" && (<>
        <div><Label className="text-xs">Etapa de envio</Label>
          <Select value={c.stepNodeId ?? ""} onValueChange={(v) => set("stepNodeId", v)}><SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
            <SelectContent>{nodes.filter((n) => n.data.type.startsWith("send_")).map((n) => <SelectItem key={n.id} value={n.id}>{n.data.label || BLOCK_MAP[n.data.type].label} ({n.id})</SelectItem>)}</SelectContent></Select>
        </div>
        <div><Label className="text-xs">Status</Label>
          <Select value={c.status} onValueChange={(v) => set("status", v)}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="delivered">Entregue (ou lida)</SelectItem><SelectItem value="read">Lida</SelectItem><SelectItem value="failed">Falhou</SelectItem></SelectContent></Select>
        </div>
        <p className="text-xs text-muted-foreground">Usa só avisos reais da Meta. Coloque uma espera antes para dar tempo de o aviso chegar.</p>
      </>)}

      {node.data.type === "wait_duration" && (
        <div className="flex gap-2">
          <Input type="number" min={1} value={c.amount} onChange={(e) => set("amount", Number(e.target.value))} />
          <Select value={c.unit} onValueChange={(v) => set("unit", v)}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="minutes">Minutos</SelectItem><SelectItem value="hours">Horas</SelectItem><SelectItem value="days">Dias</SelectItem></SelectContent></Select>
        </div>
      )}
      {node.data.type === "wait_until" && <div><Label className="text-xs">Data e horário</Label><Input type="datetime-local" value={c.at ? toLocalInput(c.at) : ""} onChange={(e) => set("at", e.target.value ? new Date(e.target.value).toISOString() : "")} /></div>}
      {node.data.type === "wait_reply" && (<>
        <div><Label className="text-xs">Prazo máximo (minutos)</Label><Input type="number" min={1} value={c.timeoutMinutes} onChange={(e) => set("timeoutMinutes", Number(e.target.value))} /></div>
        <p className="text-xs text-muted-foreground">Um contato só pode ter uma espera ativa por número. Se outra automação passar a aguardar o mesmo contato, a espera mais antiga é cancelada.</p>
      </>)}

      {(node.data.type === "act_add_tag" || node.data.type === "act_remove_tag") && <div><Label className="text-xs">Etiqueta</Label><TagSelect k="tagId" /></div>}
      {node.data.type === "act_update_field" && (<>
        <div><Label className="text-xs">Campo</Label>
          <Select value={["name", "email"].includes(c.field) ? c.field : "custom"} onValueChange={(v) => set("field", v === "custom" ? "fields." : v)}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="name">Nome</SelectItem><SelectItem value="email">E-mail</SelectItem><SelectItem value="custom">Campo personalizado</SelectItem></SelectContent></Select>
        </div>
        {!["name", "email"].includes(c.field) && <div><Label className="text-xs">Nome do campo</Label><Input value={String(c.field ?? "").replace(/^fields\./, "")} onChange={(e) => set("field", `fields.${e.target.value.replace(/[^a-zA-Z0-9_]/g, "")}`)} /></div>}
        <div><Label className="text-xs">Valor</Label><VarField value={c.value ?? ""} onChange={(v) => set("value", v)} /></div>
        <Missing />
      </>)}
      {node.data.type === "act_handoff" && (<>
        <div><Label className="text-xs">Nota para o atendente (opcional)</Label><Input value={c.note ?? ""} onChange={(e) => set("note", e.target.value)} /></div>
        <p className="text-xs text-muted-foreground">Distribui a conversa para a equipe do cliente e encerra a automação. Enquanto houver atendente na conversa, outras automações não enviam mensagens para esse contato.</p>
      </>)}
      {node.data.type === "act_http" && (<>
        <div className="flex gap-2">
          <Select value={c.method} onValueChange={(v) => set("method", v)}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select>
          <div className="flex-1"><VarField value={c.url ?? ""} onChange={(v) => set("url", v)} placeholder="https://…" /></div>
        </div>
        <div><Label className="text-xs">Headers (um por linha, Nome: valor)</Label><Textarea rows={2} value={c.headers ?? ""} onChange={(e) => set("headers", e.target.value)} /></div>
        {c.method !== "GET" && <div><Label className="text-xs">Corpo</Label><VarField multiline value={c.body ?? ""} onChange={(v) => set("body", v)} /></div>}
        <p className="text-xs text-muted-foreground">Somente HTTPS, sem endereços internos, 10 s de limite e resposta até 64 KB. Resultado em {`{{steps.${node.id}.status}}`} e {`{{steps.${node.id}.body}}`}.</p>
        <Missing />
      </>)}
      {node.data.type === "end" && <p className="text-xs text-muted-foreground">Finaliza a execução.</p>}
    </div>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

function TestDialog({ open, onOpenChange, automationId, status, triggerType }: { open: boolean; onOpenChange: (o: boolean) => void; automationId: string; status: string; triggerType: string | null }) {
  const run = useServerFn(runAutomation);
  const [mode, setMode] = useState<"simulate" | "test_real" | "live">("simulate");
  const [phone, setPhone] = useState("");
  const [reply, setReply] = useState("");
  const [buttonId, setButtonId] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => run({ data: { id: automationId, mode, phone: phone.replace(/\D/g, ""), simulatedReply: reply || undefined, simulatedButtonId: buttonId || undefined, confirmReal: confirm } }),
    onSuccess: (r) => {
      if (!r.ok) { toast.error(r.issues.map((i: any) => i.message).slice(0, 3).join(" · ")); return; }
      setRunId(r.runId);
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setRunId(null); setConfirm(false); } }}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Testar automação</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Select value={mode} onValueChange={(v: any) => { setMode(v); setConfirm(false); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="simulate">Simulação (rascunho, nada é enviado)</SelectItem>
              <SelectItem value="test_real">Teste real (rascunho, envia de verdade)</SelectItem>
              {status === "active" && triggerType === "manual" && <SelectItem value="live">Execução manual (versão publicada)</SelectItem>}
            </SelectContent>
          </Select>
          <div><Label>Telefone do contato (com DDI)</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="5562999999999" /></div>
          {mode === "simulate" ? (<>
            <div><Label>Resposta simulada do contato (vazio = prazo encerrado)</Label><Input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Ex.: quero atendimento" /></div>
            <div><Label>ID de botão simulado (opcional)</Label><Input value={buttonId} onChange={(e) => setButtonId(e.target.value)} /></div>
            <p className="text-xs text-muted-foreground">Na simulação as esperas passam na hora, nenhuma mensagem é enviada e nenhum contato ou etiqueta é alterado.</p>
          </>) : (
            <label className="flex items-start gap-2 rounded border border-destructive/40 p-2 text-sm">
              <Checkbox checked={confirm} onCheckedChange={(v) => setConfirm(!!v)} />
              <span>Confirmo o envio REAL de mensagens WhatsApp para este número. Esperas e respostas acontecem de verdade.</span>
            </label>
          )}
          {runId && <div className="rounded-lg border"><RunDetail runId={runId} /></div>}
        </div>
        <DialogFooter>
          <Button disabled={phone.replace(/\D/g, "").length < 10 || (mode !== "simulate" && !confirm) || m.isPending} onClick={() => m.mutate()}>
            {mode === "simulate" ? "Simular" : "Executar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
