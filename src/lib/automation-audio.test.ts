import { expect, it } from "vitest";
import { replyFlowGraph, validateGraph } from "./automation-graph";

it("permite publicar áudio carregado sem um link permanente", () => {
  const graph = replyFlowGraph([{ id: "sim", title: "Sim" }]);
  const message = graph.nodes.find((n) => n.type === "send_text");
  if (!message) throw new Error("Mensagem ausente");
  message.type = "send_media";
  message.data.config = { mediaType: "audio", mediaPath: "automation-audio/12345678-abcd-1234-abcd-123456789abc.mp3", url: "" };
  expect(validateGraph(graph)).toEqual([]);
  message.data.config.mediaPath = "";
  expect(validateGraph(graph).some((issue) => issue.nodeId === message.id)).toBe(true);
});