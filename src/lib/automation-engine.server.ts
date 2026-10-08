// Motor de execução das Automações (server-only).
// Fila persistente em automation_jobs, reserva atômica via automation_claim_jobs,
// esperas em automation_waits resolvidas atomicamente via automation_resolve_wait.
// Nunca importar no topo de *.functions.ts — use import dinâmico dentro do handler.

import {
  type AutoGraph, type AutoNode, type VarContext,
  BLOCK_MAP, isTrigger, nextNodeId, outputsFor, campaignReplyHandle, renderVars, evalCompare, mergeDeliveryStatus, MissingVariableError,
} from "./automation-graph";

type Db = any;
const MAX_STEPS_PER_TICK = 200;

export function normPhone(p: string | null | undefined): string {
  return String(p ?? "").replace(/\D/g, "");
}

class PermanentError extends Error {}
class TransientError extends Error {}
class UncertainError extends Error {}

// ───────────── Início de execução ─────────────
export type StartInput = {
  automationId: string;
  versionId: string;
  triggerType: string;
  contactPhone?: string | null;
  contactId?: string | null;
  triggerData?: Record<string, any>;
  message?: { text?: string | null; buttonId?: string | null; buttonTitle?: string | null } | null;
  simulate?: boolean;
  isTest?: boolean;
  dedupKey?: string | null;
  startedBy?: string | null;
};

export async function startRun(db: Db, input: StartInput): Promise<{ runId: string | null; duplicate?: boolean; error?: string }> {
  const { data: auto } = await db.from("automations").select("id, workspace_id, connection_id").eq("id", input.automationId).maybeSingle();
  if (!auto) return { runId: null, error: "Automação não encontrada" };
  const { data: ver } = await db.from("automation_versions").select("id, graph").eq("id", input.versionId).eq("automation_id", auto.id).maybeSingle();
  if (!ver) return { runId: null, error: "Versão não encontrada" };
  const graph = ver.graph as AutoGraph;
  const trigger = graph.nodes.find((n) => isTrigger(n.type));
  if (!trigger) return { runId: null, error: "Fluxo sem gatilho" };

  // Contato sempre do mesmo cliente (isolamento).
  let contact: any = null;
  if (input.contactId) {
    const { data } = await db.from("contacts").select("id, name, phone, email, metadata, workspace_id").eq("id", input.contactId).maybeSingle();
    if (data && auto.workspace_id && data.workspace_id !== auto.workspace_id) return { runId: null, error: "Contato de outro cliente" };
    contact = data;
  }
  const phone = normPhone(input.contactPhone ?? contact?.phone);
  if (!contact && phone && auto.workspace_id) {
    const { data } = await db.from("contacts").select("id, name, phone, email, metadata").eq("workspace_id", auto.workspace_id).in("phone", [phone, `+${phone}`]).limit(1);
    contact = data?.[0] ?? null;
  }
  if (!phone) return { runId: null, error: "Contato sem telefone" };

  const context: VarContext = {
    contact: { name: contact?.name ?? null, phone, email: contact?.email ?? null, fields: (contact?.metadata as any) ?? {} },
    message: { text: input.message?.text ?? null },
    button: { id: input.message?.buttonId ?? null, title: input.message?.buttonTitle ?? null },
    trigger: input.triggerData ?? {},
    steps: {},
  };

  const { data: run, error } = await db.from("automation_runs").insert({
    automation_id: auto.id,
    version_id: ver.id,
    workspace_id: auto.workspace_id,
    contact_id: contact?.id ?? null,
    contact_phone: phone,
    connection_id: auto.connection_id,
    trigger_type: input.triggerType,
    trigger_data: input.triggerData ?? {},
    context,
    status: "pending",
    current_node_id: trigger.id,
    is_test: !!input.isTest,
    simulate: !!input.simulate,
    dedup_key: input.dedupKey ?? null,
    started_by: input.startedBy ?? null,
  }).select("id").maybeSingle();
  if (error) {
    if (error.code === "23505") return { runId: null, duplicate: true };
    return { runId: null, error: error.message };
  }
  await db.rpc("automation_tick_start").then(() => null, () => null);
  await enqueue(db, run.id, trigger.id, new Date());
  if (!input.isTest) {
    const { data: a } = await db.from("automations").select("runs_count").eq("id", auto.id).maybeSingle();
    await db.from("automations").update({ runs_count: (a?.runs_count ?? 0) + 1 }).eq("id", auto.id);
  }
  return { runId: run.id };
}

async function enqueue(db: Db, runId: string, nodeId: string, at: Date, kind: "step" | "wait_timeout" = "step") {
  const key = `${runId}:${nodeId}:${kind}`;
  const { error } = await db.from("automation_jobs").insert({ run_id: runId, node_id: nodeId, kind, run_at: at.toISOString(), idempotency_key: key });
  if (error && error.code !== "23505") throw new Error(`Falha ao agendar etapa: ${error.message}`);
}

/** Data em que a etapa deve rodar: esperas por tempo são agendadas, não executadas com timers. */
function scheduleFor(node: AutoNode, ctx: VarContext, simulate: boolean): Date {
  const now = new Date();
  if (simulate) return now;
  const c = node.data.config ?? {};
  if (node.type === "wait_duration") {
    const mult = c.unit === "days" ? 86400000 : c.unit === "hours" ? 3600000 : c.unit === "seconds" ? 1000 : 60000;
    return new Date(now.getTime() + Math.max(1, Number(c.amount) || 1) * mult);
  }
  if (node.type === "wait_until") {
    const t = Date.parse(renderVars(String(c.at ?? ""), ctx, "empty"));
    return isNaN(t) ? now : new Date(Math.max(t, now.getTime()));
  }
  return now;
}

