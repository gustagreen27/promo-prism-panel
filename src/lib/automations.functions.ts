// Server functions das Automações (somente equipe interna).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateGraph, exampleGraph, emptyGraph, isTrigger, type AutoGraph } from "./automation-graph";

async function assertStaff(supabase: any, userId: string) {
  const { data } = await supabase.rpc("is_internal_staff", { _user: userId });
  if (!data) throw new Error("Acesso restrito à equipe");
}
async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}
const uuid = z.string().uuid();
const GraphSchema = z.object({
  schema: z.literal(1),
  nodes: z.array(z.object({ id: z.string().max(64), type: z.string().max(64), position: z.object({ x: z.number(), y: z.number() }), data: z.object({ label: z.string().max(80).optional(), config: z.record(z.string(), z.any()) }) })).max(200),
  edges: z.array(z.object({ id: z.string().max(128), source: z.string(), target: z.string(), sourceHandle: z.string().nullable().optional() })).max(400),
});
const triggerTypeOf = (g: AutoGraph) => g.nodes.find((n) => isTrigger(n.type))?.type.replace(/^trigger_/, "") ?? null;

export const listAutomations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const db = await admin();
    const { data, error } = await db.from("automations").select("id, name, description, status, trigger_type, workspace_id, connection_id, runs_count, updated_at, draft_updated_at, published_version_id, workspaces(name)").order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getAutomationOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const db = await admin();
    const [ws, conns] = await Promise.all([
      db.from("workspaces").select("id, name").order("name"),
      db.from("whatsapp_connections").select("id, name, display_phone, workspace_id, waba_ref_id, status").not("phone_number_id", "is", null).order("name"),
    ]);
    return { workspaces: ws.data ?? [], connections: conns.data ?? [] };
  });

export const getWorkspaceAssets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: uuid.nullable(), connectionId: uuid.nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const db = await admin();
    const tags = data.workspaceId ? (await db.from("contact_tags").select("id, name, color").eq("workspace_id", data.workspaceId).order("name")).data : [];
    const lists = data.workspaceId ? (await db.from("contact_lists").select("id, name").eq("workspace_id", data.workspaceId).order("name")).data : [];
    let templates: any[] = [];
    if (data.connectionId) {
      const { data: conn } = await db.from("whatsapp_connections").select("id, waba_ref_id").eq("id", data.connectionId).maybeSingle();
      const or = conn?.waba_ref_id ? `connection_id.eq.${conn.id},waba_ref_id.eq.${conn.waba_ref_id}` : `connection_id.eq.${data.connectionId}`;
      templates = (await db.from("whatsapp_templates").select("id, name, language, status, body, header_type, variables").or(or).eq("status", "approved").order("name")).data ?? [];
    }
    return { tags: tags ?? [], lists: lists ?? [], templates };
  });

export const getAutomation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const db = await admin();
    const { data: a, error } = await db.from("automations").select("*, automation_versions!automation_versions_automation_id_fkey(id, version, published_at)").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!a) throw new Error("Automação não encontrada");
    return a;
  });

export const createAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ name: z.string().min(1).max(120), description: z.string().max(500).optional(), workspaceId: uuid, connectionId: uuid.nullable(), fromExample: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const db = await admin();
    if (data.connectionId) {
      const { data: c } = await db.from("whatsapp_connections").select("workspace_id").eq("id", data.connectionId).maybeSingle();
      if (c?.workspace_id && c.workspace_id !== data.workspaceId) throw new Error("Esse número pertence a outro cliente");
    }
    const graph = data.fromExample ? exampleGraph() : emptyGraph();
    const { data: row, error } = await db.from("automations").insert({
      name: data.name, description: data.description ?? null, workspace_id: data.workspaceId, connection_id: data.connectionId,
      draft_graph: graph, trigger_type: triggerTypeOf(graph), created_by: context.userId, status: "draft",
    }).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const saveAutomationDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, name: z.string().min(1).max(120), description: z.string().max(500).nullable(), connectionId: uuid.nullable(), graph: GraphSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const db = await admin();
    const { data: a } = await db.from("automations").select("workspace_id").eq("id", data.id).maybeSingle();
    if (!a) throw new Error("Automação não encontrada");
    if (data.connectionId) {
      const { data: c } = await db.from("whatsapp_connections").select("workspace_id").eq("id", data.connectionId).maybeSingle();
      if (c?.workspace_id && c.workspace_id !== a.workspace_id) throw new Error("Esse número pertence a outro cliente");
    }
    const { error } = await db.from("automations").update({
      name: data.name, description: data.description, connection_id: data.connectionId, draft_graph: data.graph, draft_updated_at: new Date().toISOString(),
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, issues: validateGraph(data.graph as AutoGraph) };
  });

