import { describe, it, expect } from "vitest";
import { validateGraph, exampleGraph, replyFlowGraph, renderVars, mergeDeliveryStatus, evalCompare, MissingVariableError, type AutoGraph } from "./automation-graph";
import { isBlockedHost } from "./automation-engine.server";

const filled = (): AutoGraph => {
  const g = exampleGraph();
  g.nodes.find((n) => n.id === "tpl")!.data.config.templateName = "boas_vindas";
  g.nodes.find((n) => n.id === "tag")!.data.config.tagId = "t1";
  return g;
};

describe("validação do fluxo", () => {
  it("modelo inicial configurado é válido", () => {
    expect(validateGraph(filled())).toEqual([]);
  });
  it("modelo sem template/etiqueta acusa configuração faltando", () => {
    const msgs = validateGraph(exampleGraph()).map((i) => i.message);
    expect(msgs).toContain("Escolha o template");
    expect(msgs).toContain("Escolha a etiqueta");
  });
  it("bloqueia ciclos", () => {
    const g = filled();
    g.edges = g.edges.filter((e) => e.id !== "e7");
    g.edges.push({ id: "loop", source: "msg", target: "wait", sourceHandle: "out" });
    expect(validateGraph(g).some((i) => i.message.includes("ciclo"))).toBe(true);
  });
  it("bloqueia execução paralela (duas conexões na mesma saída)", () => {
    const g = filled();
    g.edges.push({ id: "par", source: "tpl", target: "tag", sourceHandle: "out" });
    expect(validateGraph(g).some((i) => i.message.includes("paralela"))).toBe(true);
  });
  it("exige caminho até o encerramento", () => {
    const g = filled();
    g.edges = g.edges.filter((e) => e.id !== "e8");
    expect(validateGraph(g).some((i) => i.nodeId === "tag")).toBe(true);
  });
  it("rejeita variável desconhecida", () => {
    const g = filled();
    g.nodes.find((n) => n.id === "msg")!.data.config.text = "Oi {{usuario.senha}}";
    expect(validateGraph(g).some((i) => i.message.includes("Variável desconhecida"))).toBe(true);
  });
  it("fluxo gerado a partir dos botões do Direct Send é válido", () => {
    expect(validateGraph(replyFlowGraph([{ id: "sim", title: "Sim" }, { id: "nao", title: "Não" }]))).toEqual([]);
  });
});

describe("variáveis", () => {
  const ctx = { contact: { name: "Ana", phone: "5562", fields: { cidade: "Anápolis" } }, message: { text: "oi" }, steps: { h: { status: 200 } } };
  it("substitui contato, campo, mensagem e etapa", () => {
    expect(renderVars("{{contact.name}} {{contact.fields.cidade}} {{message.text}} {{steps.h.status}}", ctx)).toBe("Ana Anápolis oi 200");
  });
  it("valor ausente: falha ou vazio conforme configuração", () => {
    expect(() => renderVars("{{contact.email}}", ctx, "fail")).toThrow(MissingVariableError);
    expect(renderVars("x{{contact.email}}y", ctx, "empty")).toBe("xy");
  });
});

describe("regras de execução", () => {
  it("status de entrega nunca regride", () => {
    expect(mergeDeliveryStatus("read", "sent")).toBe("read");
    expect(mergeDeliveryStatus("sent", "delivered")).toBe("delivered");
    expect(mergeDeliveryStatus("delivered", "failed")).toBe("failed");
  });
  it("comparação de resposta sem diferenciar maiúsculas", () => {
    expect(evalCompare("contains", "Quero ATENDIMENTO", "atendimento")).toBe(true);
    expect(evalCompare("starts_with", "não", "sim")).toBe(false);
  });
  it("bloqueia destinos internos na requisição HTTP", () => {
    for (const h of ["localhost", "127.0.0.1", "10.0.0.5", "192.168.1.1", "169.254.169.254", "172.20.0.1", "::1", "2130706433", "foo.internal"]) expect(isBlockedHost(h)).toBe(true);
    expect(isBlockedHost("api.example.com")).toBe(false);
  });
});
