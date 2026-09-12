import { GRAPH_BASE as GRAPH, GRAPH_VERSION } from "@/lib/meta/graph-version";
import { META_APP_ID } from "@/lib/meta/app-config";

export type ClaimResult = {
  ok: true;
  waba_ref_id: string;
  waba_id: string;
  waba_name: string | null;
  business_id: string | null;
  numbers: number;
  webhook_subscribed: boolean;
  token_source: "manual" | "app" | "global";
};

function candidateTokens(manual?: string | null): Array<{ token: string; source: ClaimResult["token_source"] }> {
  const out: Array<{ token: string; source: ClaimResult["token_source"] }> = [];
  if (manual && manual.trim().length > 20) out.push({ token: manual.trim(), source: "manual" });
  const appSecret = process.env.META_APP_SECRET;
  if (appSecret) out.push({ token: `${META_APP_ID}|${appSecret}`, source: "app" });
  const global = process.env.WHATSAPP_ACCESS_TOKEN;
  if (global) out.push({ token: global, source: "global" });
  return out;
}

async function graph(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
  });
  const json: any = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

/**
 * Importa uma WABA que já foi compartilhada com o nosso app/BM (via link oficial
 * de onboarding da Meta, que NÃO devolve callback para o sistema).
 * Descobre nome, business, números e inscreve o app nos webhooks.
 */
export async function claimSharedWaba(
  supabase: any,
  input: {
    waba_id: string;
    access_token?: string | null;
    nome_interno?: string | null;
    workspace_id?: string | null;
    client_id?: string | null;
    project_id?: string | null;
  },
): Promise<ClaimResult> {
  const tokens = candidateTokens(input.access_token);
  if (!tokens.length) throw new Error("Nenhum token disponível para consultar a Meta.");

  let picked: { token: string; source: ClaimResult["token_source"] } | null = null;
  let waba: any = null;
  let lastError = "Não foi possível ler a WABA na Meta.";

  for (const cand of tokens) {
    const r = await graph(
      `/${input.waba_id}?fields=id,name,currency,timezone_id,on_behalf_of_business_info,owner_business_info`,
      cand.token,
    );
    if (r.ok && r.json?.id) {
      picked = cand;
      waba = r.json;
      break;
    }
    lastError = r.json?.error?.message ?? lastError;
  }

  if (!picked || !waba) {
    throw new Error(
      `${lastError} — compartilhar a conta com a BM não dá acesso automático via API. Gere um token de usuário do sistema com acesso a esta WABA e informe no campo "Token".`,
    );
  }

  const businessId: string | null =
    waba?.on_behalf_of_business_info?.id ?? waba?.owner_business_info?.id ?? null;

  const pn = await graph(
    `/${input.waba_id}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,messaging_limit_tier,code_verification_status,status&limit=200`,
    picked.token,
  );
  const numbers: any[] = Array.isArray(pn.json?.data) ? pn.json.data : [];

  const sub = await graph(`/${input.waba_id}/subscribed_apps`, picked.token, { method: "POST" });

  // Workspace: se não informado, usa o workspace padrão (primeiro) para que a
  // WABA e os números SEMPRE apareçam em Conexões — nunca ficam órfãos.
  let workspaceId = input.workspace_id ?? null;
  if (!workspaceId) {
    const ws = await supabase
      .from("workspaces")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    workspaceId = ws.data?.id ?? null;
  }

  // Upsert WABA
  const nome = input.nome_interno?.trim() || waba?.name || `WABA ${input.waba_id.slice(-6)}`;
  const existing = await supabase.from("whatsapp_wabas").select("id, workspace_id").eq("waba_id", input.waba_id).maybeSingle();
  const wabaPayload: Record<string, any> = {
    nome_interno: nome,
    waba_id: input.waba_id,
    business_id: businessId,
    status: "ativo",
    onboarded_via: "shared_link",
    onboarded_at: new Date().toISOString(),
    workspace_id: workspaceId,
    client_id: input.client_id ?? null,
    project_id: input.project_id ?? null,
  };
  if (picked.source === "manual") wabaPayload.access_token = picked.token;

  let wabaRefId: string;
  if (existing.data?.id) {
    wabaRefId = existing.data.id;
    const patch = { ...wabaPayload };
    if (!input.workspace_id) delete patch.workspace_id;
    if (!input.client_id) delete patch.client_id;
    if (!input.project_id) delete patch.project_id;
    await supabase.from("whatsapp_wabas").update(patch).eq("id", wabaRefId);
  } else {
    const ins = await supabase.from("whatsapp_wabas").insert(wabaPayload).select("id").single();
    if (ins.error) throw ins.error;
    wabaRefId = ins.data.id;
  }

  // Upsert números
  for (const p of numbers) {
    const label = p.verified_name || p.display_phone_number || `Número ${String(p.id).slice(-6)}`;
    const payload: Record<string, any> = {
      waba_ref_id: wabaRefId,
      waba_id: input.waba_id,
      business_id: businessId,
      phone_number_id: String(p.id),
      display_phone: p.display_phone_number ?? null,
      phone: String(p.display_phone_number || "").replace(/\D/g, "") || null,
      display_name: p.verified_name ?? null,
      name: label,
      quality_rating: p.quality_rating ?? null,
      messaging_limit: p.messaging_limit_tier ?? null,
      provider: "meta_cloud",
      graph_api_version: GRAPH_VERSION,
      status: String(p.code_verification_status || "").toUpperCase() === "VERIFIED" ? "ativo" : "aguardando_verificacao",
      workspace_id: input.workspace_id ?? null,
      client_id: input.client_id ?? null,
      project_id: input.project_id ?? null,
      last_seen_at: new Date().toISOString(),
    };
    if (picked.source === "manual") {
      payload.access_token = picked.token;
      payload.use_global_token = false;
    }
    const conn = await supabase
      .from("whatsapp_connections")
      .select("id")
      .eq("phone_number_id", String(p.id))
      .maybeSingle();
    if (conn.data?.id) {
      const patch = { ...payload };
      if (!input.workspace_id) delete patch.workspace_id;
      if (!input.client_id) delete patch.client_id;
      if (!input.project_id) delete patch.project_id;
      await supabase.from("whatsapp_connections").update(patch).eq("id", conn.data.id);
    } else {
      await supabase.from("whatsapp_connections").insert(payload);
    }
  }

  return {
    ok: true,
    waba_ref_id: wabaRefId,
    waba_id: input.waba_id,
    waba_name: waba?.name ?? null,
    business_id: businessId,
    numbers: numbers.length,
    webhook_subscribed: sub.ok,
    token_source: picked.source,
  };
}