async function advance(db: Db, run: any, graph: AutoGraph, fromNode: string, handle: string) {
  const next = nextNodeId(graph, fromNode, handle);
  if (!next) {
    await finishRun(db, run.id, "completed");
    return;
  }
  const node = graph.nodes.find((n) => n.id === next)!;
  const at = scheduleFor(node, run.context, run.simulate);
  await db.from("automation_runs").update({ current_node_id: next, status: at.getTime() > Date.now() + 1000 ? "waiting" : "running", updated_at: new Date().toISOString() }).eq("id", run.id);
  await enqueue(db, run.id, next, at);
}

async function finishRun(db: Db, runId: string, status: "completed" | "failed" | "cancelled", error?: string) {
  await db.from("automation_runs").update({ status, error: error ?? null, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", runId).in("status", ["pending", "running", "waiting"]);
  if (status !== "completed") {
    await db.from("automation_jobs").update({ status: "cancelled" }).eq("run_id", runId).eq("status", "pending");
    await db.from("automation_waits").update({ status: "cancelled", resolved_at: new Date().toISOString() }).eq("run_id", runId).eq("status", "waiting");
  }
}

// ───────────── Processamento da fila ─────────────
export async function processDueJobs(db: Db, holder: string, budgetMs = 20000): Promise<{ processed: number }> {
  const deadline = Date.now() + budgetMs;
  let processed = 0;
  while (Date.now() < deadline && processed < MAX_STEPS_PER_TICK) {
    const { data: jobs, error } = await db.rpc("automation_claim_jobs", { _holder: holder, _limit: 10 });
    if (error) throw new Error(error.message);
    if (!jobs?.length) break;
    for (const job of jobs) {
      await processJob(db, job);
      processed++;
    }
  }
  return { processed };
}

async function processJob(db: Db, job: any) {
  try {
    const { data: run } = await db.from("automation_runs").select("*").eq("id", job.run_id).maybeSingle();
    if (!run || ["completed", "failed", "cancelled"].includes(run.status)) {
      await db.from("automation_jobs").update({ status: "cancelled" }).eq("id", job.id);
      return;
    }
    const { data: ver } = await db.from("automation_versions").select("graph").eq("id", run.version_id).maybeSingle();
    const graph = ver.graph as AutoGraph;
    const node = graph.nodes.find((n) => n.id === job.node_id);
    if (!node) throw new PermanentError(`Etapa ${job.node_id} não existe na versão`);

    if (job.kind === "wait_timeout") {
      await handleTimeout(db, run, graph, node);
    } else {
      await executeNode(db, run, graph, node);
    }
    await db.from("automation_jobs").update({ status: "done", locked_at: null, updated_at: new Date().toISOString() }).eq("id", job.id);
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    if (e instanceof TransientError && job.attempt < job.max_attempts) {
      const delay = Math.min(30 * 60, 30 * 2 ** (job.attempt - 1)) * 1000; // 30s, 60s, 2min, 4min…
      await db.from("automation_jobs").update({ status: "pending", locked_at: null, last_error: msg, run_at: new Date(Date.now() + delay).toISOString() }).eq("id", job.id);
      return;
    }
    await db.from("automation_jobs").update({ status: "failed", locked_at: null, last_error: msg }).eq("id", job.id);
    const prefix = e instanceof UncertainError ? "Resultado incerto (verificar antes de reenviar): " : e instanceof TransientError ? "Falhou após várias tentativas: " : "";
    await finishRun(db, job.run_id, "failed", prefix + msg);
  }
}

async function stepStart(db: Db, run: any, node: AutoNode, input?: any) {
  const { data } = await db.from("automation_run_steps").insert({
    run_id: run.id, node_id: node.id, node_type: node.type, label: node.data.label ?? BLOCK_MAP[node.type]?.label, status: "running", input: input ?? null,
  }).select("id").maybeSingle();
  await db.from("automation_runs").update({ path: [...(run.path ?? []), node.id], current_node_id: node.id, status: "running", updated_at: new Date().toISOString() }).eq("id", run.id);
  run.path = [...(run.path ?? []), node.id];
  return data.id as string;
}
async function stepEnd(db: Db, stepId: string, patch: Record<string, any>) {
  await db.from("automation_run_steps").update({ ...patch, finished_at: new Date().toISOString() }).eq("id", stepId);
}
async function saveStepOutput(db: Db, run: any, nodeId: string, out: Record<string, any>) {
  run.context = { ...run.context, steps: { ...(run.context?.steps ?? {}), [nodeId]: out } };
  await db.from("automation_runs").update({ context: run.context }).eq("id", run.id);
}

async function executeNode(db: Db, run: any, graph: AutoGraph, node: AutoNode) {
  const c = node.data.config ?? {};
  const ctx: VarContext = run.context ?? {};
  const onMissing = (c.onMissing === "empty" ? "empty" : "fail") as "fail" | "empty";

  // Idempotência de envios: se já existe etapa iniciada para este nó, nunca reenviar às cegas.
  if (node.type.startsWith("send_")) {
    const { data: prev } = await db.from("automation_run_steps").select("id, status, wamid, output").eq("run_id", run.id).eq("node_id", node.id);
    const done = (prev ?? []).find((s: any) => ["completed", "simulated"].includes(s.status));
    if (done) return advance(db, run, graph, node.id, "out");
    const inFlight = (prev ?? []).find((s: any) => s.status === "running" || s.status === "uncertain");
    if (inFlight) {
      await stepEnd(db, inFlight.id, { status: "uncertain", error: "Execução interrompida durante o envio; não reenviado automaticamente" });
      throw new UncertainError("envio interrompido no meio — confira na conversa antes de reenviar");
    }
  }

  const stepId = await stepStart(db, run, node, { config: c });
  try {
    if (isTrigger(node.type)) {
      const h = node.type === "trigger_campaign_reply"
        ? campaignReplyHandle(c, { buttonId: ctx.button?.id ?? null, text: ctx.message?.text ?? null })
        : "out";
      await stepEnd(db, stepId, { status: "completed", output_handle: h });
      return advance(db, run, graph, node.id, h);
    }
    switch (node.type) {
      case "end":
        await stepEnd(db, stepId, { status: "completed" });
        return finishRun(db, run.id, "completed");

      case "wait_duration":
      case "wait_until":
        await stepEnd(db, stepId, { status: run.simulate ? "simulated" : "completed", output_handle: "out" });
        return advance(db, run, graph, node.id, "out");

      case "wait_reply":
        return await startReplyWait(db, run, graph, node, stepId);

      case "send_template":
      case "send_text":
      case "send_media":
      case "send_buttons": {
        const res = await doSend(db, run, node, ctx, onMissing);
        if (res.simulated) {
          await stepEnd(db, stepId, { status: "simulated", output: res.payload, output_handle: "out" });
          await saveStepOutput(db, run, node.id, { status: "simulated" });
        } else {
          await stepEnd(db, stepId, { status: "completed", wamid: res.wamid, delivery_status: "accepted", delivery_updated_at: new Date().toISOString(), output: { wamid: res.wamid }, output_handle: "out" });
          await saveStepOutput(db, run, node.id, { wamid: res.wamid, status: "accepted" });
        }
        return advance(db, run, graph, node.id, "out");
      }

      case "cond_reply":
      case "cond_contact_field":
      case "cond_has_tag":
      case "cond_button":
      case "cond_message_status": {
        const ok = await evalCondition(db, run, node, ctx);
        const handle = ok ? "true" : "false";
        await stepEnd(db, stepId, { status: "completed", output_handle: handle, output: { result: ok } });
        return advance(db, run, graph, node.id, handle);
      }

      case "act_add_tag":
      case "act_remove_tag":
      case "act_update_field": {
        const out = await doContactAction(db, run, node, ctx, onMissing);
        await stepEnd(db, stepId, { status: run.simulate ? "simulated" : "completed", output: out, output_handle: "out" });
        return advance(db, run, graph, node.id, "out");
      }

      case "flow_random": {
        const outs = outputsFor(node);
        const pick = outs[Math.floor(Math.random() * outs.length)]?.id ?? "r1";
        await stepEnd(db, stepId, { status: run.simulate ? "simulated" : "completed", output_handle: pick, output: { path: pick } });
        return advance(db, run, graph, node.id, pick);
      }

      case "act_blacklist": {
        const phone = String(ctx.contact?.phone ?? "").replace(/\D/g, "");
        if (!phone) throw new PermanentError("Contato sem telefone para bloquear");
        if (!run.simulate) {
          const { error } = await db.rpc("wa_suppression_add", { _phone: phone, _reason: "automacao", _permanent: true, _note: `Automação ${run.automation_id}` } as any);
          if (error) throw new Error(`Falha ao bloquear contato: ${error.message}`);
        }
        await stepEnd(db, stepId, { status: run.simulate ? "simulated" : "completed", output: { phone }, output_handle: "out" });
        return advance(db, run, graph, node.id, "out");
      }

      case "act_handoff": {
        const out = await doHandoff(db, run, c);
        await stepEnd(db, stepId, { status: run.simulate ? "simulated" : "completed", output: out });
        return finishRun(db, run.id, "completed");
      }

      case "act_http": {
        const out = await doHttp(run, c, ctx, onMissing);
        await saveStepOutput(db, run, node.id, out);
        await stepEnd(db, stepId, { status: run.simulate ? "simulated" : "completed", output: out, output_handle: "out" });
        return advance(db, run, graph, node.id, "out");
      }
      default:
        throw new PermanentError(`Bloco não suportado: ${node.type}`);
    }
  } catch (e: any) {
    const status = e instanceof UncertainError ? "uncertain" : "failed";
    await stepEnd(db, stepId, { status, error: e?.message ?? String(e) });
    if (e instanceof MissingVariableError) throw new PermanentError(e.message);
    throw e;
  }
}

// ───────────── Esperas por resposta ─────────────
async function startReplyWait(db: Db, run: any, graph: AutoGraph, node: AutoNode, stepId: string) {
  const minutes = Math.max(1, Number(node.data.config?.timeoutMinutes) || 30);
  if (run.simulate) {
    const sim = run.trigger_data?.simulatedReply;
    const replied = typeof sim === "string" && sim.length > 0;
    if (replied) {
      run.context = { ...run.context, message: { text: sim }, button: { id: run.trigger_data?.simulatedButtonId ?? null, title: null } };
      await db.from("automation_runs").update({ context: run.context }).eq("id", run.id);
    }
    await stepEnd(db, stepId, { status: "simulated", output_handle: replied ? "replied" : "timeout", output: { simulated: true, reply: sim ?? null } });
    return advance(db, run, graph, node.id, replied ? "replied" : "timeout");
  }
  const expires = new Date(Date.now() + minutes * 60000);
  const row = { run_id: run.id, node_id: node.id, connection_id: run.connection_id, contact_phone: run.contact_phone, expires_at: expires.toISOString() };
  let { data: wait, error } = await db.from("automation_waits").insert(row).select("id").maybeSingle();
  if (error?.code === "23505") {
    // Regra: só UMA espera ativa por número + contato. A mais recente substitui a anterior.
    const q = db.from("automation_waits").select("id, run_id").eq("status", "waiting").eq("contact_phone", run.contact_phone);
    const { data: olds } = run.connection_id ? await q.eq("connection_id", run.connection_id) : await q.is("connection_id", null);
    for (const o of olds ?? []) {
      const won = await db.rpc("automation_resolve_wait", { _wait_id: o.id, _outcome: "superseded", _reply: null });
      if (won.data) await finishRun(db, o.run_id, "cancelled", "Substituída: outra automação passou a aguardar resposta deste contato");
    }
    ({ data: wait, error } = await db.from("automation_waits").insert(row).select("id").maybeSingle());
  }
  if (error) throw new TransientError(`Falha ao registrar espera: ${error.message}`);
  await stepEnd(db, stepId, { status: "waiting", output: { wait_id: wait.id, expires_at: expires.toISOString() } });
  await db.from("automation_runs").update({ status: "waiting", current_node_id: node.id }).eq("id", run.id);
  await enqueue(db, run.id, node.id, expires, "wait_timeout");
}

async function handleTimeout(db: Db, run: any, graph: AutoGraph, node: AutoNode) {
  const { data: wait } = await db.from("automation_waits").select("id").eq("run_id", run.id).eq("node_id", node.id).eq("status", "waiting").maybeSingle();
  if (!wait) return; // resposta chegou antes — nada a fazer
  const { data: won } = await db.rpc("automation_resolve_wait", { _wait_id: wait.id, _outcome: "timed_out", _reply: null });
  if (!won) return; // a resposta venceu a disputa
  await db.from("automation_run_steps").update({ status: "completed", output_handle: "timeout", finished_at: new Date().toISOString() }).eq("run_id", run.id).eq("node_id", node.id).eq("status", "waiting");
  await advance(db, run, graph, node.id, "timeout");
}

/** Chamado pelo webhook com uma mensagem recebida. Retorna true se a resposta foi consumida por uma espera. */
export async function consumeReply(db: Db, args: { connectionId: string | null; phone: string; text: string; buttonId?: string | null; buttonTitle?: string | null; wamid?: string | null }): Promise<boolean> {
  const phone = normPhone(args.phone);
  const q = db.from("automation_waits").select("id, run_id, node_id").eq("status", "waiting").eq("contact_phone", phone).gt("expires_at", new Date().toISOString());
  const { data: waits } = args.connectionId ? await q.eq("connection_id", args.connectionId) : await q.is("connection_id", null);
  const wait = (waits ?? [])[0];
  if (!wait) return false;
  const reply = { text: args.text, button_id: args.buttonId ?? null, button_title: args.buttonTitle ?? null, wamid: args.wamid ?? null };
  const { data: won } = await db.rpc("automation_resolve_wait", { _wait_id: wait.id, _outcome: "replied", _reply: reply });
  if (!won) return false; // prazo venceu a disputa
  const { data: run } = await db.from("automation_runs").select("*").eq("id", wait.run_id).maybeSingle();
  const { data: ver } = await db.from("automation_versions").select("graph").eq("id", run.version_id).maybeSingle();
  run.context = { ...run.context, message: { text: args.text }, button: { id: args.buttonId ?? null, title: args.buttonTitle ?? null } };
  await db.from("automation_runs").update({ context: run.context }).eq("id", run.id);
  await db.from("automation_run_steps").update({ status: "completed", output_handle: "replied", output: reply, finished_at: new Date().toISOString() }).eq("run_id", run.id).eq("node_id", wait.node_id).eq("status", "waiting");
  await db.from("automation_jobs").update({ status: "cancelled" }).eq("run_id", run.id).eq("node_id", wait.node_id).eq("kind", "wait_timeout").eq("status", "pending");
  await advance(db, run, ver.graph, wait.node_id, "replied");
  return true;
}

// ───────────── Condições ─────────────
async function evalCondition(db: Db, run: any, node: AutoNode, ctx: VarContext): Promise<boolean> {
  const c = node.data.config ?? {};
  switch (node.type) {
    case "cond_reply": return evalCompare(c.op, ctx.message?.text, renderVars(c.value, ctx, "empty"));
    case "cond_button": return String(ctx.button?.id ?? "") === String(c.buttonId);
    case "cond_contact_field": {
      const actual = c.field === "name" ? ctx.contact?.name : c.field === "email" ? ctx.contact?.email : c.field === "phone" ? ctx.contact?.phone : (ctx.contact?.fields ?? {})[String(c.field).replace(/^fields\./, "")];
      return evalCompare(c.op, actual == null ? "" : String(actual), renderVars(String(c.value ?? ""), ctx, "empty"));
    }
    case "cond_has_tag": {
      if (!run.contact_id) return false;
      const { data } = await db.from("contact_tag_assignments").select("tag_id").eq("contact_id", run.contact_id).eq("tag_id", c.tagId).maybeSingle();
      return !!data;
    }
    case "cond_message_status": {
      const { data } = await db.from("automation_run_steps").select("delivery_status").eq("run_id", run.id).eq("node_id", c.stepNodeId).not("wamid", "is", null).maybeSingle();
      const st = data?.delivery_status ?? null;
      if (c.status === "failed") return st === "failed";
      if (c.status === "delivered") return st === "delivered" || st === "read";
      return st === c.status;
    }
  }
  return false;
}

// ───────────── Envio WhatsApp (reutiliza a integração existente) ─────────────
async function doSend(db: Db, run: any, node: AutoNode, ctx: VarContext, onMissing: "fail" | "empty"): Promise<{ simulated: boolean; wamid?: string; payload?: any }> {
  const c = node.data.config ?? {};
  const r = (s: string) => renderVars(String(s ?? ""), ctx, onMissing);
  const payload: any = { type: node.type };
  if (node.type === "send_template") Object.assign(payload, { template: c.templateName, language: c.language, params: (c.params ?? []).map(r), headerUrl: c.headerUrl ? r(c.headerUrl) : null });
  if (node.type === "send_text") payload.text = r(c.text);
  if (node.type === "send_media") Object.assign(payload, { mediaType: c.mediaType, url: (c.mediaType === "audio" || c.mediaType === "video") && c.mediaPath ? "" : r(c.url), mediaPath: c.mediaType === "audio" || c.mediaType === "video" ? c.mediaPath : undefined, caption: c.caption ? r(c.caption) : "", filename: c.filename ?? "" });
  if (node.type === "send_buttons") Object.assign(payload, { text: r(c.text), buttons: c.buttons });
  if (run.simulate) return { simulated: true, payload };

  const phone = normPhone(run.contact_phone);
  // Opt-out e supressão global.
  if (run.contact_id) {
    const { data: ct } = await db.from("contacts").select("opt_out").eq("id", run.contact_id).maybeSingle();
    if (ct?.opt_out) throw new PermanentError("Contato pediu para não receber mensagens (opt-out)");
  }
  const { data: oo } = await db.from("opt_outs").select("id").in("phone", [phone, `+${phone}`]).limit(1);
  if (oo?.length) throw new PermanentError("Contato na lista de opt-out");
  const { data: sup } = await db.rpc("wa_suppression_is_active", { _phone: phone });
  if (sup) throw new PermanentError("Número em supressão global");

  if (!run.connection_id) throw new PermanentError("Automação sem número WhatsApp configurado");
  const { data: conn } = await db.from("whatsapp_connections").select("id, phone_number_id, access_token, use_global_token, waba_ref_id, waba_id, workspace_id, blocked_at, status").eq("id", run.connection_id).maybeSingle();
  if (!conn?.phone_number_id) throw new PermanentError("Número WhatsApp não encontrado");
  if (run.workspace_id && conn.workspace_id && conn.workspace_id !== run.workspace_id) throw new PermanentError("Número pertence a outro cliente");
  if (conn.blocked_at) throw new PermanentError("Número bloqueado pela Meta");
  const { resolveConnectionToken } = await import("@/lib/meta/wa-waba-token.server");
  const token = await resolveConnectionToken(db, conn);
  if (!token) throw new PermanentError("Sem credencial para o número");

  // Atendimento humano em andamento: não enviar automático.
  const { data: conv } = await db.from("wa_conversations").select("id, assigned_user_id, service_window_expires_at").eq("phone_number_id", conn.phone_number_id).eq("contact_phone", phone).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (conv?.assigned_user_id && conv?.service_window_expires_at && Date.parse(conv.service_window_expires_at) > Date.now()) {
    throw new PermanentError("Contato em atendimento humano — automação não envia mensagens");
  }
  if (node.type !== "send_template") {
    const open = conv?.service_window_expires_at && Date.parse(conv.service_window_expires_at) > Date.now();
    if (!open) throw new PermanentError("Janela de 24h fechada: fora dela só é permitido template aprovado");
  }

  const biz = `auto:${run.id}:${node.id}`;
  let res: { ok: boolean; wamid?: string | null; error?: string; code?: string; httpStatus?: number };
  if (node.type === "send_template") {
    const { sendTemplateMessage } = await import("@/lib/wa-send.server");
    const { data: tpl } = await db.from("whatsapp_templates").select("status, header_type").eq("name", payload.template).eq("language", payload.language).or(`connection_id.eq.${conn.id},waba_ref_id.eq.${conn.waba_ref_id ?? "00000000-0000-0000-0000-000000000000"}`).limit(1).maybeSingle();
    if (tpl && String(tpl.status).toLowerCase() !== "approved") throw new PermanentError(`Template ${payload.template} não está aprovado`);
    const vars: Record<string, string> = {};
    (payload.params as string[]).forEach((p, i) => (vars[String(i + 1)] = p));
    const out = await sendTemplateMessage({
      phoneNumberId: conn.phone_number_id, accessToken: token, to: phone, templateName: payload.template, languageCode: payload.language,
      variables: vars, headerType: payload.headerUrl ? (tpl?.header_type ?? "image") : null, headerValue: payload.headerUrl, bizOpaqueCallbackData: biz,
    });
    res = out.ok ? { ok: true, wamid: out.metaMessageId } : { ok: false, error: out.error, code: out.code, httpStatus: out.httpStatus };
  } else {
    if (node.type === "send_media" && payload.mediaPath) {
      if (!/^automation-(audio|video)\/[a-f0-9-]+\.(mp3|ogg|aac|amr|m4a|mp4|3gp)$/i.test(payload.mediaPath)) throw new PermanentError("Arquivo de mídia inválido");
      const { data: signed, error } = await db.storage.from("campaign-images").createSignedUrl(payload.mediaPath, 3600);
      if (error || !signed?.signedUrl) throw new TransientError("Não foi possível acessar o áudio salvo");
      payload.url = signed.signedUrl;
    }
    const svc = await import("@/lib/wa-service-send.server");
    const base = { phoneNumberId: conn.phone_number_id, accessToken: token, to: phone, bizOpaqueCallbackData: biz };
    const out = node.type === "send_text" ? await svc.sendServiceText(base, payload.text)
      : node.type === "send_media" ? await svc.sendServiceMedia(base, payload.mediaType, { link: payload.url, caption: payload.caption, filename: payload.filename })
      : await svc.sendServiceInteractiveButtons(base, { body: payload.text, buttons: payload.buttons });
    res = out.ok ? { ok: true, wamid: out.wamid } : { ok: false, error: out.error, code: out.code, httpStatus: out.httpStatus };
  }
  if (res.ok && res.wamid) return { simulated: false, wamid: res.wamid };
  const code = String(res.code ?? "");
  if (/timeout|network_error|egress/i.test(code) || /timeout/i.test(res.error ?? "")) {
    // Pode ter saído: não repetir às cegas.
    throw new UncertainError(res.error ?? "Sem resposta da Meta");
  }
  if (["130429", "131056", "429", "500", "502", "503", "504", "131000", "1", "2"].includes(code)) throw new TransientError(`Meta ${code}: ${res.error}`);
  throw new PermanentError(`Meta ${code}: ${res.error}`);
}

// ───────────── Ações de contato ─────────────
async function ensureContact(db: Db, run: any): Promise<string> {
  if (run.contact_id) return run.contact_id;
  if (!run.workspace_id) throw new PermanentError("Automação sem cliente: não é possível criar contato");
  const { data, error } = await db.from("contacts").insert({ workspace_id: run.workspace_id, phone: run.contact_phone, name: run.context?.contact?.name ?? null, source: "automation" }).select("id").maybeSingle();
  if (error) throw new TransientError(error.message);
  run.contact_id = data.id;
  await db.from("automation_runs").update({ contact_id: data.id }).eq("id", run.id);
  return data.id;
}

const ALLOWED_FIELDS = ["name", "email"];
async function doContactAction(db: Db, run: any, node: AutoNode, ctx: VarContext, onMissing: "fail" | "empty") {
  const c = node.data.config ?? {};
  if (run.simulate) return { simulated: true, config: c };
  const contactId = await ensureContact(db, run);
  if (node.type === "act_add_tag") {
    const { data: tag } = await db.from("contact_tags").select("id, workspace_id").eq("id", c.tagId).maybeSingle();
    if (!tag || (run.workspace_id && tag.workspace_id && tag.workspace_id !== run.workspace_id)) throw new PermanentError("Etiqueta inválida para este cliente");
    const { error } = await db.from("contact_tag_assignments").upsert({ contact_id: contactId, tag_id: c.tagId, workspace_id: run.workspace_id }, { onConflict: "contact_id,tag_id", ignoreDuplicates: true });
    if (error) throw new TransientError(error.message);
    return { tag: c.tagId };
  }
  if (node.type === "act_remove_tag") {
    await db.from("contact_tag_assignments").delete().eq("contact_id", contactId).eq("tag_id", c.tagId);
    return { tag: c.tagId };
  }
  const value = renderVars(String(c.value ?? ""), ctx, onMissing);
  const field = String(c.field);
  if (ALLOWED_FIELDS.includes(field)) {
    await db.from("contacts").update({ [field]: value }).eq("id", contactId);
    run.context = { ...run.context, contact: { ...(run.context?.contact ?? {}), [field]: value } };
  } else if (/^fields\.[a-zA-Z0-9_]{1,40}$/.test(field)) {
    const key = field.slice(7);
    const { data: ct } = await db.from("contacts").select("metadata").eq("id", contactId).maybeSingle();
    const meta = { ...((ct?.metadata as any) ?? {}), [key]: value };
    await db.from("contacts").update({ metadata: meta }).eq("id", contactId);
    run.context = { ...run.context, contact: { ...(run.context?.contact ?? {}), fields: meta } };
  } else throw new PermanentError("Campo não permitido");
  await db.from("automation_runs").update({ context: run.context }).eq("id", run.id);
  return { field, value };
}

async function doHandoff(db: Db, run: any, c: any) {
  if (run.simulate) return { simulated: true };
  const { data: conn } = run.connection_id ? await db.from("whatsapp_connections").select("phone_number_id").eq("id", run.connection_id).maybeSingle() : { data: null };
  const q = db.from("wa_conversations").select("id, workspace_id, assigned_user_id").eq("contact_phone", normPhone(run.contact_phone));
  const { data: conv } = conn?.phone_number_id ? await q.eq("phone_number_id", conn.phone_number_id).order("updated_at", { ascending: false }).limit(1).maybeSingle() : { data: null };
  if (!conv) return { handoff: "sem conversa aberta — atendimento verá na próxima mensagem do contato" };
  let agent = conv.assigned_user_id;
  if (!agent && conv.workspace_id) {
    const { data } = await db.rpc("wa_pick_next_agent", { _ws: conv.workspace_id, _roles: ["owner", "admin", "operator"] });
    agent = data ?? null;
  }
  await db.from("wa_conversations").update({ assigned_user_id: agent, assigned_at: agent ? new Date().toISOString() : null, conversation_status: "open" }).eq("id", conv.id);
  if (c.note) await db.from("wa_internal_notes").insert({ conversation_id: conv.id, workspace_id: conv.workspace_id, body: `Automação: ${c.note}` }).then(() => null, () => null);
  return { conversation_id: conv.id, assigned_user_id: agent };
}

// ───────────── HTTP seguro ─────────────
export function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h === "metadata.google.internal") return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224) return true;
  }
  if (h.includes(":")) {
    if (h === "::1" || h === "::" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80") || h.startsWith("::ffff:")) return true;
  }
  if (/^\d+$/.test(h) || /^0x/i.test(h)) return true; // IP em formato numérico/hex
  return false;
}

