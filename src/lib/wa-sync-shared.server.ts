import { GRAPH_BASE as GRAPH } from "@/lib/meta/graph-version";
import { META_APP_ID } from "@/lib/meta/app-config";
import { PARTNER_BUSINESS_ID } from "@/lib/meta/partner-business";
import { claimSharedWaba } from "@/lib/wa-claim-shared.server";

type Tok = { token: string; source: "manual" | "app" | "global" };

function tokens(manual?: string | null): Tok[] {
  const out: Tok[] = [];
  if (manual && manual.trim().length > 20) out.push({ token: manual.trim(), source: "manual" });
  const global = process.env.WHATSAPP_ACCESS_TOKEN;
  if (global) out.push({ token: global, source: "global" });
  const appSecret = process.env.META_APP_SECRET;
  if (appSecret) out.push({ token: `${META_APP_ID}|${appSecret}`, source: "app" });
  return out;
}

async function graph(path: string, token: string) {
  const res = await fetch(`${GRAPH}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const json: any = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
}

export type SyncSharedResult = {
  business_id: string;
  discovered: number;
  imported: Array<{ waba_id: string; waba_name: string | null; numbers: number; created: boolean }>;
  skipped: Array<{ waba_id: string; reason: string }>;
  error?: string;
};

/**
 * Consulta as WABAs compartilhadas com a nossa Tech Provider (Business da PSB)
 * após o onboarding hospedado da Meta e importa cada uma para whatsapp_wabas /
 * whatsapp_connections, assinando o app nos webhooks.
 */
export async function syncSharedWabas(
  supabase: any,
  input: {
    access_token?: string | null;
    business_id?: string | null;
    workspace_id?: string | null;
    client_id?: string | null;
    project_id?: string | null;
  } = {},
): Promise<SyncSharedResult> {
  const businessId = (input.business_id || PARTNER_BUSINESS_ID).trim();
  const cands = tokens(input.access_token);
  if (!cands.length) throw new Error("Nenhum System User Access Token disponível no servidor.");

  const edges = ["client_whatsapp_business_accounts", "owned_whatsapp_business_accounts"];
  const found = new Map<string, string | null>(); // waba_id -> name
  let lastError = "";
  let anyOk = false;

  for (const cand of cands) {
    for (const edge of edges) {
      let path: string | null = `/${businessId}/${edge}?fields=id,name&limit=200`;
      let guard = 0;
      while (path && guard++ < 10) {
        const r: { ok: boolean; json: any } = await graph(path, cand.token);
        if (!r.ok) {
          lastError = r.json?.error?.message ?? lastError;
          break;
        }
        anyOk = true;
        for (const w of r.json?.data ?? []) {
          if (w?.id) found.set(String(w.id), w?.name ?? null);
        }
        const next: string | undefined = r.json?.paging?.next;
        path = next ? next.replace(GRAPH, "") : null;
      }
    }
    if (found.size) break;
  }

  if (!anyOk && !found.size) {
    throw new Error(
      lastError ||
        `Não foi possível consultar as contas compartilhadas do Business ${businessId}. Verifique o System User Access Token.`,
    );
  }

  const existing = await supabase.from("whatsapp_wabas").select("waba_id");
  const known = new Set<string>((existing.data ?? []).map((r: any) => String(r.waba_id)));

  const imported: SyncSharedResult["imported"] = [];
  const skipped: SyncSharedResult["skipped"] = [];

  for (const [wabaId, name] of found) {
    try {
      const r = await claimSharedWaba(supabase, {
        waba_id: wabaId,
        access_token: input.access_token ?? null,
        nome_interno: name ?? null,
        workspace_id: known.has(wabaId) ? null : input.workspace_id ?? null,
        client_id: known.has(wabaId) ? null : input.client_id ?? null,
        project_id: known.has(wabaId) ? null : input.project_id ?? null,
      });
      imported.push({
        waba_id: wabaId,
        waba_name: r.waba_name ?? name,
        numbers: r.numbers,
        created: !known.has(wabaId),
      });
    } catch (e: any) {
      skipped.push({ waba_id: wabaId, reason: e?.message ?? "Falha ao importar" });
    }
  }

  return {
    business_id: businessId,
    discovered: found.size,
    imported,
    skipped,
    ...(lastError && !found.size ? { error: lastError } : {}),
  };
}
