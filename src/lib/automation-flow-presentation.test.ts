import { describe, expect, it } from "vitest";
import type { AutoGraph } from "./automation-graph";
import { legacyButtonPresentation } from "./automation-flow-presentation";

const graph: AutoGraph = {
  schema: 1,
  nodes: [
    { id: "start", type: "trigger_campaign_reply", position: { x: 0, y: 0 }, data: { config: {} } },
    { id: "check1", type: "cond_button", position: { x: 300, y: 0 }, data: { label: 'Botão "Verificar Recado"', config: { buttonId: "opcao_1" } } },
    { id: "check2", type: "cond_button", position: { x: 600, y: 0 }, data: { label: 'Botão "cancelar"', config: { buttonId: "opcao_2" } } },
  ],
  edges: [
    { id: "entry", source: "start", target: "check1", sourceHandle: "out" },
    { id: "yes1", source: "check1", target: "message", sourceHandle: "true" },
    { id: "no1", source: "check1", target: "check2", sourceHandle: "false" },
    { id: "yes2", source: "check2", target: "blacklist", sourceHandle: "true" },
    { id: "no2", source: "check2", target: "handoff", sourceHandle: "false" },
  ],
};

describe("legacy button presentation preserves saved execution", () => {
  it("maps each displayed button back to its original check and true handle", () => {
    const before = structuredClone(graph);
    const result = legacyButtonPresentation(graph);
    expect(result.outputs).toEqual([
      { id: "legacy:check1:true", label: "Verificar Recado", source: "check1", sourceHandle: "true" },
      { id: "legacy:check2:true", label: "cancelar", source: "check2", sourceHandle: "true" },
      { id: "legacy:check2:false", label: "Outra resposta", source: "check2", sourceHandle: "false" },
    ]);
    expect(result.edges.map((e) => [e.id, e.source, e.target])).toEqual([
      ["yes1", "start", "message"], ["yes2", "start", "blacklist"], ["no2", "start", "handoff"],
    ]);
    expect(graph).toEqual(before);
  });
  it("does not collapse checks shared with another path", () => {
    const shared = structuredClone(graph);
    shared.edges.push({ id: "shared", source: "another", target: "check2", sourceHandle: "out" });
    expect(legacyButtonPresentation(shared).hiddenNodeIds).toEqual([]);
  });
  it("keeps modern button graphs intact", () => {
    const modern = structuredClone(graph);
    modern.nodes[0].data.config.buttons = [{ id: "opcao_1", title: "Verificar Recado" }];
    expect(legacyButtonPresentation(modern).edges).toEqual(modern.edges);
  });
});