async function doHttp(run: any, c: any, ctx: VarContext, onMissing: "fail" | "empty") {
  const url = renderVars(String(c.url ?? ""), ctx, onMissing);
  let u: URL;
  try { u = new URL(url); } catch { throw new PermanentError("URL inválida"); }
  if (u.protocol !== "https:") throw new PermanentError("Somente HTTPS");
  if (isBlockedHost(u.hostname)) throw new PermanentError("Destino interno/privado bloqueado");
  if (u.port && !["443", ""].includes(u.port)) throw new PermanentError("Porta não permitida");
  const headers: Record<string, string> = { "User-Agent": "NextDisparos-Automations/1" };
  for (const line of String(c.headers ?? "").split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) headers[line.slice(0, i).trim()] = renderVars(line.slice(i + 1).trim(), ctx, onMissing);
  }
  const method = ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(String(c.method).toUpperCase()) ? String(c.method).toUpperCase() : "POST";
  const body = method === "GET" ? undefined : renderVars(String(c.body ?? ""), ctx, onMissing);
  if (body && !Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) headers["Content-Type"] = "application/json";
  if (run.simulate) return { simulated: true, method, url: u.origin + u.pathname };

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(u.toString(), { method, headers, body, redirect: "manual", signal: ctrl.signal });
    if (res.status >= 300 && res.status < 400) throw new PermanentError("Redirecionamentos não são seguidos");
    const reader = res.body?.getReader();
    let total = 0;
    const chunks: Uint8Array[] = [];
    const LIMIT = 64 * 1024;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > LIMIT) { await reader.cancel(); throw new PermanentError("Resposta maior que 64 KB"); }
        chunks.push(value);
      }
    }
    const text = new TextDecoder().decode(chunks.length ? concat(chunks) : new Uint8Array());
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* texto puro */ }
    if (res.status >= 500 || res.status === 429) throw new TransientError(`HTTP ${res.status}`);
    if (res.status >= 400) throw new PermanentError(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    return { status: res.status, body: json ?? text.slice(0, 2000) };
  } catch (e: any) {
    if (e instanceof PermanentError || e instanceof TransientError) throw e;
    throw new TransientError(e?.name === "AbortError" ? "Tempo esgotado (10s)" : (e?.message ?? "Falha de rede"));
  } finally { clearTimeout(t); }
}
function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.byteLength; }
  return out;
}

