import type { AutoGraph, AutoEdge } from "./automation-graph";

/** Collapse only the initial legacy button-check chain, without changing the saved graph. */
export function legacyButtonPresentation(graph: AutoGraph) {
  const trigger = graph.nodes.find((n) => n.type === "trigger_campaign_reply");
  const empty = { triggerId: null as string | null, hiddenNodeIds: [] as string[], hiddenEdgeIds: [] as string[], outputs: [] as { id: string; label: string; source: string; sourceHandle: string }[], edges: graph.edges };
  if (!trigger || trigger.data.config.buttons?.length) return empty;
  const first = graph.edges.filter((e) => e.source === trigger.id);
  if (first.length !== 1 || (first[0].sourceHandle ?? "out") !== "out") return empty;
  let incoming: AutoEdge | undefined = first[0];
  const hiddenNodeIds: string[] = [], hiddenEdgeIds: string[] = [];
  const outputs: typeof empty.outputs = [];
  const redirected = new Map<string, string>();
  const buttonIds = new Set<string>();
  while (incoming) {
    const node = graph.nodes.find((n) => n.id === incoming?.target);
    if (!node || node.type !== "cond_button" || hiddenNodeIds.includes(node.id)) break;
    const buttonId = String(node.data.config.buttonId ?? "");
    const outgoing = graph.edges.filter((e) => e.source === node.id);
    const yes = outgoing.find((e) => e.sourceHandle === "true");
    const no = outgoing.find((e) => e.sourceHandle === "false");
    if (!buttonId || buttonIds.has(buttonId) || !yes || !no || outgoing.length !== 2 || graph.edges.filter((e) => e.target === node.id).length !== 1) return empty;
    buttonIds.add(buttonId);
    hiddenNodeIds.push(node.id); hiddenEdgeIds.push(incoming.id);
    const label = node.data.label?.match(/["“](.*?)["”]/)?.[1] || node.data.label || buttonId;
    const handle = `legacy:${node.id}:true`;
    outputs.push({ id: handle, label, source: node.id, sourceHandle: "true" });
    redirected.set(yes.id, handle);
    incoming = no;
  }
  if (!hiddenNodeIds.length || !incoming || hiddenNodeIds.includes(incoming.target)) return empty;
  const other = `legacy:${incoming.source}:false`;
  outputs.push({ id: other, label: "Outra resposta", source: incoming.source, sourceHandle: "false" });
  redirected.set(incoming.id, other);
  return {
    triggerId: trigger.id, hiddenNodeIds, hiddenEdgeIds, outputs,
    edges: graph.edges.filter((e) => !hiddenEdgeIds.includes(e.id)).map((e) => {
      const handle = redirected.get(e.id);
      return handle ? { ...e, source: trigger.id, sourceHandle: handle } : e;
    }),
  };
}