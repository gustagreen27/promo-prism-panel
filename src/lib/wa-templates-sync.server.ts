// Shared sync helper — imports supabaseAdmin, server-only.
import { syncTemplatesFromMeta } from "@/lib/wa-send.server";

const STATUS_MAP: Record<string, string> = {
  APPROVED: "approved",
  PENDING: "pending",
  IN_APPEAL: "pending",
  PENDING_DELETION: "pending",
  REJECTED: "rejected",
  PAUSED: "paused",
  DISABLED: "disabled",
};

export async function syncConnectionTemplates(
  supabase: any,
  conn: { id: string; waba_id: string | null; access_token: string | null; graph_api_version?: string | null }
) {
  if (!conn.waba_id || !conn.access_token) {
    return { connection_id: conn.id, ok: false, error: "missing_waba_or_token", synced: 0, total: 0 };
  }
  try {
    const list = await syncTemplatesFromMeta({
      wabaId: conn.waba_id,
      accessToken: conn.access_token,
      graphVersion: conn.graph_api_version || "v21.0",
    });
    let upserted = 0;
    for (const t of list) {
      const comps = t.components || [];
      const body = comps.find((c: any) => c.type === "BODY");
      const header = comps.find((c: any) => c.type === "HEADER");
      const footer = comps.find((c: any) => c.type === "FOOTER");
      const buttons = comps.find((c: any) => c.type === "BUTTONS");
      const variables =
        body?.text?.match(/\{\{\d+\}\}/g)?.map((v: string) => v.replace(/[{}]/g, "")) ?? [];
      const status = STATUS_MAP[String(t.status || "").toUpperCase()] || "pending";
      const rejection_reason = t.rejected_reason ?? t.rejection_reason ?? null;

      const { error } = await supabase.from("whatsapp_templates").upsert(
        {
          connection_id: conn.id,
          meta_template_id: t.id ?? null,
          name: t.name,
          language: t.language,
          category: t.category,
          status,
          rejection_reason,
          header_type: header?.format?.toLowerCase() ?? null,
          header_text: header?.text ?? null,
          body: body?.text ?? "",
          footer: footer?.text ?? null,
          variables,
          buttons: buttons?.buttons ?? [],
          raw: t,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: "connection_id,name,language" }
      );
      if (!error) upserted++;
    }
    return { connection_id: conn.id, ok: true, synced: upserted, total: list.length };
  } catch (e: any) {
    return { connection_id: conn.id, ok: false, error: e?.message ?? "sync_failed", synced: 0, total: 0 };
  }
}

export async function syncAllConnections(supabase: any) {
  const { data: conns, error } = await supabase
    .from("whatsapp_connections")
    .select("id, waba_id, access_token, graph_api_version")
    .not("waba_id", "is", null)
    .not("access_token", "is", null);
  if (error) throw error;
  const results = [];
  for (const c of conns ?? []) results.push(await syncConnectionTemplates(supabase, c));
  const totals = results.reduce(
    (a, r) => ({ synced: a.synced + r.synced, total: a.total + r.total, connections: a.connections + 1, failed: a.failed + (r.ok ? 0 : 1) }),
    { synced: 0, total: 0, connections: 0, failed: 0 }
  );
  return { ...totals, results };
}