// ───────────── Status de entrega (webhook) ─────────────
export async function applyDeliveryStatus(db: Db, wamid: string, status: string, tsIso: string, errors?: any) {
  const { data: step } = await db.from("automation_run_steps").select("id, delivery_status, output").eq("wamid", wamid).maybeSingle();
  if (!step) return false;
  const merged = mergeDeliveryStatus(step.delivery_status, status);
  const output = { ...(step.output ?? {}), [`${status}_at`]: (step.output ?? {})[`${status}_at`] ?? tsIso, ...(errors ? { errors } : {}) };
  await db.from("automation_run_steps").update({ delivery_status: merged, delivery_updated_at: tsIso, output }).eq("id", step.id);
  return true;
}

// ───────────── Eventos e gatilhos ─────────────
async function activeAutomations(db: Db, triggerType: string, filter: { workspaceId?: string | null; connectionId?: string | null }) {
  let q = db.from("automations").select("id, workspace_id, connection_id, published_version_id").eq("status", "active").eq("trigger_type", triggerType).not("published_version_id", "is", null);
  if (filter.workspaceId) q = q.eq("workspace_id", filter.workspaceId);
  if (filter.connectionId) q = q.eq("connection_id", filter.connectionId);
  const { data } = await q;
  return data ?? [];
}

