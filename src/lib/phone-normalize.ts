export type NormalizedRow = { phone: string; name?: string };

export type ImportSummary = {
  total: number;
  valid: number;
  fixed: number;
  invalid: number;
  duplicates: number;
  missingPhone: number;
  missingName: number;
  rows: NormalizedRow[];
  invalidSamples: Array<{ raw: string; reason: string }>;
};

/**
 * Normaliza um número brasileiro para o padrão 55DDDNUMERO.
 * Retorna null quando não for possível validar.
 */
export function normalizeBRPhone(raw: string): { phone: string | null; changed: boolean; reason?: string } {
  const original = String(raw ?? "").trim();
  if (!original) return { phone: null, changed: false, reason: "vazio" };

  let d = original.replace(/\D/g, "");
  // remove zeros de operadora/tronco à esquerda (ex: 0062..., 00 55...)
  d = d.replace(/^0+/, "");

  if (d.length < 8) return { phone: null, changed: false, reason: "curto demais" };

  let out: string;
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    out = d;
  } else if (d.length === 10 || d.length === 11) {
    out = `55${d}`;
  } else if (d.length === 12 || d.length === 13) {
    // provavelmente internacional não-BR
    return { phone: null, changed: false, reason: "DDI não suportado" };
  } else {
    return { phone: null, changed: false, reason: "tamanho inválido" };
  }

  const ddd = Number(out.slice(2, 4));
  if (ddd < 11 || ddd > 99) return { phone: null, changed: false, reason: "DDD inválido" };

  const rest = out.slice(4);
  if (rest.length === 9 && rest[0] !== "9") return { phone: null, changed: false, reason: "número inválido" };
  if (rest.length !== 8 && rest.length !== 9) return { phone: null, changed: false, reason: "tamanho inválido" };

  return { phone: out, changed: out !== original };
}

export function buildImportSummary(
  input: Array<{ phone: string; name?: string }>,
): ImportSummary {
  const seen = new Set<string>();
  const rows: NormalizedRow[] = [];
  const invalidSamples: ImportSummary["invalidSamples"] = [];
  let fixed = 0, invalid = 0, duplicates = 0, missingPhone = 0, missingName = 0;

  for (const item of input) {
    const rawPhone = String(item.phone ?? "").trim();
    const name = String(item.name ?? "").trim();
    if (!name) missingName++;
    if (!rawPhone) { missingPhone++; invalid++; continue; }

    const { phone, changed, reason } = normalizeBRPhone(rawPhone);
    if (!phone) {
      invalid++;
      if (invalidSamples.length < 10) invalidSamples.push({ raw: rawPhone, reason: reason || "inválido" });
      continue;
    }
    if (changed) fixed++;
    if (seen.has(phone)) { duplicates++; continue; }
    seen.add(phone);
    rows.push({ phone, name: name || undefined });
  }

  return {
    total: input.length,
    valid: rows.length,
    fixed,
    invalid,
    duplicates,
    missingPhone,
    missingName,
    rows,
    invalidSamples,
  };
}