export const publishAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const db = await admin();
    const { data: a } = await db.from("automations").select("id, draft_graph, connection_id").eq("id", data.id).maybeSingle();
    if (!a) throw new Error("Automação não encontrada");
    const graph = a.draft_graph as AutoGraph;
    const issues = validateGraph(graph);
    if (graph.nodes.some((n) => n.type.startsWith("send_")) && !a.connection_id) issues.push({ message: "Escolha o número WhatsApp da automação" });
    if (issues.length) return { ok: false, issues };
    const { data: last } = await db.from("automation_versions").select("version").eq("automation_id", a.id).gt("version", 0).order("version", { ascending: false }).limit(1).maybeSingle();
    const { data: v, error } = await db.from("automation_versions").insert({ automation_id: a.id, version: (last?.version ?? 0) + 1, graph, published_by: context.userId }).select("id, version").maybeSingle();
    if (error) throw new Error(error.message);
    await db.from("automations").update({ published_version_id: v.id, status: "active", trigger_type: triggerTypeOf(graph), schedule_fired_at: null }).eq("id", a.id);
    if (triggerTypeOf(graph) === "scheduled") await db.rpc("automation_tick_start");
    return { ok: true, version: v.version, issues: [] };
  });

export const setAutomationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, status: z.enum(["active", "paused", "archived"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const db = await admin();
    const { data: a } = await db.from("automations").select("published_version_id").eq("id", data.id).maybeSingle();
    if (data.status === "active" && !a?.published_version_id) throw new Error("Publique a automação antes de ativar");
    await db.from("automations").update({ status: data.status }).eq("id", data.id);
    return { ok: true };
  });

export const duplicateAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const db = await admin();
    const { data: a } = await db.from("automations").select("*").eq("id", data.id).maybeSingle();
    if (!a) throw new Error("Automação não encontrada");
    const { data: row, error } = await db.from("automations").insert({
      name: `${a.name} (cópia)`, description: a.description, workspace_id: a.workspace_id, connection_id: a.connection_id,
      draft_graph: a.draft_graph, trigger_type: a.trigger_type, created_by: context.userId, status: "draft",
    }).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const getWebhookInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const db = await admin();
    const { data: a } = await db.from("automations").select("webhook_token").eq("id", data.id).maybeSingle();
    return { token: a?.webhook_token ?? "" };
  });

export const listAutomationRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ automationId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const db = await admin();
    const { data: runs } = await db.from("automation_runs").select("id, status, trigger_type, contact_phone, contact_id, current_node_id, is_test, simulate, error, started_at, finished_at, version_id, automation_versions(version), contacts(name)").eq("automation_id", data.automationId).order("started_at", { ascending: false }).limit(100);
    return runs ?? [];
  });

export const getAutomationRun = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ runId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const db = await admin();
    const { data: run } = await db.from("automation_runs").select("*, automation_versions(version, graph), contacts(name)").eq("id", data.runId).maybeSingle();
    const { data: steps } = await db.from("automation_run_steps").select("*").eq("run_id", data.runId).order("started_at");
    const { data: jobs } = await db.from("automation_jobs").select("node_id, kind, status, attempt, run_at, last_error").eq("run_id", data.runId).order("created_at");
    return { run, steps: steps ?? [], jobs: jobs ?? [] };
  });

export const cancelAutomationRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ runId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const db = await admin();
    await db.from("automation_runs").update({ status: "cancelled", finished_at: new Date().toISOString(), error: "Cancelada manualmente" }).eq("id", data.runId).in("status", ["pending", "running", "waiting"]);
    await db.from("automation_jobs").update({ status: "cancelled" }).eq("run_id", data.runId).eq("status", "pending");
    await db.from("automation_waits").update({ status: "cancelled", resolved_at: new Date().toISOString() }).eq("run_id", data.runId).eq("status", "waiting");
    return { ok: true };
  });

