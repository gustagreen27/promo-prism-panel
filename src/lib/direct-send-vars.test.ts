import { describe, it, expect } from "vitest";
import { applyCustomVars, validateCustomVars, parseVarValues, pickDirectText, validateDirectConfig } from "./direct-send";

const txt = "Oi, (nome)! Pendência: (pendência real). Pode verificar?";
const rot = [{ name: "pendência real", mode: "rotate" as const, values: ["A", "B", "C"] }];

describe("variáveis personalizadas do Direct Send", () => {
  it("alterna em sequência e volta ao primeiro", () => {
    expect([0, 1, 2, 3].map((i) => applyCustomVars(txt, rot, { index: i }).text.match(/Pendência: (\w)/)![1])).toEqual(["A", "B", "C", "A"]);
  });
  it("mantém (nome) para a troca do sistema", () => {
    expect(applyCustomVars(txt, rot, { index: 0 }).text).toContain("(nome)");
  });
  it("coluna usa o valor real do contato", () => {
    const v = [{ name: "pendência real", mode: "column" as const, values: ["Reserva"], column: "pendencia" }];
    expect(applyCustomVars(txt, v, { index: 0, fields: { Pendencia: "E-mail incorreto" } }).text).toContain("E-mail incorreto");
    expect(applyCustomVars(txt, v, { index: 0, fields: {} }).text).toContain("Reserva");
  });
  it("coluna sem valor e sem reserva não envia", () => {
    const v = [{ name: "pendência real", mode: "column" as const, values: [], column: "pendencia" }];
    expect(applyCustomVars(txt, v, { index: 0, fields: {} }).missing).toEqual(["pendência real"]);
  });
  it("bloqueia variável usada sem valores", () => {
    expect(validateCustomVars(txt, [{ name: "pendência real", mode: "rotate", values: [] }]).length).toBe(1);
  });
  it("aceita vírgula ou um por linha", () => {
    expect(parseVarValues("a, b ,c")).toEqual(["a", "b", "c"]);
    expect(parseVarValues("a, x\nb")).toEqual(["a, x", "b"]);
  });
});

describe("variações da mensagem", () => {
  const base = "Oi, (nome)! Mensagem principal.";
  const vars = ["Variação dois", "Variação três"];
  it("alterna principal e variações em sequência e volta ao início", () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => pickDirectText(base, vars, i)))
      .toEqual([base, "Variação dois", "Variação três", base, "Variação dois", "Variação três"]);
  });
  it("ignora variações vazias", () => {
    expect(pickDirectText(base, ["", "  "], 1)).toBe(base);
  });
  it("sem variações, todos recebem a principal", () => {
    expect(pickDirectText(base, null, 7)).toBe(base);
  });
  it("bloqueia variação igual à principal", () => {
    const errs = validateDirectConfig(base, { header_type: "none", buttons_type: "none", message_variants: [base] } as any);
    expect(errs.some((e) => e.includes("igual à mensagem principal"))).toBe(true);
  });
  it("exige valores de variável usada só numa variação", () => {
    const errs = validateDirectConfig(base, {
      header_type: "none", buttons_type: "none",
      message_variants: ["Oi, (nome)! Sobre: (pendência real)."],
      custom_vars: [{ name: "pendência real", mode: "rotate", values: [] }],
    } as any);
    expect(errs.some((e) => e.includes("pendência real"))).toBe(true);
  });
});
