// Modelo, catálogo de blocos, validação e variáveis das Automações.
// Módulo puro (sem I/O): usado pelo editor (browser) e pelo motor (servidor).

export type AutoNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: { label?: string; config: Record<string, any> };
};
export type AutoEdge = { id: string; source: string; target: string; sourceHandle?: string | null };
export type AutoGraph = { schema: 1; nodes: AutoNode[]; edges: AutoEdge[] };

export type BlockCategory = "trigger" | "whatsapp" | "condition" | "wait" | "action";

export type BlockDef = {
  type: string;
  category: BlockCategory;
  label: string;
  description: string;
  outputs: { id: string; label: string }[];
  defaults: Record<string, any>;
};

const OUT = [{ id: "out", label: "" }];
const TF = [
  { id: "true", label: "Verdadeiro" },
  { id: "false", label: "Falso" },
];

export const BLOCKS: BlockDef[] = [
  { type: "trigger_manual", category: "trigger", label: "Execução manual", description: "Iniciada pelo painel para um contato.", outputs: OUT, defaults: {} },
  { type: "trigger_contact_created", category: "trigger", label: "Contato criado", description: "Quando um contato é cadastrado no cliente.", outputs: OUT, defaults: {} },
  { type: "trigger_message_received", category: "trigger", label: "Mensagem recebida", description: "Mensagem recebida no número WhatsApp da automação.", outputs: OUT, defaults: { keyword: "", match: "any" } },
  { type: "trigger_tag_added", category: "trigger", label: "Etiqueta adicionada", description: "Quando uma etiqueta é adicionada ao contato.", outputs: OUT, defaults: { tagId: "" } },
  { type: "trigger_campaign_reply", category: "trigger", label: "Resposta a um disparo", description: "Lead respondeu (texto ou botão) a um Direct Send vinculado.", outputs: OUT, defaults: {} },
  { type: "trigger_webhook", category: "trigger", label: "Webhook externo", description: "Chamada autenticada de outro sistema.", outputs: OUT, defaults: {} },
  { type: "trigger_scheduled", category: "trigger", label: "Data e horário", description: "Executa uma vez para os contatos de uma lista.", outputs: OUT, defaults: { at: "", listId: "" } },

  { type: "send_template", category: "whatsapp", label: "Enviar template", description: "Template aprovado pela Meta.", outputs: OUT, defaults: { templateName: "", language: "pt_BR", params: [], headerUrl: "", onMissing: "fail" } },
  { type: "send_text", category: "whatsapp", label: "Enviar texto", description: "Só dentro da janela de 24h.", outputs: OUT, defaults: { text: "", onMissing: "fail" } },
  { type: "send_media", category: "whatsapp", label: "Enviar mídia", description: "Imagem, vídeo ou documento (janela de 24h).", outputs: OUT, defaults: { mediaType: "image", url: "", caption: "", filename: "", onMissing: "fail" } },
  { type: "send_buttons", category: "whatsapp", label: "Enviar botões", description: "Até 3 botões de resposta (janela de 24h).", outputs: OUT, defaults: { text: "", buttons: [{ id: "sim", title: "Sim" }], onMissing: "fail" } },

  { type: "cond_reply", category: "condition", label: "Conteúdo da resposta", description: "Compara o texto recebido.", outputs: TF, defaults: { op: "contains", value: "" } },
  { type: "cond_contact_field", category: "condition", label: "Campo do contato", description: "Compara um campo do contato.", outputs: TF, defaults: { field: "name", op: "not_empty", value: "" } },
  { type: "cond_has_tag", category: "condition", label: "Tem etiqueta", description: "Verifica se o contato tem a etiqueta.", outputs: TF, defaults: { tagId: "" } },
  { type: "cond_button", category: "condition", label: "Resposta de botão", description: "Compara o identificador do botão tocado.", outputs: TF, defaults: { buttonId: "" } },
  { type: "cond_message_status", category: "condition", label: "Status da mensagem", description: "Status real informado pela Meta.", outputs: TF, defaults: { stepNodeId: "", status: "delivered" } },

  { type: "wait_duration", category: "wait", label: "Aguardar tempo", description: "Pausa por um período.", outputs: OUT, defaults: { amount: 10, unit: "minutes" } },
  { type: "wait_until", category: "wait", label: "Aguardar até", description: "Pausa até data e horário.", outputs: OUT, defaults: { at: "" } },
  { type: "wait_reply", category: "wait", label: "Aguardar resposta", description: "Espera o contato responder, com prazo.", outputs: [{ id: "replied", label: "Respondeu" }, { id: "timeout", label: "Prazo encerrado" }], defaults: { timeoutMinutes: 30 } },

  { type: "act_add_tag", category: "action", label: "Adicionar etiqueta", description: "", outputs: OUT, defaults: { tagId: "" } },
  { type: "act_remove_tag", category: "action", label: "Remover etiqueta", description: "", outputs: OUT, defaults: { tagId: "" } },
  { type: "act_update_field", category: "action", label: "Atualizar campo", description: "Nome, e-mail ou campo personalizado.", outputs: OUT, defaults: { field: "name", value: "", onMissing: "fail" } },
  { type: "act_handoff", category: "action", label: "Encaminhar para atendente", description: "Distribui para a equipe e encerra a automação.", outputs: [], defaults: { note: "" } },
  { type: "act_http", category: "action", label: "Requisição HTTP", description: "Chamada HTTPS feita pelo servidor.", outputs: OUT, defaults: { method: "POST", url: "", headers: "", body: "", onMissing: "fail" } },
  { type: "end", category: "action", label: "Encerrar", description: "Finaliza a execução.", outputs: [], defaults: {} },
];

