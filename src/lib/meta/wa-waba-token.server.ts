/**
 * Resolução de token para uma conexão (server-only).
 *
 * Ordem de preferência:
 *  1. token da própria conexão (quando não está marcada para usar o global)
 *  2. token da WABA dona do número (whatsapp_wabas.access_token)
 *  3. token global do ambiente (WHATSAPP_ACCESS_TOKEN)
 *
 * Motivo: números de BMs de terceiros não são visíveis pelo token global —
 * a Meta responde "does not exist / missing permissions" (subcode 33).
 */

export type TokenConn = {
  access_token?: string | null;
  use_global_token?: boolean | null;
  waba_ref_id?: string | null;
  waba_id?: string | null;
};

export async function resolveConnectionToken(db: any, conn: TokenConn): Promise<string | null> {
  const own = !conn.use_global_token && conn.access_token ? conn.access_token : null;
  if (own) return own;

  const wabaToken = await loadWabaToken(db, conn);
  if (wabaToken) return wabaToken;

  return process.env["WHATSAPP_ACCESS_TOKEN"] || conn.access_token || null;
}

export async function loadWabaToken(db: any, conn: TokenConn): Promise<string | null> {
  try {
    if (conn.waba_ref_id) {
      const { data } = await db
        .from("whatsapp_wabas")
        .select("access_token")
        .eq("id", conn.waba_ref_id)
        .maybeSingle();
      if (data?.access_token) return data.access_token as string;
    }
    if (conn.waba_id) {
      const { data } = await db
        .from("whatsapp_wabas")
        .select("access_token")
        .eq("waba_id", String(conn.waba_id))
        .maybeSingle();
      if (data?.access_token) return data.access_token as string;
    }
  } catch {
    /* ignora — cai no token global */
  }
  return null;
}
