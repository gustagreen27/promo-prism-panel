/**
 * Isomorphic template variable renderer for WhatsApp campaigns.
 *
 * A "mapping value" is a string that combines literal text with dynamic tokens.
 * Tokens are wrapped in single braces: `{token}`. Templates variables from Meta
 * use double braces `{{n}}` and are handled at a higher level (see resolveMeta).
 *
 * Fallback syntax inside a token: {a|b|"literal"}
 *   - resolves to context.a, then context.b, then the literal "literal"
 *   - literals must be double-quoted; unquoted terms are treated as tokens
 *
 * Example mapping: "Olá {primeiro_nome|nome|\"amigo\"}, seu código é {codigo}"
 */

export type Ctx = Record<string, string | number | null | undefined>;

// Matches either {token} or {{token}}. Purely-numeric tokens like {{1}} are
// left untouched so Meta's own template variable syntax survives at higher
// layers (fillMetaTemplate handles those separately).
const TOKEN_RE = /\{\{?\s*([^{}]+?)\s*\}\}?/g;

export function renderMapping(mapping: string, ctx: Ctx): string {
  if (!mapping) return "";
  return mapping.replace(TOKEN_RE, (match, expr: string) => {
    const trimmed = expr.trim();
    // Preserve Meta-style numeric placeholders untouched (e.g. {{1}}).
    if (/^\d+$/.test(trimmed)) return match;
    return resolveToken(trimmed, ctx);
  });
}

function resolveToken(expr: string, ctx: Ctx): string {
  const parts = expr.split("|").map((p) => p.trim()).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    // Quoted literal: always used as-is.
    if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) {
      return p.slice(1, -1);
    }
    // Bare token identifier (lowercase snake): look up in context.
    const isIdent = /^[a-z_][a-z0-9_]*$/.test(p);
    if (isIdent) {
      const v = ctx[p];
      if (v !== null && v !== undefined && String(v).trim() !== "") return String(v);
      continue; // try next fallback
    }
    // Anything else (contains uppercase, spaces, punctuation, digits-first, etc.)
    // is treated as a literal fallback — e.g. {nome|Cliente} or {nome|"Cliente"} or {nome|amigo cliente}.
    return p;
  }
  return ""; // all empty
}

/** Return the list of token names referenced by a mapping (excluding literals). */
export function tokensIn(mapping: string): string[] {
  const out: string[] = [];
  for (const m of mapping.matchAll(TOKEN_RE)) {
    for (const p of m[1].split("|").map((s) => s.trim())) {
      if (!p) continue;
      if (p.startsWith('"') || p.startsWith("'")) continue;
      if (!out.includes(p)) out.push(p);
    }
  }
  return out;
}

/** Extract {{n}} variables from a Meta template body/header/button URL. */
export function metaVarsIn(text: string): number[] {
  const nums = new Set<number>();
  for (const m of text.matchAll(/\{\{(\d+)\}\}/g)) nums.add(Number(m[1]));
  return [...nums].sort((a, b) => a - b);
}

/** Replace {{1}}, {{2}} in a Meta template text with resolved values. */
export function fillMetaTemplate(text: string, resolvedByIndex: Record<number, string>): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_m, n) => resolvedByIndex[Number(n)] ?? "");
}

/** Build the Ctx from a contact + client + project + campaign snapshot. */
export function buildContext(input: {
  contact?: any;
  client?: any;
  project?: any;
  campaign?: any;
  responsavel?: any;
  extra?: Record<string, string>;
}): Ctx {
  const c = input.contact ?? {};
  const cli = input.client ?? {};
  const proj = input.project ?? {};
  const camp = input.campaign ?? {};
  const resp = input.responsavel ?? {};
  const nome = c.name ?? "";
  const first = nome ? String(nome).split(/\s+/)[0] : "";
  return {
    nome,
    primeiro_nome: first,
    telefone: c.phone ?? "",
    email: c.email ?? "",
    cliente: cli.name ?? "",
    projeto: proj.name ?? "",
    protocolo: c.protocolo ?? c.custom?.protocolo ?? "",
    codigo_comprovante: c.codigo_comprovante ?? c.custom?.codigo_comprovante ?? "",
    data: new Date().toLocaleDateString("pt-BR"),
    link: camp.link ?? "",
    responsavel: resp.name ?? resp.email ?? "",
    empresa: cli.name ?? "",
    ...(c.custom ?? {}),
    ...(input.extra ?? {}),
  };
}

export const DEFAULT_TOKENS = [
  "nome",
  "primeiro_nome",
  "telefone",
  "email",
  "cliente",
  "projeto",
  "protocolo",
  "codigo_comprovante",
  "data",
  "link",
  "responsavel",
  "empresa",
] as const;