export const BLOCK_MAP: Record<string, BlockDef> = Object.fromEntries(BLOCKS.map((b) => [b.type, b]));
export const isTrigger = (t: string) => t.startsWith("trigger_");
export const isTerminal = (t: string) => (BLOCK_MAP[t]?.outputs.length ?? 0) === 0;

export const CATEGORY_LABEL: Record<BlockCategory, string> = {
  trigger: "Gatilhos",
  whatsapp: "WhatsApp",
  condition: "Condições",
  wait: "Esperas",
  action: "Ações",
};

export const CONTACT_FIELDS = [
  { id: "name", label: "Nome" },
  { id: "email", label: "E-mail" },
];

// ───────────── Variáveis ─────────────
export const VARIABLES: { token: string; label: string }[] = [
  { token: "contact.name", label: "Nome do contato" },
  { token: "contact.phone", label: "Telefone do contato" },
  { token: "contact.email", label: "E-mail do contato" },
  { token: "contact.fields.CAMPO", label: "Campo personalizado" },
  { token: "message.text", label: "Mensagem recebida" },
  { token: "button.id", label: "ID do botão tocado" },
  { token: "button.title", label: "Texto do botão tocado" },
  { token: "trigger.CHAVE", label: "Dado do gatilho" },
  { token: "steps.ETAPA.CHAVE", label: "Resultado de etapa anterior" },
];

const VAR_RE = /\{\{\s*([a-zA-Z0-9_.\-]+)\s*\}\}/g;
const ROOTS = ["contact", "message", "button", "trigger", "steps"];

export function varsIn(text: string): string[] {
  const out: string[] = [];
  for (const m of String(text ?? "").matchAll(VAR_RE)) out.push(m[1]);
  return out;
}

export function validVar(v: string): boolean {
  const parts = v.split(".");
  if (!ROOTS.includes(parts[0])) return false;
  if (parts[0] === "contact") return ["name", "phone", "email"].includes(parts[1]) || (parts[1] === "fields" && !!parts[2]);
  if (parts[0] === "message") return parts[1] === "text";
  if (parts[0] === "button") return ["id", "title"].includes(parts[1]);
  if (parts[0] === "trigger") return parts.length >= 2;
  if (parts[0] === "steps") return parts.length >= 3;
  return false;
}

export type VarContext = {
  contact?: { name?: string | null; phone?: string | null; email?: string | null; fields?: Record<string, any> };
  message?: { text?: string | null };
  button?: { id?: string | null; title?: string | null };
  trigger?: Record<string, any>;
  steps?: Record<string, Record<string, any>>;
};

function lookup(path: string, ctx: VarContext): string | null {
  let cur: any = ctx;
  for (const p of path.split(".")) {
    if (cur == null) return null;
    cur = cur[p];
  }
  if (cur == null || cur === "") return null;
  return typeof cur === "object" ? JSON.stringify(cur) : String(cur);
}

/** Substitui variáveis. onMissing="fail" lança erro; "empty" usa texto vazio. */
export function renderVars(text: string, ctx: VarContext, onMissing: "fail" | "empty" = "fail"): string {
  const missing: string[] = [];
  const out = String(text ?? "").replace(VAR_RE, (_m, v: string) => {
    const val = lookup(v, ctx);
    if (val == null) {
      missing.push(v);
      return "";
    }
    return val;
  });
  if (missing.length && onMissing === "fail") {
    throw new MissingVariableError(missing);
  }
  return out;
}