async function triggerConfig(db: Db, versionId: string) {
  const { data } = await db.from("automation_versions").select("graph").eq("id", versionId).maybeSingle();
  return (data?.graph as AutoGraph)?.nodes.find((n) => isTrigger(n.type))?.data.config ?? {};
}

export async function processEvents(db: Db, limit = 50) {
  const { data: evs } = await db.from("automation_events").select("*").eq("status", "pending").order("received_at").limit(limit);
  for (const ev of evs ?? []) {
    try {
      await handleEvent(db, ev);
      await db.from("automation_events").update({ status: "done", processed_at: new Date().toISOString(), error: null }).eq("id", ev.id);
    } catch (e: any) {
      const attempts = (ev.attempts ?? 0) + 1;
      await db.from("automation_events").update({ attempts, error: e?.message ?? String(e), status: attempts >= 5 ? "failed" : "pending" }).eq("id", ev.id);
    }
  }
}

async function handleEvent(db: Db, ev: any): Promise<boolean> {
  const p = ev.payload ?? {};
  if (ev.event_type === "contact_created" || ev.event_type === "tag_added") {
    const { data: ct } = await db.from("contacts").select("id, phone, workspace_id").eq("id", p.contact_id).maybeSingle();
    if (!ct?.phone) return false;
    for (const a of await activeAutomations(db, ev.event_type, { workspaceId: ct.workspace_id })) {
      if (ev.event_type === "tag_added") {
        const cfg = await triggerConfig(db, a.published_version_id);
        if (cfg.tagId && cfg.tagId !== p.tag_id) continue;
      }
      await startRun(db, { automationId: a.id, versionId: a.published_version_id, triggerType: ev.event_type, contactId: ct.id, triggerData: p, dedupKey: `${ev.dedup_key}:${a.id}` });
    }
    return false;
  }
  if (ev.event_type === "message_received") {
    // 1) Resposta para uma espera ativa consome a mensagem (não inicia novos fluxos).
    const consumed = await consumeReply(db, { connectionId: p.connection_id, phone: p.from, text: p.text ?? "", buttonId: p.button_id, buttonTitle: p.button_title, wamid: p.wamid });
    if (consumed) return true;
    // 2) Resposta a um Direct Send vinculado a uma automação ("Resposta a um disparo").
    //    Um fluxo por lead por disparo; respostas seguintes vão para a espera do fluxo (se houver).
    if (p.campaign_id) {
      const { data: camp } = await db.from("wa_campaigns").select("id, workspace_id, direct_config").eq("id", p.campaign_id).maybeSingle();
      const autoId = (camp?.direct_config as any)?.automation_id;
      if (autoId) {
        const { data: a } = await db.from("automations").select("id, status, trigger_type, published_version_id, workspace_id").eq("id", autoId).maybeSingle();
        if (a && a.status === "active" && a.trigger_type === "campaign_reply" && a.published_version_id && (!a.workspace_id || !camp.workspace_id || a.workspace_id === camp.workspace_id)) {
          await startRun(db, {
            automationId: a.id, versionId: a.published_version_id, triggerType: "campaign_reply", contactPhone: p.from,
            triggerData: { campaign_id: p.campaign_id, text: p.text, button_id: p.button_id },
            message: { text: p.text, buttonId: p.button_id, buttonTitle: p.button_title },
            dedupKey: `camp:${a.id}:${p.campaign_id}:${normPhone(p.from)}`,
          });
          return true;
        }
      }
    }
    // 3) Gatilho "mensagem recebida".
    let started = false;
    for (const a of await activeAutomations(db, "message_received", { connectionId: p.connection_id })) {
      const cfg = await triggerConfig(db, a.published_version_id);
      if (cfg.keyword && !evalCompare(cfg.match === "equals" ? "equals" : cfg.match === "starts_with" ? "starts_with" : "contains", p.text, cfg.keyword)) continue;
      const { data: active } = await db.from("automation_runs").select("id").eq("automation_id", a.id).eq("contact_phone", normPhone(p.from)).in("status", ["pending", "running", "waiting"]).limit(1);
      if (active?.length) continue; // não duplica fluxo em andamento para o mesmo contato
      started = true;
      await startRun(db, { automationId: a.id, versionId: a.published_version_id, triggerType: "message_received", contactPhone: p.from, triggerData: { text: p.text }, message: { text: p.text, buttonId: p.button_id, buttonTitle: p.button_title }, dedupKey: `msg:${a.id}:${p.wamid}` });
    }
    return started;
  }
  return false;
}

