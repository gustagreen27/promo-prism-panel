// Integração Pix Inter via ponte externa (Render).
// Motivo: o runtime do painel não apresenta certificado de cliente (mTLS) —
// confirmado em teste: node:https ignora cert/key e o Inter responde 400.
// A ponte guarda certificado + credenciais; aqui só assinamos as chamadas.

type BridgeCob = {
  txid: string;
  status: string; // ATIVA | CONCLUIDA | REMOVIDA_PELO_USUARIO_RECEBEDOR | REMOVIDA_PELO_PSP
  pixCopiaECola?: string;
  expiracao?: number;
  criacao?: string;
  valor?: string;
  pix?: { endToEndId: string; valor: string; horario: string }[];
};

export class BridgeNotConfigured extends Error {}

function cfg() {
  const url = (process.env["INTER_BRIDGE_URL"] ?? "").replace(/\/+$/, "");
  const secret = process.env["INTER_BRIDGE_SECRET"] ?? "";
  if (!url || !secret) throw new BridgeNotConfigured("Pagamento Pix ainda não configurado");
  return { url, secret };
}

async function sha256Hex(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(secret: string, msg: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function bridge<T>(method: "GET" | "PUT", path: string, body?: unknown): Promise<T> {
  const { url, secret } = cfg();
  const raw = body === undefined ? "" : JSON.stringify(body);
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = await hmacHex(secret, `${ts}\n${method}\n${path}\n${await sha256Hex(raw)}`);
  const r = await fetch(url + path, {
    method,
    headers: { "Content-Type": "application/json", "X-Bridge-Timestamp": ts, "X-Bridge-Signature": sig },
    body: raw || undefined,
    signal: AbortSignal.timeout(20000),
  });
  const text = await r.text();
  if (!r.ok) {
    console.error("[inter-bridge]", method, path, r.status, text.slice(0, 500));
    throw new Error(r.status === 401 ? "Ponte Pix recusou a assinatura" : `Falha no Pix (${r.status})`);
  }
  return JSON.parse(text) as T;
}

export const txidFor = (depositId: string) => depositId.replace(/-/g, ""); // 32 caracteres alfanuméricos

export function createCob(depositId: string, amountCents: number, expSeconds: number) {
  return bridge<BridgeCob>("PUT", `/cob/${txidFor(depositId)}`, {
    valor: (amountCents / 100).toFixed(2),
    expiracao: expSeconds,
    solicitacaoPagador: `Créditos next DISPAROS ${depositId.slice(0, 8)}`,
  });
}

export function getCob(txid: string) {
  return bridge<BridgeCob>("GET", `/cob/${txid}`);
}

const toCents = (v: string) => Math.round(Number(v) * 100);

/** Consulta o Inter e credita se pago. Seguro para chamar várias vezes. */
export async function checkDeposit(admin: any, dep: any): Promise<string> {
  if (dep.status !== "pending" || !dep.pix_txid) return dep.status;
  let cob: BridgeCob;
  try {
    cob = await getCob(dep.pix_txid);
  } catch (e) {
    await admin.from("deposits").update({
      last_checked_at: new Date().toISOString(),
      check_count: (dep.check_count ?? 0) + 1,
      error_message: String((e as Error).message).slice(0, 200),
    }).eq("id", dep.id);
    return "error";
  }
  const paid = cob.pix?.[0];
  if (cob.status === "CONCLUIDA" && paid) {
    const total = (cob.pix ?? []).reduce((s, p) => s + toCents(p.valor), 0);
    const { data, error } = await admin.rpc("confirm_pix_deposit", {
      _deposit_id: dep.id, _e2eid: paid.endToEndId, _paid_cents: total,
    });
    if (error) throw error;
    return String(data);
  }
  const expired = dep.pix_expires_at && Date.now() > new Date(dep.pix_expires_at).getTime() + 5 * 60_000;
  const removed = cob.status.startsWith("REMOVIDA");
  await admin.from("deposits").update({
    last_checked_at: new Date().toISOString(),
    check_count: (dep.check_count ?? 0) + 1,
    provider_status: cob.status,
    error_message: null,
    ...(expired || removed ? { status: expired ? "expired" : "cancelled" } : {}),
  }).eq("id", dep.id).eq("status", "pending");
  return expired ? "expired" : removed ? "cancelled" : "pending";
}