export class MissingVariableError extends Error {
  constructor(public vars: string[]) {
    super(`Variável sem valor: ${vars.join(", ")}`);
  }
}

// ───────────── Resumo exibido no bloco ─────────────
export function summarize(n: AutoNode, names?: { tags?: Record<string, string>; lists?: Record<string, string> }): string {
  const c = n.data?.config ?? {};
  const tag = (id: string) => names?.tags?.[id] ?? (id ? "etiqueta" : "—");
  switch (n.type) {
    case "trigger_campaign_reply": return "Disparos vinculados a esta automação";
    case "trigger_message_received": return c.keyword ? `Contém "${c.keyword}"` : "Qualquer mensagem";
    case "trigger_tag_added": return tag(c.tagId);
    case "trigger_scheduled": return c.at ? `${new Date(c.at).toLocaleString("pt-BR")} · ${names?.lists?.[c.listId] ?? "lista"}` : "Sem data";
    case "send_template": return c.templateName ? `${c.templateName} (${c.language})` : "Sem template";
    case "send_text": return c.text ? String(c.text).slice(0, 60) : "Sem texto";
    case "send_media": return `${c.mediaType ?? "image"} · ${c.url ? "com link" : "sem link"}`;
    case "send_buttons": return `${(c.buttons ?? []).length} botão(ões)`;
    case "cond_reply": return `${({ equals: "Igual a", contains: "Contém", starts_with: "Começa com" } as any)[c.op] ?? c.op} "${c.value ?? ""}"`;
    case "cond_contact_field": return `${c.field} ${c.op} ${c.value ?? ""}`.trim();
    case "cond_has_tag": return tag(c.tagId);
    case "cond_button": return c.buttonId ? `Botão = ${c.buttonId}` : "Sem botão";
    case "cond_message_status": return `Status ${c.status}`;
    case "wait_duration": return `${c.amount} ${({ minutes: "min", hours: "h", days: "dia(s)" } as any)[c.unit] ?? c.unit}`;
    case "wait_until": return c.at ? new Date(c.at).toLocaleString("pt-BR") : "Sem data";
    case "wait_reply": return `Prazo ${c.timeoutMinutes} min`;
    case "act_add_tag": case "act_remove_tag": return tag(c.tagId);
    case "act_update_field": return `${c.field} = ${c.value}`;
    case "act_http": return `${c.method} ${c.url ? safeHost(c.url) : "—"}`;
    case "act_handoff": return "Distribuição automática";
    default: return BLOCK_MAP[n.type]?.description ?? "";
  }
}
function safeHost(u: string) { try { return new URL(u).host; } catch { return u.slice(0, 30); } }

// ───────────── Validação ─────────────
export type ValidationIssue = { nodeId?: string; message: string };