export async function processScheduled(db: Db) {
  const { data: autos } = await db.from("automations").select("id, workspace_id, published_version_id").eq("status", "active").eq("trigger_type", "scheduled").is("schedule_fired_at", null);
  for (const a of autos ?? []) {
    const cfg = await triggerConfig(db, a.published_version_id);
    if (!cfg.at || Date.parse(cfg.at) > Date.now()) continue;
    const { data: claimed } = await db.from("automations").update({ schedule_fired_at: new Date().toISOString() }).eq("id", a.id).is("schedule_fired_at", null).select("id");
    if (!claimed?.length) continue;
    const { data: items } = await db.from("contact_list_items").select("contact_id").eq("list_id", cfg.listId).limit(5000);
    for (const it of items ?? []) {
      await startRun(db, { automationId: a.id, versionId: a.published_version_id, triggerType: "scheduled", contactId: it.contact_id, triggerData: { at: cfg.at }, dedupKey: `sched:${a.id}:${cfg.at}:${it.contact_id}` });
    }
  }
}

/** Registra a mensagem recebida como evento durável e processa na hora. */
export async function onInboundMessage(db: Db, args: { campaignId?: string | null; workspaceId: string | null; connectionId: string | null; from: string; text: string; buttonId?: string | null; buttonTitle?: string | null; wamid: string | null }): Promise<boolean> {
  if (!args.wamid) return false;
  const hasWait = await db.from("automation_waits").select("id", { count: "exact", head: true }).eq("status", "waiting").eq("contact_phone", normPhone(args.from));
  const hasTrig = await db.from("automations").select("id", { count: "exact", head: true }).eq("status", "active").eq("trigger_type", "message_received");
  if (!hasWait.count && !hasTrig.count && !args.campaignId) return false;
  const { data: ev, error } = await db.from("automation_events").insert({
    event_type: "message_received", dedup_key: `msg:${args.wamid}`, workspace_id: args.workspaceId,
    payload: { campaign_id: args.campaignId ?? null, connection_id: args.connectionId, from: normPhone(args.from), text: args.text, button_id: args.buttonId ?? null, button_title: args.buttonTitle ?? null, wamid: args.wamid },
  }).select("*").maybeSingle();
  if (error) return false; // duplicado (23505) ou falha: o tick reprocessa pendentes
  try {
    const handled = await handleEvent(db, ev);
    await db.from("automation_events").update({ status: "done", processed_at: new Date().toISOString() }).eq("id", ev.id);
    await processDueJobs(db, `inbound-${args.wamid}`, 3000);
    return handled;
  } catch (e: any) {
    await db.from("automation_events").update({ attempts: 1, error: e?.message ?? String(e) }).eq("id", ev.id);
    return false;
  }
}
