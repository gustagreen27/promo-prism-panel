import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Sincroniza números de WhatsApp de uma (ou todas) WABAs a partir da Meta Graph API.
 *
 * Campos SOBRESCRITOS (sempre) — dados oficiais da Meta:
 *   phone_number_id, display_phone, phone (dígitos), display_name, verified_name,
 *   quality_rating, messaging_limit, code_verification_status,
 *   business_id, waba_id, last_seen_at, last_synced_at, meta_sync_status
 *
 * Campos PRESERVADOS (nunca tocados no update):
 *   nome_interno, name (apelido interno), notes, workspace_id, client_id, project_id,
 *   visibility, daily_cap, daily_limit, paused_at, quality_visible_to_client,
 *   verify_token, webhook_url, api_key, provider (mantém), graph_api_version
 *
 * Números que não voltam mais da Meta viram meta_sync_status='disconnected' e ganham
 * last_seen_at preservado; nunca são apagados automaticamente.
 */

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

type SyncStats = {
  waba_ref_id: string;
  waba_id: string;
  total_from_meta: number;
  created: number;
  updated: number;
  marked_missing: number;
  error?: string;
};

/** Roda o sync de uma única WABA. Reutilizável pelo cron. */
async function syncOneWaba(supabase: any, wabaRow: {
  id: string;
  waba_id: string;
  business_id: string | null;
  access_token: string | null;
  client_id: string | null;
  project_id: string | null;
  workspace_id: string | null;
}): Promise<SyncStats> {
  const stats: SyncStats = {
    waba_ref_id: wabaRow.id,
    waba_id: wabaRow.waba_id,
    total_from_meta: 0,
    created: 0,
    updated: 0,
    marked_missing: 0,
  };

  const { fetchWabaPhoneNumbers } = await import("@/lib/wa-meta.server");

  let nums: any[] = [];
  try {
    nums = await fetchWabaPhoneNumbers(wabaRow.waba_id, wabaRow.access_token);
  } catch (e: any) {
    stats.error = e?.message ?? "Falha ao consultar Meta";
    await supabase.from("whatsapp_wabas").update({
      last_synced_at: new Date().toISOString(),
      last_sync_error: stats.error,
    }).eq("id", wabaRow.id);
    return stats;
  }
  stats.total_from_meta = nums.length;

  const now = new Date().toISOString();
  const seenPhoneNumberIds: string[] = [];

  // Existing rows for this WABA (to preserve internal fields and detect missing)
  const { data: existingRows } = await supabase
    .from("whatsapp_connections")
    .select("id, phone_number_id")
    .eq("waba_ref_id", wabaRow.id);
  const existingByPnId = new Map<string, string>(
    (existingRows ?? []).filter((r: any) => r.phone_number_id).map((r: any) => [r.phone_number_id, r.id]),
  );

  for (const n of nums) {
    if (!n?.id) continue;
    seenPhoneNumberIds.push(n.id);

    // Meta-owned fields (always overwritten)
    const metaPatch = {
      phone_number_id: n.id,
      waba_id: wabaRow.waba_id,
      business_id: wabaRow.business_id,
      display_phone: n.display_phone_number ?? null,
      display_name: n.verified_name ?? null,
      verified_name: n.verified_name ?? null,
      phone: (n.display_phone_number || "").replace(/\D/g, "") || null,
      quality_rating: n.quality_rating ?? null,
      messaging_limit: n.messaging_limit_tier ?? null,
      code_verification_status: n.code_verification_status ?? null,
      last_seen_at: now,
      last_synced_at: now,
      meta_sync_status: "connected",
    };

    const existingId = existingByPnId.get(n.id);
    if (existingId) {
      // UPDATE: only Meta fields, preserve everything else (nome_interno, workspace_id, notes...)
      await supabase.from("whatsapp_connections").update(metaPatch).eq("id", existingId);
      stats.updated++;
    } else {
      // INSERT: also seed internal defaults from the WABA
      const label = n.verified_name || n.display_phone_number || `Número ${String(n.id).slice(-6)}`;
      await supabase.from("whatsapp_connections").insert({
        ...metaPatch,
        waba_ref_id: wabaRow.id,
        client_id: wabaRow.client_id,
        project_id: wabaRow.project_id,
        workspace_id: wabaRow.workspace_id,
        name: label,
        nome_interno: label,
        provider: "meta_cloud",
        graph_api_version: "v21.0",
        access_token: wabaRow.access_token,
        status: n.code_verification_status === "VERIFIED" ? "ativa" : "aguardando_verificacao",
      });
      stats.created++;
    }
  }

  // Mark missing numbers as disconnected (never delete)
  const seenSet = new Set(seenPhoneNumberIds);
  const missingIds: string[] = [];
  for (const [pnId, rowId] of existingByPnId.entries()) {
    if (!seenSet.has(pnId)) missingIds.push(rowId);
  }
  if (missingIds.length) {
    await supabase.from("whatsapp_connections")
      .update({
        meta_sync_status: nums.length === 0 ? "disconnected" : "not_found",
        last_synced_at: now,
      })
      .in("id", missingIds);
    stats.marked_missing = missingIds.length;
  }

  await supabase.from("whatsapp_wabas").update({
    last_synced_at: now,
    last_sync_error: null,
  }).eq("id", wabaRow.id);

  return stats;
}

/** Sincroniza uma WABA específica. */
export const syncWabaNumbers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ waba_ref_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: waba, error } = await context.supabase
      .from("whatsapp_wabas")
      .select("id, waba_id, business_id, access_token, client_id, project_id, workspace_id")
      .eq("id", data.waba_ref_id)
      .single();
    if (error) throw error;
    if (!waba?.waba_id) throw new Error("WABA sem waba_id");
    return await syncOneWaba(context.supabase, waba as any);
  });

/** Sincroniza todas as WABAs ativas. */
export const syncAllWabas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data: wabas, error } = await context.supabase
      .from("whatsapp_wabas")
      .select("id, waba_id, business_id, access_token, client_id, project_id, workspace_id, status")
      .neq("status", "suspenso");
    if (error) throw error;

    const results: SyncStats[] = [];
    for (const w of wabas ?? []) {
      try {
        results.push(await syncOneWaba(context.supabase, w as any));
      } catch (e: any) {
        results.push({
          waba_ref_id: w.id, waba_id: w.waba_id,
          total_from_meta: 0, created: 0, updated: 0, marked_missing: 0,
          error: e?.message ?? "erro",
        });
      }
    }
    const totals = results.reduce((acc, r) => ({
      wabas: acc.wabas + 1,
      created: acc.created + r.created,
      updated: acc.updated + r.updated,
      marked_missing: acc.marked_missing + r.marked_missing,
      errors: acc.errors + (r.error ? 1 : 0),
    }), { wabas: 0, created: 0, updated: 0, marked_missing: 0, errors: 0 });
    return { totals, results };
  });

export { syncOneWaba as _syncOneWabaInternal };