function requiredConfig(n: AutoNode): string[] {
  const c = n.data?.config ?? {};
  const errs: string[] = [];
  const need = (cond: boolean, msg: string) => { if (!cond) errs.push(msg); };
  switch (n.type) {
    case "trigger_tag_added": need(!!c.tagId, "Escolha a etiqueta"); break;
    case "trigger_scheduled": need(!!c.at && !isNaN(Date.parse(c.at)), "Informe data e horário"); need(!!c.listId, "Escolha a lista"); break;
    case "send_template": need(!!c.templateName, "Escolha o template"); need(!!c.language, "Informe o idioma"); break;
    case "send_text": need(!!String(c.text ?? "").trim(), "Escreva o texto"); break;
    case "send_media": need(/^https:\/\//.test(String(c.url ?? "")) || varsIn(c.url).length > 0, "Informe o link HTTPS da mídia"); break;
    case "send_buttons": {
      need(!!String(c.text ?? "").trim(), "Escreva o texto");
      const b = Array.isArray(c.buttons) ? c.buttons : [];
      need(b.length >= 1 && b.length <= 3, "Use de 1 a 3 botões");
      need(b.every((x: any) => x?.id && x?.title && String(x.title).length <= 20), "Cada botão precisa de ID e texto (até 20 letras)");
      break;
    }
    case "cond_reply": need(!!String(c.value ?? "").trim(), "Informe o texto para comparar"); break;
    case "cond_contact_field": need(!!c.field, "Escolha o campo"); if (!["empty", "not_empty"].includes(c.op)) need(c.value !== undefined && c.value !== "", "Informe o valor"); break;
    case "cond_has_tag": need(!!c.tagId, "Escolha a etiqueta"); break;
    case "cond_button": need(!!c.buttonId, "Informe o ID do botão"); break;
    case "cond_message_status": need(!!c.stepNodeId, "Escolha a etapa de envio"); break;
    case "wait_duration": need(Number(c.amount) > 0, "Informe a duração"); break;
    case "wait_until": need(!!c.at && !isNaN(Date.parse(c.at)), "Informe data e horário"); break;
    case "wait_reply": need(Number(c.timeoutMinutes) >= 1 && Number(c.timeoutMinutes) <= 60 * 24 * 7, "Prazo entre 1 minuto e 7 dias"); break;
    case "act_add_tag": case "act_remove_tag": need(!!c.tagId, "Escolha a etiqueta"); break;
    case "act_update_field": need(!!c.field, "Escolha o campo"); break;
    case "act_http": need(/^https:\/\//.test(String(c.url ?? "")), "Use uma URL HTTPS"); break;
  }
  // Variáveis inválidas em qualquer texto de configuração.
  for (const v of varsIn(JSON.stringify(c))) if (!validVar(v)) errs.push(`Variável desconhecida: {{${v}}}`);
  return errs;
}

export function validateGraph(g: AutoGraph): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodes = g.nodes ?? [];
  const edges = g.edges ?? [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const triggers = nodes.filter((n) => isTrigger(n.type));

  if (triggers.length !== 1) issues.push({ message: triggers.length ? "Use apenas um gatilho" : "Adicione um gatilho" });
  for (const n of nodes) {
    if (!BLOCK_MAP[n.type]) issues.push({ nodeId: n.id, message: `Bloco desconhecido: ${n.type}` });
  }

  for (const e of edges) {
    const s = byId.get(e.source), t = byId.get(e.target);
    if (!s || !t) { issues.push({ message: "Conexão aponta para bloco inexistente" }); continue; }
    if (isTrigger(t.type)) issues.push({ nodeId: t.id, message: "Gatilho não pode receber conexões" });
    const handles = BLOCK_MAP[s.type]?.outputs.map((o) => o.id) ?? [];
    if (!handles.includes(e.sourceHandle ?? "out")) issues.push({ nodeId: s.id, message: "Conexão em saída inválida" });
  }

  for (const n of nodes) {
    const def = BLOCK_MAP[n.type];
    if (!def) continue;
    for (const o of def.outputs) {
      const outs = edges.filter((e) => e.source === n.id && (e.sourceHandle ?? "out") === o.id);
      if (outs.length === 0) issues.push({ nodeId: n.id, message: o.label ? `Saída "${o.label}" sem conexão` : "Bloco sem próxima etapa (termine com Encerrar)" });
      if (outs.length > 1) issues.push({ nodeId: n.id, message: "Execução paralela não é permitida: uma saída só pode ter uma conexão" });
    }
    if (!isTrigger(n.type) && !edges.some((e) => e.target === n.id)) issues.push({ nodeId: n.id, message: "Bloco sem entrada" });
    for (const m of requiredConfig(n)) issues.push({ nodeId: n.id, message: m });
  }

  // Ciclos (DFS)
  const color = new Map<string, number>();
  let cycle = false;
  const visit = (id: string) => {
    color.set(id, 1);
    for (const e of edges.filter((x) => x.source === id)) {
      const c = color.get(e.target) ?? 0;
      if (c === 1) cycle = true;
      else if (c === 0) visit(e.target);
    }
    color.set(id, 2);
  };
  for (const n of nodes) if (!color.get(n.id)) visit(n.id);
  if (cycle) issues.push({ message: "O fluxo tem um ciclo (etapa que volta para trás). Ciclos não são permitidos." });

  // cond_message_status precisa apontar para um envio anterior no caminho
  for (const n of nodes.filter((x) => x.type === "cond_message_status")) {
    const ref = byId.get(n.data.config?.stepNodeId);
    if (n.data.config?.stepNodeId && (!ref || !ref.type.startsWith("send_"))) issues.push({ nodeId: n.id, message: "A etapa escolhida não é um envio" });
  }
  return issues;
}

export function nextNodeId(g: AutoGraph, nodeId: string, handle = "out"): string | null {
  const e = g.edges.find((x) => x.source === nodeId && (x.sourceHandle ?? "out") === handle);
  return e?.target ?? null;
}

export function evalCompare(op: string, actual: string | null | undefined, expected: string): boolean {
  const a = String(actual ?? "").trim().toLowerCase();
  const b = String(expected ?? "").trim().toLowerCase();
  switch (op) {
    case "equals": return a === b;
    case "contains": return b.length > 0 && a.includes(b);
    case "starts_with": return b.length > 0 && a.startsWith(b);
    case "empty": return a.length === 0;
    case "not_empty": return a.length > 0;
    default: return false;
  }
}

const STATUS_RANK: Record<string, number> = { accepted: 0, sent: 1, delivered: 2, read: 3 };
/** Status mais avançado vence; "failed" é terminal. Um "sent" atrasado não rebaixa "read". */
export function mergeDeliveryStatus(current: string | null | undefined, incoming: string): string {
  if (current === "failed") return "failed";
  if (incoming === "failed") return "failed";
  return (STATUS_RANK[incoming] ?? -1) > (STATUS_RANK[current ?? ""] ?? -1) ? incoming : (current ?? incoming);
}

// ───────────── Modelo inicial ─────────────
export function exampleGraph(): AutoGraph {
  const n = (id: string, type: string, x: number, y: number, config: Record<string, any> = {}): AutoNode => ({
    id, type, position: { x, y }, data: { config: { ...BLOCK_MAP[type].defaults, ...config } },
  });
  return {
    schema: 1,
    nodes: [
      n("trigger", "trigger_manual", 0, 0),
      n("tpl", "send_template", 0, 140, { templateName: "", language: "pt_BR" }),
      n("wait", "wait_reply", 0, 290, { timeoutMinutes: 30 }),
      n("check", "cond_reply", -260, 450, { op: "contains", value: "atendimento" }),
      n("handoff", "act_handoff", -460, 620),
      n("msg", "send_text", -120, 620, { text: "Obrigado pela resposta, {{contact.name}}! Em breve retornamos." }),
      n("end1", "end", -120, 780),
      n("tag", "act_add_tag", 260, 450, { tagId: "" }),
      n("end2", "end", 260, 620),
    ],
    edges: [
      { id: "e1", source: "trigger", target: "tpl", sourceHandle: "out" },
      { id: "e2", source: "tpl", target: "wait", sourceHandle: "out" },
      { id: "e3", source: "wait", target: "check", sourceHandle: "replied" },
      { id: "e4", source: "wait", target: "tag", sourceHandle: "timeout" },
      { id: "e5", source: "check", target: "handoff", sourceHandle: "true" },
      { id: "e6", source: "check", target: "msg", sourceHandle: "false" },
      { id: "e7", source: "msg", target: "end1", sourceHandle: "out" },
      { id: "e8", source: "tag", target: "end2", sourceHandle: "out" },
    ],
  };
}

export function emptyGraph(): AutoGraph {
  return { schema: 1, nodes: [], edges: [] };
}

/** Fluxo inicial de respostas para um Direct Send: uma ação por botão, demais respostas vão para atendimento. */
export function replyFlowGraph(buttons: { id: string; title: string }[]): AutoGraph {
  const nodes: AutoNode[] = [];
  const edges: AutoEdge[] = [];
  const mk = (id: string, type: string, x: number, y: number, config: Record<string, any> = {}, label?: string) =>
    nodes.push({ id, type, position: { x, y }, data: { label, config: { ...BLOCK_MAP[type].defaults, ...config } } });
  mk("trigger", "trigger_campaign_reply", 0, 0);
  let prev = "trigger", prevHandle = "out";
  buttons.forEach((b, i) => {
    const y = 160 + i * 200;
    const cid = `btn_${i + 1}`;
    mk(cid, "cond_button", 0, y, { buttonId: b.id }, `Botão "${b.title || b.id}"`);
    edges.push({ id: `e_${prev}_${cid}`, source: prev, target: cid, sourceHandle: prevHandle });
    mk(`msg_${i + 1}`, "send_text", 300, y, { text: `Obrigado, {{contact.name}}! Recebemos sua resposta: ${b.title || b.id}.`, onMissing: "empty" }, `Resposta ao botão ${i + 1}`);
    mk(`end_${i + 1}`, "end", 600, y);
    edges.push({ id: `e_${cid}_t`, source: cid, target: `msg_${i + 1}`, sourceHandle: "true" });
    edges.push({ id: `e_msg_${i + 1}`, source: `msg_${i + 1}`, target: `end_${i + 1}`, sourceHandle: "out" });
    prev = cid; prevHandle = "false";
  });
  mk("handoff", "act_handoff", 0, 160 + buttons.length * 200, { note: "Lead respondeu ao disparo com texto livre" }, "Outra resposta → atendimento");
  edges.push({ id: `e_${prev}_handoff`, source: prev, target: "handoff", sourceHandle: prevHandle });
  return { schema: 1, nodes, edges };
}
