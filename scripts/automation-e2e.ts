import { createClient } from "@supabase/supabase-js";
import { onInboundMessage, processDueJobs } from "../src/lib/automation-engine.server";
import { replyFlowGraph, responsePaths } from "../src/lib/automation-graph";
import { renderDirectText } from "../src/lib/wa-send.server";
const real = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
// Força modo simulado: nenhum envio real ao WhatsApp, nenhuma distribuição real.
const db: any = new Proxy(real, { get(t: any, k) {
  if (k === "from") return (tbl: string) => { const q = t.from(tbl); if (tbl !== "automation_runs") return q;
    return new Proxy(q, { get(qq: any, kk) { if (kk === "insert") return (row: any) => qq.insert({ ...row, simulate: true }); const v = qq[kk]; return typeof v === "function" ? v.bind(qq) : v; } }); };
  const v = t[k]; return typeof v === "function" ? v.bind(t) : v; } });
const WS = "442e147c-25c5-4ff8-b144-b3ab94856c83", CONN = "29f7e0cc-48fa-4079-83aa-abe27c57ba57";
const ok = (c: boolean, m: string) => { console.log(c ? "PASS" : "FAIL", m); if (!c) process.exitCode = 1; };
const tag = `e2e${Date.now()}`;
const created: any = { camps: [], contacts: [] };
async function main() {
  // 1) troca de nome/telefone por lead
  const msg = "Fala (nome), Patrão aqui! Esse número (telefone) ainda é seu?";
  ok(renderDirectText(msg, { nome: "Ana", telefone: "5562991301856" }) === "Fala Ana, Patrão aqui! Esse número 5562991301856 ainda é seu?", "nome/telefone do lead Ana");
  ok(renderDirectText(msg, { nome: "Bruno", telefone: "5511900000000" }).includes("Bruno") && renderDirectText(msg, { nome: "Bruno", telefone: "5511900000000" }).includes("5511900000000"), "nome/telefone do lead Bruno (individual)");
  ok(renderDirectText(msg, { nome: null, telefone: "55" }).startsWith("Fala cliente"), "sem nome usa 'cliente'");

  const graph = replyFlowGraph([{ id: "sim_btn", title: "Sim" }, { id: "nao_btn", title: "Não" }]);
  ok(responsePaths(graph).length === 4, "editor mostra 4 caminhos (2 botões, regra de texto, outra resposta)");
  const { data: a } = await real.from("automations").insert({ name: `[TESTE ${tag}]`, workspace_id: WS, connection_id: CONN, draft_graph: graph, trigger_type: "campaign_reply", status: "draft" }).select("id").single();
  created.auto = a!.id;
  const { data: v, error: ve } = await real.from("automation_versions").insert({ automation_id: a!.id, version: 1, graph }).select("id").single();
  if (ve) throw ve;
  await real.from("automations").update({ status: "active", published_version_id: v!.id }).eq("id", a!.id);
  for (const n of [1, 2]) {
    const { data: c, error } = await real.from("wa_campaigns").insert({ name: `[TESTE ${tag}] ${n}`, workspace_id: WS, status: "draft", direct_config: { automation_id: a!.id } } as any).select("id").single();
    if (error) throw error; created.camps.push(c!.id);
  }
  const [C1, C2] = created.camps;
  const L = (i: number) => `55000000${tag.slice(-5)}${i}`;
  const inbound = (camp: string, from: string, text: string, buttonId: string | null, wamid: string) =>
    onInboundMessage(db, { campaignId: camp, workspaceId: WS, connectionId: CONN, from, text, buttonId, buttonTitle: buttonId ? text : null, wamid });
  const pathOf = async (phone: string, camp: string) => {
    await processDueJobs(db, `e2e-${tag}`, 8000);
    const { data: runs } = await real.from("automation_runs").select("id,status,trigger_data,simulate").eq("automation_id", a!.id).eq("contact_phone", phone);
    const r = (runs ?? []).filter((x: any) => x.trigger_data?.campaign_id === camp);
    if (r.length !== 1) return { count: r.length, nodes: [] as string[], simulate: null };
    const { data: st } = await real.from("automation_run_steps").select("node_id,started_at").eq("run_id", r[0].id).order("started_at");
    return { count: 1, nodes: (st ?? []).map((s: any) => s.node_id), simulate: r[0].simulate, status: r[0].status };
  };
  ok(await inbound(C1, L(1), "Sim", "sim_btn", `${tag}-w1`) === true, "webhook: botão Sim assumido pela automação");
  let p = await pathOf(L(1), C1);
  ok(p.nodes.includes("msg_1") && !p.nodes.includes("msg_2") && !p.nodes.includes("handoff"), `botão Sim → ação do botão 1 [${p.nodes.join(">")}]`);
  ok(p.simulate === true, "execução em modo simulado (sem envio real)");
  await inbound(C1, L(2), "Não", "nao_btn", `${tag}-w2`);
  p = await pathOf(L(2), C1);
  ok(p.nodes.includes("msg_2") && !p.nodes.includes("msg_1"), `botão Não → ação do botão 2 [${p.nodes.join(">")}]`);
  await inbound(C1, L(3), "Sim, pode confirmar", null, `${tag}-w3`);
  p = await pathOf(L(3), C1);
  ok(p.nodes.includes("msg_txt") && !p.nodes.includes("handoff"), `texto "sim" → regra de texto [${p.nodes.join(">")}]`);
  await inbound(C1, L(4), "quanto custa?", null, `${tag}-w4`);
  p = await pathOf(L(4), C1);
  ok(p.nodes.includes("handoff"), `resposta não prevista → atendimento [${p.nodes.join(">")}]`);
  // Mesmo evento de novo (reentrega do webhook)
  const again = await inbound(C1, L(1), "Sim", "sim_btn", `${tag}-w1`);
  p = await pathOf(L(1), C1);
  ok(again === false && p.count === 1, "mesmo evento reenviado: nenhuma execução/mensagem nova");
  const { count: sends } = await real.from("automation_run_steps").select("id", { count: "exact", head: true }).eq("node_id", "msg_1").in("run_id", (await real.from("automation_runs").select("id").eq("automation_id", a!.id).eq("contact_phone", L(1))).data!.map((x: any) => x.id));
  ok(sends === 1, "mensagem do botão registrada uma única vez");
  // Nova resposta (outro wamid) do mesmo lead no mesmo disparo → não reinicia fluxo
  await inbound(C1, L(1), "Sim", "sim_btn", `${tag}-w1b`);
  p = await pathOf(L(1), C1);
  ok(p.count === 1, "segundo toque no mesmo disparo não duplica o fluxo");
  // Mesmo lead em outro disparo
  await inbound(C2, L(1), "Não", "nao_btn", `${tag}-w5`);
  const p2 = await pathOf(L(1), C2);
  ok(p2.count === 1 && p2.nodes.includes("msg_2"), `mesmo lead em outro disparo: fluxo próprio [${p2.nodes.join(">")}]`);
  // Automação despublicada → não assume (resposta antiga do disparo continua valendo)
  await real.from("automations").update({ status: "paused" }).eq("id", a!.id);
  ok(await inbound(C1, L(6), "Sim", "sim_btn", `${tag}-w6`) === false, "automação pausada não responde");
}
main().catch((e) => { console.error("ERRO", e); process.exitCode = 1; }).finally(async () => {
  if (created.auto) {
    const runs = (await real.from("automation_runs").select("id").eq("automation_id", created.auto)).data?.map((x: any) => x.id) ?? [];
    if (runs.length) { await real.from("automation_jobs").delete().in("run_id", runs); await real.from("automation_waits").delete().in("run_id", runs); await real.from("automation_run_steps").delete().in("run_id", runs); await real.from("automation_runs").delete().in("id", runs); }
    await real.from("automations").update({ published_version_id: null }).eq("id", created.auto);
    await real.from("automation_versions").delete().eq("automation_id", created.auto);
    await real.from("automations").delete().eq("id", created.auto);
  }
  await real.from("automation_events").delete().like("dedup_key", `%${tag}%`);
  if (created.camps.length) await real.from("wa_campaigns").delete().in("id", created.camps);
  console.log("limpeza concluída");
});