/**
 * Execução manual / teste.
 * mode "simulate": usa o RASCUNHO, não envia nada nem altera contatos.
 * mode "test_real": usa o rascunho e ENVIA de verdade para o telefone informado.
 * mode "live": usa a versão publicada (gatilho de execução manual).
 */
export const runAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: uuid, mode: z.enum(["simulate", "test_real", "live"]), phone: z.string().min(8).max(20),
    simulatedReply: z.string().max(500).optional(), simulatedButtonId: z.string().max(100).optional(), confirmReal: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    if (data.mode !== "simulate" && !data.confirmReal) throw new Error("Confirme o envio real");
    const db = await admin();
    const { data: a } = await db.from("automations").select("id, status, draft_graph, published_version_id, trigger_type").eq("id", data.id).maybeSingle();
    if (!a) throw new Error("Automação não encontrada");
    let versionId = a.published_version_id;
    if (data.mode !== "live") {
      const issues = validateGraph(a.draft_graph as AutoGraph);
      if (issues.length) return { ok: false, issues, runId: null };
      // Snapshot de teste (versão negativa) para a execução ficar presa ao fluxo testado.
      const { data: low } = await db.from("automation_versions").select("version").eq("automation_id", a.id).lt("version", 0).order("version", { ascending: true }).limit(1).maybeSingle();
      const { data: v, error } = await db.from("automation_versions").insert({ automation_id: a.id, version: (low?.version ?? 0) - 1, graph: a.draft_graph, published_by: context.userId }).select("id").maybeSingle();
      if (error) throw new Error(error.message);
      versionId = v.id;
    } else {
      if (a.status !== "active" || !versionId) throw new Error("Automação precisa estar ativa");
      if (a.trigger_type !== "manual") throw new Error("Esta automação não usa gatilho de execução manual");
    }
    const eng = await import("@/lib/automation-engine.server");
    const r = await eng.startRun(db, {
      automationId: a.id, versionId, triggerType: data.mode === "live" ? "manual" : `test:${a.trigger_type ?? "manual"}`,
      contactPhone: data.phone, simulate: data.mode === "simulate",
      message: data.mode === "simulate" && a.trigger_type === "campaign_reply" ? { text: data.simulatedReply ?? "", buttonId: data.simulatedButtonId ?? null } : null, isTest: data.mode !== "live", startedBy: context.userId,
      triggerData: data.mode === "simulate" ? { simulatedReply: data.simulatedReply ?? "", simulatedButtonId: data.simulatedButtonId ?? null } : {},
    });
    if (!r.runId) throw new Error(r.error ?? "Não foi possível iniciar");
    await eng.processDueJobs(db, `manual-${r.runId}`, 8000);
    return { ok: true, issues: [], runId: r.runId };
  });

/** Automações "Resposta a um disparo" disponíveis para o cliente dono do número. */
export const listReplyAutomations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ connectionId: uuid.nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    if (!data.connectionId) return [];
    const db = await admin();
    const { data: c } = await db.from("whatsapp_connections").select("workspace_id").eq("id", data.connectionId).maybeSingle();
    let q = db.from("automations").select("id, name, status, published_version_id").eq("trigger_type", "campaign_reply").neq("status", "archived").order("updated_at", { ascending: false });
    if (c?.workspace_id) q = q.eq("workspace_id", c.workspace_id);
    const { data: rows } = await q;
    return rows ?? [];
  });

/** Cria (rascunho) um fluxo de respostas com uma ação por botão do Direct Send. */
export const createReplyFlowFromButtons = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    connectionId: uuid, name: z.string().min(1).max(120),
    buttons: z.array(z.object({ id: z.string().min(1).max(256), title: z.string().max(20) })).max(3),
    text: z.string().max(1024).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const db = await admin();
    const { data: c } = await db.from("whatsapp_connections").select("workspace_id").eq("id", data.connectionId).maybeSingle();
    if (!c?.workspace_id) throw new Error("Número sem cliente vinculado");
    const { replyFlowGraph } = await import("./automation-graph");
    const graph = replyFlowGraph(data.buttons, data.text ?? "");
    const { data: row, error } = await db.from("automations").insert({
      name: `Respostas — ${data.name}`, description: "Continua a conversa conforme o botão ou resposta de cada lead do disparo.",
      workspace_id: c.workspace_id, connection_id: data.connectionId, draft_graph: graph, trigger_type: "campaign_reply", created_by: context.userId, status: "draft",
    }).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });
